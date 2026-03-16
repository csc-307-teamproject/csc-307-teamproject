import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { authenticateUser, registerUser, loginUser } from "./auth.js";
import { closeDataStore, getDataStore } from "./dataStore.js";
import {
  curateExerciseCatalog,
  LOCAL_EXERCISE_SEED,
  fetchWgerExercises,
  normalizeExerciseSeed,
} from "./exerciseSeedData.js";

dotenv.config();

if (!process.env.TOKEN_SECRET) {
  console.error("Missing TOKEN_SECRET in packages/express-backend/.env");
  process.exit(1);
}

const app = express();
const port = 8000;
const REMOTE_EXERCISE_TARGET = 400;
const REMOTE_EXERCISE_MINIMUM = 120;

app.use(cors());
app.use(express.json());

// --- per-user workout data (persisted to JSON) ---
function isoDate(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function sanitizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeWorkoutExercises(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((exercise, index) => {
      const name = sanitizeText(exercise?.name);
      if (!name) {
        return null;
      }

      return {
        id: sanitizeText(exercise?.id, `entry-${index + 1}`),
        exerciseId: sanitizeText(exercise?.exerciseId || exercise?.id),
        name,
        muscleGroup: sanitizeText(exercise?.muscleGroup, "General"),
        sets: sanitizeText(exercise?.sets),
        reps: sanitizeText(exercise?.reps),
        weight: sanitizeText(exercise?.weight),
        notes: sanitizeText(exercise?.notes),
      };
    })
    .filter(Boolean);
}

function toPublicWorkout(workout) {
  return {
    id: workout.id,
    date: workout.date,
    title: workout.title,
    exerciseCount: Array.isArray(workout.exercises) ? workout.exercises.length : 0,
    exerciseNames: Array.isArray(workout.exercises)
      ? workout.exercises
          .map((exercise) => exercise?.name)
          .filter(Boolean)
          .slice(0, 3)
      : [],
  };
}

function toPublicExercise(exercise) {
  return {
    id: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    image: exercise.image || "",
  };
}

function mergeExerciseCatalog(remoteExercises) {
  const localExercises = LOCAL_EXERCISE_SEED.map((item) => normalizeExerciseSeed(item));
  return curateExerciseCatalog([...remoteExercises, ...localExercises]);
}

async function ensureExerciseCatalog(store) {
  const storedExercises = await store.listExercises();
  const currentExercises = curateExerciseCatalog(storedExercises);
  const hasRemoteCatalog =
    currentExercises.length >= REMOTE_EXERCISE_MINIMUM &&
    currentExercises.some((exercise) => exercise.source === "wger");
  const catalogNeedsCleanup = currentExercises.length !== storedExercises.length;

  if (hasRemoteCatalog && !catalogNeedsCleanup) {
    return currentExercises.length;
  }

  try {
    const remoteExercises = await fetchWgerExercises(REMOTE_EXERCISE_TARGET, {
      signal: AbortSignal.timeout(10000),
    });
    const mergedExercises = mergeExerciseCatalog(remoteExercises);
    await store.replaceExercises(mergedExercises);
    return mergedExercises.length;
  } catch (error) {
    if (currentExercises.length > 0) {
      if (catalogNeedsCleanup) {
        await store.replaceExercises(currentExercises);
      }
      console.warn(`Exercise catalog sync skipped: ${error.message}`);
      return currentExercises.length;
    }

    const localSeed = curateExerciseCatalog(
      LOCAL_EXERCISE_SEED.map((exercise) => normalizeExerciseSeed(exercise))
    );
    await store.replaceExercises(localSeed);
    console.warn(`Exercise catalog fell back to bundled seed: ${error.message}`);
    return localSeed.length;
  }
}

app.get("/", (req, res) => res.send("Backend OK"));
app.post("/signup", registerUser);
app.post("/login", loginUser);

app.get("/api/me", authenticateUser, async (req, res) => {
  try {
    const store = await getDataStore();
    const email = req.user.email;
    const [user, workouts, exercises] = await Promise.all([
      store.getUserByEmail(email),
      store.listWorkoutsByEmail(email),
      store.listExercises(),
    ]);

    res.json({
      email,
      createdAt: user?.createdAt || null,
      workoutCount: workouts.length,
      exerciseCount: exercises.length,
      storageMode: store.mode,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.get("/api/workouts", authenticateUser, async (req, res) => {
  try {
    const store = await getDataStore();
    const email = req.user.email;
    const workouts = await store.listWorkoutsByEmail(email);
    res.json({ workouts: workouts.map(toPublicWorkout) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load workouts" });
  }
});

app.post("/api/workouts", authenticateUser, async (req, res) => {
  try {
    const store = await getDataStore();
    const email = req.user.email;
    const title = sanitizeText(req.body?.title, "Evening Workout");
    const exercises = normalizeWorkoutExercises(req.body?.exercises);

    if (exercises.length === 0) {
      res.status(400).json({ error: "A workout must include at least one exercise" });
      return;
    }

    const newWorkout = {
      id: crypto.randomUUID(),
      email,
      username: email,
      date: isoDate(0),
      title,
      exercises,
      createdAt: new Date().toISOString(),
    };

    await store.createWorkout(newWorkout);
    res.status(201).json(toPublicWorkout(newWorkout));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create workout" });
  }
});

app.get("/api/workouts/:id", authenticateUser, async (req, res) => {
  try {
    const store = await getDataStore();
    const workout = await store.getWorkoutById(req.params.id, req.user.email);
    if (!workout) return res.status(404).json({ error: "Workout not found" });
    res.json(workout);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load workout" });
  }
});

app.put("/api/workouts/:id", authenticateUser, async (req, res) => {
  try {
    const store = await getDataStore();
    const title = sanitizeText(req.body?.title, "Evening Workout");
    const exercises = normalizeWorkoutExercises(req.body?.exercises);

    if (exercises.length === 0) {
      return res.status(400).json({ error: "A workout must include at least one exercise" });
    }

    const updated = await store.updateWorkout(req.params.id, req.user.email, { title, exercises });
    if (!updated) return res.status(404).json({ error: "Workout not found" });
    res.json(toPublicWorkout(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update workout" });
  }
});

app.get("/api/exercises", authenticateUser, async (req, res) => {
  try {
    const store = await getDataStore();
    const exercises = await store.listExercises();
    res.json({ exercises: exercises.map(toPublicExercise) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load exercises" });
  }
});

async function startServer() {
  try {
    const store = await getDataStore();
    const exerciseCount = await ensureExerciseCatalog(store);

    const server = app.listen(process.env.PORT || port, () => {
      console.log(
        `REST API is listening in ${store.mode} mode with ${exerciseCount} exercises.`
      );
    });

    async function shutdown() {
      server.close(async () => {
        await closeDataStore();
        process.exit(0);
      });
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

startServer();
