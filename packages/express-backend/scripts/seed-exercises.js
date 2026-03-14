import dotenv from "dotenv";
import { closeDataStore, getDataStore } from "../dataStore.js";
import {
  fetchWgerExercises,
  LOCAL_EXERCISE_SEED,
  normalizeExerciseSeed,
} from "../exerciseSeedData.js";

dotenv.config();

async function main() {
  const source = process.argv[2] || "local";
  const requestedLimit = Number(process.argv[3]);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 25;

  const store = await getDataStore();
  let exercises;

  if (source === "wger") {
    exercises = await fetchWgerExercises(limit);
  } else {
    exercises = LOCAL_EXERCISE_SEED.map((exercise) =>
      normalizeExerciseSeed(exercise, "local")
    );
  }

  await store.replaceExercises(exercises);
  console.log(`Seeded ${exercises.length} exercises from ${source}.`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDataStore();
  });
