import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const WORKOUTS_FILE = path.join(DATA_DIR, "workouts.json");
const EXERCISES_FILE = path.join(DATA_DIR, "exercises.json");
const DEFAULT_DB_NAME = "dynamicfit";

let storePromise;

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallbackValue;
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

function sortExercises(exercises) {
  return [...exercises].sort((a, b) => a.name.localeCompare(b.name));
}

function sortWorkouts(workouts) {
  return [...workouts].sort((a, b) => b.date.localeCompare(a.date));
}

function createFileStore() {
  return {
    mode: "file",
    async getUserByEmail(email) {
      const users = await readJson(USERS_FILE, []);
      return users.find((user) => user.email === email || user.username === email) ?? null;
    },
    async createUser(user) {
      const users = await readJson(USERS_FILE, []);
      const existingUser = users.find(
        (record) => record.email === user.email || record.username === user.email
      );

      if (existingUser) {
        const error = new Error("Email already registered");
        error.code = "E_DUPLICATE_EMAIL";
        throw error;
      }

      users.push({
        ...user,
        createdAt: new Date().toISOString(),
      });
      await writeJson(USERS_FILE, users);
      return user;
    },
    async updateUserByEmail(email, updates) {
      const users = await readJson(USERS_FILE, []);
      const userIndex = users.findIndex(
        (user) => user.email === email || user.username === email
      );

      if (userIndex < 0) {
        return null;
      }

      users[userIndex] = {
        ...users[userIndex],
        ...updates,
      };
      await writeJson(USERS_FILE, users);
      return users[userIndex];
    },
    async listExercises() {
      const exercises = await readJson(EXERCISES_FILE, []);
      return sortExercises(exercises);
    },
    async seedExercises(exercises) {
      const existing = await readJson(EXERCISES_FILE, []);
      if (existing.length > 0) {
        return existing.length;
      }
      await writeJson(EXERCISES_FILE, sortExercises(exercises));
      return exercises.length;
    },
    async replaceExercises(exercises) {
      await writeJson(EXERCISES_FILE, sortExercises(exercises));
      return exercises.length;
    },
    async listWorkoutsByEmail(email) {
      const store = await readJson(WORKOUTS_FILE, {});
      const workouts = Object.entries(store).flatMap(([owner, items]) =>
        (items ?? []).map((workout) => ({
          ...workout,
          owner,
          email: workout.email || workout.username || owner,
        }))
      );

      return sortWorkouts(
        workouts.filter(
          (workout) =>
            workout.email === email || workout.username === email || workout.owner === email
        )
      );
    },
    async createWorkout(workout) {
      const store = await readJson(WORKOUTS_FILE, {});
      const current = store[workout.email] ?? [];
      store[workout.email] = sortWorkouts([workout, ...current]);
      await writeJson(WORKOUTS_FILE, store);
      return workout;
    },
    async getWorkoutById(id, email) {
      const store = await readJson(WORKOUTS_FILE, {});
      const userWorkouts = store[email] ?? [];
      return userWorkouts.find((w) => w.id === id) ?? null;
    },
    async updateWorkout(id, email, updates) {
      const store = await readJson(WORKOUTS_FILE, {});
      const current = store[email] ?? [];
      const index = current.findIndex((w) => w.id === id);
      if (index === -1) return null;
      const updated = { ...current[index], ...updates };
      current[index] = updated;
      store[email] = sortWorkouts(current);
      await writeJson(WORKOUTS_FILE, store);
      return updated;
    },
    async deleteWorkout(id, email) {
      const store = await readJson(WORKOUTS_FILE, {});
      const current = store[email] ?? [];
      const index = current.findIndex((w) => w.id === id);
      if (index === -1) return false;
      current.splice(index, 1);
      store[email] = current;
      await writeJson(WORKOUTS_FILE, store);
      return true;
    },
    async close() {},
  };
}

async function createMongoStore() {
  let MongoClient;

  try {
    ({ MongoClient } = await import("mongodb"));
  } catch (error) {
    throw new Error(
      "MongoDB support requires the 'mongodb' package. Run `npm install -w express-backend mongodb` once network access is available."
    );
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  const db = client.db(process.env.MONGODB_DB_NAME || DEFAULT_DB_NAME);
  const users = db.collection("users");
  const workouts = db.collection("workouts");
  const exercises = db.collection("exercises");

  await Promise.all([
    users.createIndex({ username: 1 }, { unique: true }),
    users.createIndex(
      { email: 1 },
      { unique: true, partialFilterExpression: { email: { $type: "string" } } }
    ),
    workouts.createIndex({ username: 1, date: -1 }),
    workouts.createIndex({ email: 1, date: -1 }),
    exercises.createIndex({ id: 1 }, { unique: true }),
  ]);

  return {
    mode: "mongo",
    async getUserByEmail(email) {
      return users.findOne({
        $or: [{ email }, { username: email }],
      });
    },
    async createUser(user) {
      const record = {
        ...user,
        createdAt: new Date().toISOString(),
      };
      await users.insertOne(record);
      return record;
    },
    async updateUserByEmail(email, updates) {
      const result = await users.findOneAndUpdate(
        { $or: [{ email }, { username: email }] },
        { $set: updates },
        { returnDocument: "after" }
      );
      return result || null;
    },
    async listExercises() {
      return exercises.find({}).sort({ name: 1 }).toArray();
    },
    async seedExercises(seedData) {
      const count = await exercises.countDocuments();
      if (count > 0) {
        return count;
      }
      if (seedData.length > 0) {
        await exercises.insertMany(seedData);
      }
      return seedData.length;
    },
    async replaceExercises(seedData) {
      await exercises.deleteMany({});
      if (seedData.length > 0) {
        await exercises.insertMany(seedData);
      }
      return seedData.length;
    },
    async listWorkoutsByEmail(email) {
      return workouts
        .find({
          $or: [{ email }, { username: email }],
        })
        .sort({ date: -1 })
        .toArray();
    },
    async createWorkout(workout) {
      await workouts.insertOne(workout);
      return workout;
    },
    async getWorkoutById(id, email) {
      return workouts.findOne({
        id,
        $or: [{ email }, { username: email }],
      });
    },
    async updateWorkout(id, email, updates) {
      const result = await workouts.findOneAndUpdate(
        { id, $or: [{ email }, { username: email }] },
        { $set: updates },
        { returnDocument: "after" }
      );
      return result ?? null;
    },
    async deleteWorkout(id, email) {
      const result = await workouts.deleteOne({
        id,
        $or: [{ email }, { username: email }],
      });
      return result.deletedCount > 0;
    },
    async close() {
      await client.close();
    },
  };
}

async function createStore() {
  if (process.env.MONGODB_URI) {
    return createMongoStore();
  }

  return createFileStore();
}

export async function getDataStore() {
  if (!storePromise) {
    storePromise = createStore();
  }
  return storePromise;
}

export async function closeDataStore() {
  if (!storePromise) {
    return;
  }

  const store = await storePromise;
  await store.close();
  storePromise = undefined;
}
