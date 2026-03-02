import express from "express";
import cors from "cors";
import dotenv from "dotenv";
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

// --- per-user in-memory workout data ---
function isoDate(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const workoutsByUser = new Map(); 

function seedIfEmpty(username) {
  if (!workoutsByUser.has(username)) {
    workoutsByUser.set(username, [
      { id: "w1", date: isoDate(1), title: "Upper Body" },
      { id: "w2", date: isoDate(3), title: "Lower Body" },
      { id: "w3", date: isoDate(5), title: "Push" },
      { id: "w4", date: isoDate(8), title: "Pull" },
      { id: "w5", date: isoDate(12), title: "Legs" },
    ]);
  }
}

app.get("/", (req, res) => res.send("Backend OK"));
app.post("/signup", registerUser);
app.post("/login", loginUser);

app.get("/api/workouts", authenticateUser, (req, res) => {
  const username = req.user.username;
  seedIfEmpty(username);
  res.json({ workouts: workoutsByUser.get(username) });
});

app.post("/api/workouts", authenticateUser, (req, res) => {
  const username = req.user.username;
  seedIfEmpty(username);

  const title =
    (req.body?.title && String(req.body.title).trim()) || "Evening Workout";

  const newWorkout = {
    id: crypto.randomUUID(),
    date: isoDate(0),
    title,
  };

  const list = workoutsByUser.get(username);
  workoutsByUser.set(username, [newWorkout, ...list]);

  res.status(201).json(newWorkout);
});

app.listen(port, () => console.log(`Backend listening at http://localhost:${port}`));
