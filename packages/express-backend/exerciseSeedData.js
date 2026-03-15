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

const INVALID_NAME_PATTERNS = [/^unnamed exercise$/i, /^test$/i];

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function firstNonEmptyString(values, fallback = "General") {
  return values.find((value) => typeof value === "string" && value.trim()) || fallback;
}

function normalizeCatalogKey(name) {
  return cleanText(name).toLowerCase();
}

function hasValidExerciseName(name) {
  const cleanedName = cleanText(name);
  const letterCount = (cleanedName.match(/[a-z]/gi) || []).length;

  if (!cleanedName || cleanedName.length < 3 || letterCount < 3) {
    return false;
  }

  return !INVALID_NAME_PATTERNS.some((pattern) => pattern.test(cleanedName));
}

function chooseBetterExercise(existingExercise, nextExercise) {
  if (!existingExercise) {
    return nextExercise;
  }

  const existingHasImage = Boolean(existingExercise.image);
  const nextHasImage = Boolean(nextExercise.image);

  if (existingHasImage !== nextHasImage) {
    return nextHasImage ? nextExercise : existingExercise;
  }

  if (existingExercise.source !== "local" && nextExercise.source === "local") {
    return {
      ...existingExercise,
      ...nextExercise,
      image: nextExercise.image || existingExercise.image,
    };
  }

  return {
    ...existingExercise,
    image: existingExercise.image || nextExercise.image,
    muscleGroup: existingExercise.muscleGroup || nextExercise.muscleGroup,
  };
}

export function normalizeExerciseSeed(exercise, source = "local") {
  return {
    id: exercise.id || `ex-${slugify(cleanText(exercise.name, "exercise"))}`,
    name: cleanText(exercise.name),
    muscleGroup: cleanText(exercise.muscleGroup, "General"),
    image: cleanText(exercise.image),
    source,
  };
}

export function curateExerciseCatalog(exercises) {
  const catalog = new Map();

  for (const exercise of exercises) {
    const normalized = normalizeExerciseSeed(exercise, exercise.source || "local");
    if (!hasValidExerciseName(normalized.name)) {
      continue;
    }

    const key = normalizeCatalogKey(normalized.name);
    const current = catalog.get(key);
    catalog.set(key, chooseBetterExercise(current, normalized));
  }

  return [...catalog.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function fetchWgerExercises(limit = 25, options = {}) {
  const url = new URL("https://wger.de/api/v2/exerciseinfo/");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("language", "2");

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`wger request failed (${response.status})`);
  }

  const payload = await response.json();
  const records = Array.isArray(payload.results) ? payload.results : [];

  return records
    .map((item) => {
      const translation =
        (Array.isArray(item.translations)
          ? item.translations.find((entry) => entry?.language === 2) || item.translations[0]
          : null) || null;
      const muscleNames = Array.isArray(item.muscles)
        ? item.muscles
            .map((muscle) => muscle?.name_en || muscle?.name)
            .filter(Boolean)
        : [];
      const categoryName =
        typeof item.category === "object" && item.category !== null
          ? item.category.name
          : "";
      const imageUrl = Array.isArray(item.images)
        ? item.images.map((image) => image?.image).find(Boolean) || ""
        : "";

      return normalizeExerciseSeed(
        {
          id: item.uuid || `wger-${item.id}`,
          name: translation?.name || "",
          muscleGroup: firstNonEmptyString([...muscleNames, categoryName]),
          image: imageUrl,
        },
        "wger"
      );
    })
    .filter((exercise) => exercise.name && exercise.muscleGroup);
}
