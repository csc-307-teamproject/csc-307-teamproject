import express from "express";
import cors from "cors";

const app = express();
const port = 8000;

app.use(cors());
app.use(express.json());

// --- Demo in-memory data (2 weeks worth) ---
function isoDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

let workouts = [
  { id: "w1", date: isoDate(1), title: "Upper Body" },
  { id: "w2", date: isoDate(3), title: "Lower Body" },
  { id: "w3", date: isoDate(5), title: "Push" },
  { id: "w4", date: isoDate(8), title: "Pull" },
  { id: "w5", date: isoDate(12), title: "Legs" },
];

// Health check
app.get("/", (req, res) => res.send("Backend OK"));

// Get workouts in last 14 days
app.get("/api/workouts", (req, res) => {
  // Sort newest first
  const sorted = [...workouts].sort((a, b) => (a.date < b.date ? 1 : -1));
  res.json({ workouts: sorted });
});

// Start a new workout (creates one)
app.post("/api/workouts", (req, res) => {
  const now = new Date();
  const newWorkout = {
    id: crypto.randomUUID(),
    date: now.toISOString().slice(0, 10),
    title: req.body?.title?.trim() || "Evening Workout",
  };
  workouts.unshift(newWorkout);
  res.status(201).json(newWorkout);
});

app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);
});
