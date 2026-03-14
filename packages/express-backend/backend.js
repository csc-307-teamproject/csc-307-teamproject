import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { authenticateUser, registerUser, loginUser } from "./auth.js";
import { closeDataStore, getDataStore } from "./dataStore.js";
import { LOCAL_EXERCISE_SEED, normalizeExerciseSeed } from "./exerciseSeedData.js";

dotenv.config();

if (!process.env.TOKEN_SECRET) {
  console.error("Missing TOKEN_SECRET in packages/express-backend/.env");
  process.exit(1);
}

const app = express();
const port = 8000;

app.use(cors());
app.use(express.json());

// --- per-user workout data (persisted to JSON) ---
function isoDate(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function toPublicWorkout(workout) {
  return {
    id: workout.id,
    date: workout.date,
    title: workout.title,
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

app.get("/", (req, res) => res.send("Backend OK"));
app.post("/signup", registerUser);
app.post("/login", loginUser);

app.get("/api/workouts", authenticateUser, async (req, res) => {
  try {
    const store = await getDataStore();
    const username = req.user.username;
    const workouts = await store.listWorkoutsByUsername(username);
    res.json({ workouts: workouts.map(toPublicWorkout) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load workouts" });
  }
});

app.post("/api/workouts", authenticateUser, async (req, res) => {
  try {
    const store = await getDataStore();
    const username = req.user.username;

    const title =
      (req.body?.title && String(req.body.title).trim()) || "Evening Workout";

    const newWorkout = {
      id: crypto.randomUUID(),
      username,
      date: isoDate(0),
      title,
      createdAt: new Date().toISOString(),
    };

    await store.createWorkout(newWorkout);
    res.status(201).json(toPublicWorkout(newWorkout));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create workout" });
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
    await store.seedExercises(
      LOCAL_EXERCISE_SEED.map((exercise) => normalizeExerciseSeed(exercise))
    );

    const server = app.listen(process.env.PORT || port, () => {
      console.log(`REST API is listening in ${store.mode} mode.`);
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
