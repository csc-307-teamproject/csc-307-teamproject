import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
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
const DEFAULT_SETTINGS = {
  preferredUnit: "lb",
  displayName: "",
  bodyWeight: null,
  bodyWeightUnit: "lb",
  weeklyGoal: 3,
};

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

function isValidUnit(value) {
  return value === "lb" || value === "kg";
}


function parseOptionalBodyWeight(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue > 1500) {
    return null;
  }

  return Math.round(numericValue * 10) / 10;
}

function parseWeeklyGoal(value) {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > 14) {
    return null;
  }

  return numericValue;
}

function toPublicSettings(user) {
  const bodyWeight = parseOptionalBodyWeight(user?.bodyWeight);
  return {
    preferredUnit: isValidUnit(user?.preferredUnit) ? user.preferredUnit : DEFAULT_SETTINGS.preferredUnit,
    displayName: sanitizeText(user?.displayName),
    bodyWeight,
    bodyWeightUnit: isValidUnit(user?.bodyWeightUnit)
      ? user.bodyWeightUnit
      : isValidUnit(user?.preferredUnit)
        ? user.preferredUnit
        : DEFAULT_SETTINGS.bodyWeightUnit,
    weeklyGoal: parseWeeklyGoal(user?.weeklyGoal) ?? DEFAULT_SETTINGS.weeklyGoal,
    avatarUrl: sanitizeText(user?.avatarUrl),
    prBench: user?.prBench != null ? String(user.prBench) : "",
    prSquat: user?.prSquat != null ? String(user.prSquat) : "",
    prDeadlift: user?.prDeadlift != null ? String(user.prDeadlift) : "",
  };
}

function parseSettingsUpdate(body, currentSettings) {
  const preferredUnit = body?.preferredUnit;
  const bodyWeightUnit = body?.bodyWeightUnit;
  const weeklyGoal = body?.weeklyGoal;

  if (preferredUnit !== undefined && !isValidUnit(preferredUnit)) {
    throw new Error("Preferred unit must be 'lb' or 'kg'.");
  }

  if (bodyWeightUnit !== undefined && !isValidUnit(bodyWeightUnit)) {
    throw new Error("Body weight unit must be 'lb' or 'kg'.");
  }

  if (weeklyGoal !== undefined && parseWeeklyGoal(weeklyGoal) === null) {
    throw new Error("Weekly goal must be an integer between 1 and 14.");
  }

  const nextBodyWeight = parseOptionalBodyWeight(body?.bodyWeight);
  if (
    body?.bodyWeight !== undefined &&
    body?.bodyWeight !== null &&
    body?.bodyWeight !== "" &&
    nextBodyWeight === null
  ) {
    throw new Error("Body weight must be a positive number.");
  }

  return {
    displayName:
      body?.displayName !== undefined
        ? sanitizeText(body.displayName).slice(0, 60)
        : currentSettings.displayName,
    preferredUnit: preferredUnit ?? currentSettings.preferredUnit,
    bodyWeight: body?.bodyWeight !== undefined ? nextBodyWeight : currentSettings.bodyWeight,
    bodyWeightUnit: bodyWeightUnit ?? currentSettings.bodyWeightUnit,
    weeklyGoal: weeklyGoal !== undefined ? parseWeeklyGoal(weeklyGoal) : currentSettings.weeklyGoal,
    avatarUrl: body?.avatarUrl !== undefined ? String(body.avatarUrl ?? "") : currentSettings.avatarUrl,
    prBench: body?.prBench !== undefined ? String(body.prBench) : currentSettings.prBench,
    prSquat: body?.prSquat !== undefined ? String(body.prSquat) : currentSettings.prSquat,
    prDeadlift: body?.prDeadlift !== undefined ? String(body.prDeadlift) : currentSettings.prDeadlift,
  };
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
    duration: workout.duration || null,
    title: workout.title,
    exerciseCount: Array.isArray(workout.exercises) ? workout.exercises.length : 0,
    exerciseNames: Array.isArray(workout.exercises)
      ? workout.exercises
          .map((exercise) => exercise?.name)
          .filter(Boolean)
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

app.get("/api/settings", authenticateUser, async (req, res) => {
  try {
    const store = await getDataStore();
    const user = await store.getUserByEmail(req.user.email);
    res.json(toPublicSettings(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

app.put("/api/settings", authenticateUser, async (req, res) => {
  try {
    const store = await getDataStore();
    const existingUser = await store.getUserByEmail(req.user.email);

    if (!existingUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const currentSettings = toPublicSettings(existingUser);
    const nextSettings = parseSettingsUpdate(req.body, currentSettings);
    const updatedUser = await store.updateUserByEmail(req.user.email, nextSettings);
    res.json(toPublicSettings(updatedUser || { ...existingUser, ...nextSettings }));
  } catch (err) {
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }

    console.error(err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

app.post("/api/change-password", authenticateUser, async (req, res) => {
  try {
    const store = await getDataStore();
    const user = await store.getUserByEmail(req.user.email);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const currentPassword = String(req.body?.currentPassword ?? "");
    const newPassword = String(req.body?.newPassword ?? "");

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Current and new password are required" });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters" });
      return;
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const nextHash = await bcrypt.hash(newPassword, 10);
    await store.updateUserByEmail(req.user.email, { passwordHash: nextHash });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to change password" });
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

    const duration = Number.isFinite(req.body?.duration) ? Math.round(req.body.duration) : null;
    const clientDate = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.date) ? req.body.date : isoDate(0);

    const newWorkout = {
      id: crypto.randomUUID(),
      email,
      username: email,
      date: clientDate,
      title,
      exercises,
      duration,
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

app.delete("/api/workouts/:id", authenticateUser, async (req, res) => {
  try {
    const store = await getDataStore();
    const deleted = await store.deleteWorkout(req.params.id, req.user.email);
    if (!deleted) return res.status(404).json({ error: "Workout not found" });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete workout" });
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
