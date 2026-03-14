export const LOCAL_EXERCISE_SEED = [
  {
    id: "ex-ab-wheel",
    name: "Ab Wheel",
    muscleGroup: "Core",
    image: "ab-wheel.png",
    source: "local",
  },
  {
    id: "ex-arnold-press",
    name: "Arnold Press (Dumbbell)",
    muscleGroup: "Shoulders",
    image: "arnold-press.png",
    source: "local",
  },
  {
    id: "ex-around-world",
    name: "Around the World",
    muscleGroup: "Chest",
    image: "around-the-world.png",
    source: "local",
  },
  {
    id: "ex-back-extension",
    name: "Back Extension",
    muscleGroup: "Back",
    image: "back-extension.png",
    source: "local",
  },
  {
    id: "ex-bench-press",
    name: "Bench Press (Barbell)",
    muscleGroup: "Chest",
    image: "bench-press.png",
    source: "local",
  },
  {
    id: "ex-bicep-curl",
    name: "Bicep Curl (Cable)",
    muscleGroup: "Arms",
    image: "bicep-curl.png",
    source: "local",
  },
];

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function firstNonEmptyString(values, fallback = "General") {
  return values.find((value) => typeof value === "string" && value.trim()) || fallback;
}

export function normalizeExerciseSeed(exercise, source = "local") {
  return {
    id: exercise.id || `ex-${slugify(exercise.name)}`,
    name: exercise.name.trim(),
    muscleGroup: exercise.muscleGroup.trim(),
    image: exercise.image || "",
    source,
  };
}

export async function fetchWgerExercises(limit = 25) {
  const url = new URL("https://wger.de/api/v2/exerciseinfo/");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("language", "2");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`wger request failed (${response.status})`);
  }

  const payload = await response.json();
  const records = Array.isArray(payload.results) ? payload.results : [];

  return records
    .map((item) => {
      const muscleNames = Array.isArray(item.muscles)
        ? item.muscles.map((muscle) => muscle?.name).filter(Boolean)
        : [];
      const categoryName =
        typeof item.category === "object" && item.category !== null
          ? item.category.name
          : "";

      return normalizeExerciseSeed(
        {
          id: item.uuid || `wger-${item.id}`,
          name: item.name || "Unnamed Exercise",
          muscleGroup: firstNonEmptyString([...muscleNames, categoryName]),
          image: "",
        },
        "wger"
      );
    })
    .filter((exercise) => exercise.name && exercise.muscleGroup);
}
