import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { authenticateUser, registerUser, loginUser } from "./auth.js";

dotenv.config();

if (!process.env.TOKEN_SECRET) {
  console.error("Missing TOKEN_SECRET in packages/express-backend/.env");
  process.exit(1);
}

const app = express();
const port = 8000;

app.use(cors());
app.use(express.json());

// --- per-user exercises (static seed for demo) ---
const EXERCISES = [
  {
    id: "ex-ab-wheel",
    name: "Ab Wheel",
    muscleGroup: "Core",
    image: "ab-wheel.png",
  },
  {
    id: "ex-arnold-press",
    name: "Arnold Press (Dumbbell)",
    muscleGroup: "Shoulders",
    image: "arnold-press.png",
  },
  {
    id: "ex-around-world",
    name: "Around the World",
    muscleGroup: "Chest",
    image: "around-the-world.png",
  },
  {
    id: "ex-back-extension",
    name: "Back Extension",
    muscleGroup: "Back",
    image: "back-extension.png",
  },
  {
    id: "ex-bench-press",
    name: "Bench Press (Barbell)",
    muscleGroup: "Chest",
    image: "bench-press.png",
  },
  {
    id: "ex-bicep-curl",
    name: "Bicep Curl (Cable)",
    muscleGroup: "Arms",
    image: "bicep-curl.png",
  },
];

app.get("/api/exercises", authenticateUser, (req, res) => {
  res.json({ exercises: EXERCISES });
});

// --- per-user workout data (persisted to JSON) ---
function isoDate(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const DATA_DIR = path.join(process.cwd(), "data");
const WORKOUTS_FILE = path.join(DATA_DIR, "workouts.json");

async function readWorkoutsStore() {
  try {
    const raw = await fs.readFile(WORKOUTS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw e;
  }
}

async function writeWorkoutsStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(WORKOUTS_FILE, JSON.stringify(store, null, 2));
}

async function getUserWorkouts(username) {
  const store = await readWorkoutsStore();
  return store[username] ?? [];
}

async function setUserWorkouts(username, workouts) {
  const store = await readWorkoutsStore();
  store[username] = workouts;
  await writeWorkoutsStore(store);
}

app.get("/", (req, res) => res.send("Backend OK"));
app.post("/signup", registerUser);
app.post("/login", loginUser);

app.get("/api/workouts", authenticateUser, async (req, res) => {
  try {
    const username = req.user.username;
    const workouts = await getUserWorkouts(username);
    res.json({ workouts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load workouts" });
  }
});

app.post("/api/workouts", authenticateUser, async (req, res) => {
  try {
    const username = req.user.username;

    const title =
      (req.body?.title && String(req.body.title).trim()) || "Evening Workout";

    const newWorkout = {
      id: crypto.randomUUID(),
      date: isoDate(0),
      title,
    };

    const list = await getUserWorkouts(username);
    await setUserWorkouts(username, [newWorkout, ...list]);

    res.status(201).json(newWorkout);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create workout" });
  }
});

app.listen(port, () =>
  console.log(`Backend listening at http://localhost:${port}`)
);