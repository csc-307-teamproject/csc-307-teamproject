import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEffect, useState } from "react";
import "./App.css";
import Login from "./Login.jsx";
import logo from "./assets/dynamicfitlogo.png";

const PRODUCTION_API =
  "https://csc307-teamproject-api-hrcvbdgdd9eyhrcb.eastus2-01.azurewebsites.net";
const API = resolveApiBase();
const TOKEN_KEY = "auth_token";
const DEFAULT_SETTINGS = {
  preferredUnit: "lb",
  displayName: "",
  bodyWeight: "",
  bodyWeightUnit: "lb",
  remindersEnabled: false,
  reminderTime: "18:00",
};
const WORKOUT_PRESETS = [
  "Upper Body",
  "Lower Body",
  "Push",
  "Pull",
  "Legs",
  "Full Body",
  "Cardio",
];
const exerciseImageModules = import.meta.glob("./assets/exercises/*", {
  eager: true,
  import: "default",
});
const exerciseImagesByFile = Object.fromEntries(
  Object.entries(exerciseImageModules).map(([filePath, assetUrl]) => [
    filePath.split("/").pop(),
    assetUrl,
  ])
);

function resolveApiBase() {
  const configuredBase = String(import.meta.env.VITE_API_BASE_URL ?? "").trim();
  if (configuredBase) {
    return configuredBase.replace(/\/$/, "");
  }

  return import.meta.env.DEV ? "" : PRODUCTION_API;
}

function Layout({ children, authed, onLogout, showNav = true }) {
  const navItems = [
    { to: "/profile", label: "Profile" },
    { to: "/", label: "Home" },
    { to: "/history", label: "History" },
    { to: "/exercises", label: "Exercises" },
    { to: "/settings", label: "Settings" },
  ];

  return (
    <div className="appShell">
      <div className="screen">
        <div className="topBar">
          {authed ? (
            <button className="ghostBtn" onClick={onLogout}>
              Log out
            </button>
          ) : (
            <span />
          )}
        </div>

        {children}
      </div>

      {showNav ? (
        <nav className="bottomNav">
          {authed
            ? navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `navBtn${isActive ? " active" : ""}`}
                >
                  {item.label}
                </NavLink>
              ))
            : (
              <NavLink
                to="/login"
                className={({ isActive }) => `navBtn${isActive ? " active" : ""}`}
              >
                Login
              </NavLink>
            )}
        </nav>
      ) : null}
    </div>
  );
}

function addAuthHeader(token, otherHeaders = {}) {
  if (!token) {
    return otherHeaders;
  }

  return { ...otherHeaders, Authorization: `Bearer ${token}` };
}

function RequireAuth({ token, children }) {
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

async function readErrorMessage(response, fallbackMessage) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return fallbackMessage;
  }

  try {
    const payload = JSON.parse(text);
    return payload?.error || fallbackMessage;
  } catch {
    return text;
  }
}

async function fetchJson(url, token, navigate, fallbackMessage) {
  const response = await fetch(url, {
    headers: addAuthHeader(token),
  });

  if (response.status === 401) {
    alert("Session expired. Please log in again.");
    navigate("/login");
    return null;
  }

  if (!response.ok) {
    const message = await readErrorMessage(response, fallbackMessage);
    throw new Error(message);
  }

  return response.json();
}

function parseTokenPayload(token) {
  if (!token) {
    return null;
  }

  try {
    const base64Payload = token.split(".")[1];
    const jsonPayload = atob(base64Payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function getEmailFromToken(token) {
  const payload = parseTokenPayload(token);
  return payload?.email || payload?.username || "";
}

function normalizeExerciseName(name) {
  return String(name ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isDisplayableExerciseName(name) {
  const cleanedName = normalizeExerciseName(name);
  if (!cleanedName || cleanedName.length < 3) {
    return false;
  }

  if (/^unnamed exercise$/i.test(cleanedName)) {
    return false;
  }

  const letterCount = (cleanedName.match(/[a-z]/gi) || []).length;
  return letterCount >= 3;
}

function getExerciseKey(name) {
  return normalizeExerciseName(name).toLowerCase();
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

  return {
    ...existingExercise,
    image: existingExercise.image || nextExercise.image,
    muscleGroup: existingExercise.muscleGroup || nextExercise.muscleGroup,
  };
}

function prepareExercises(items) {
  const catalog = new Map();

  for (const item of items) {
    const normalizedItem = {
      ...item,
      name: normalizeExerciseName(item.name),
      muscleGroup: normalizeExerciseName(item.muscleGroup) || "General",
    };

    if (!isDisplayableExerciseName(normalizedItem.name)) {
      continue;
    }

    const key = getExerciseKey(normalizedItem.name);
    catalog.set(key, chooseBetterExercise(catalog.get(key), normalizedItem));
  }

  return [...catalog.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function groupExercisesByLetter(exercises) {
  const groups = new Map();

  for (const exercise of exercises) {
    const firstLetter = exercise.name.match(/[a-z]/i)?.[0]?.toUpperCase() || "#";
    const currentGroup = groups.get(firstLetter) || [];
    currentGroup.push(exercise);
    groups.set(firstLetter, currentGroup);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([letter, items]) => ({
      letter,
      items,
    }));
}

function resolveExerciseImageSource(image) {
  if (!image) {
    return logo;
  }

  if (/^https?:\/\//i.test(image)) {
    return image;
  }

  return exerciseImagesByFile[image] || logo;
}

function formatDuration(seconds) {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

function toFormSettings(settings) {
  return {
    preferredUnit: settings?.preferredUnit || DEFAULT_SETTINGS.preferredUnit,
    displayName: settings?.displayName || "",
    bodyWeight:
      settings?.bodyWeight === null || settings?.bodyWeight === undefined
        ? ""
        : String(settings.bodyWeight),
    bodyWeightUnit: settings?.bodyWeightUnit || settings?.preferredUnit || DEFAULT_SETTINGS.bodyWeightUnit,
    remindersEnabled: Boolean(settings?.remindersEnabled),
    reminderTime: settings?.reminderTime || DEFAULT_SETTINGS.reminderTime,
  };
}

function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const [title, setTitle] = useState(location.state?.draftTitle || "");

  function openBuilder() {
    navigate("/create-workout", {
      state: { title: title.trim() || "Evening Workout" },
    });
  }

  return (
    <div className="pageWrap pageWrapNarrow">
      <h1 className="title center">Create Workout</h1>
      {location.state?.flash ? <div className="flashMessage">{location.state.flash}</div> : null}

      <div className="pageIntro centerMsg">
        Pick a workout name here, then build it from the full exercise catalog on the next page.
      </div>

      <input
        className="searchBox"
        list="workout-presets"
        placeholder="Workout name (choose or type)"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />

      <datalist id="workout-presets">
        {WORKOUT_PRESETS.map((preset) => (
          <option value={preset} key={preset} />
        ))}
      </datalist>

      <button className="primaryBtn" onClick={openBuilder}>
        Start Workout +
      </button>
    </div>
  );
}

function History({ token }) {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function loadWorkouts() {
      setLoading(true);
      setError("");

      try {
        const data = await fetchJson(
          `${API}/api/workouts`,
          token,
          navigate,
          "Failed to load workouts."
        );

        if (!ignore && data) {
          setWorkouts(data.workouts ?? []);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message || "Failed to load workouts.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadWorkouts();

    return () => {
      ignore = true;
    };
  }, [navigate, refreshKey, token]);

  return (
    <div className="pageWrap">
      <div className="row">
        <h1 className="title">Workout History</h1>
        <button className="ghostBtn" onClick={() => setRefreshKey((value) => value + 1)}>
          Refresh
        </button>
      </div>

      <div className="pageIntro">Finished workouts appear here as soon as you save them.</div>

      {error ? <div className="errorBanner">{error}</div> : null}
      {loading ? (
        <div className="subtle">Loading…</div>
      ) : workouts.length === 0 ? (
        <div className="subtle">No workouts yet.</div>
      ) : (
        <div className="list">
          {workouts.map((workout) => (
            <div className="listItem" key={workout.id}>
              <div className="date">{workout.date}</div>
              <div className="workoutSummary">
                <div className="workoutTitle">{workout.title}</div>
                <div className="workoutMeta">
                  {workout.exerciseCount} exercise{workout.exerciseCount === 1 ? "" : "s"}
                  {workout.exerciseNames?.length
                    ? ` · ${workout.exerciseNames.join(", ")}`
                    : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Exercises({ token }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function loadExercises() {
      setLoading(true);
      setError("");

      try {
        const data = await fetchJson(
          `${API}/api/exercises`,
          token,
          navigate,
          "Failed to load exercises."
        );

        if (!ignore && data) {
          setItems(data.exercises ?? []);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message || "Failed to load exercises.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadExercises();

    return () => {
      ignore = true;
    };
  }, [navigate, refreshKey, token]);

  const catalog = prepareExercises(items);
  const filteredExercises = catalog.filter((exercise) => {
    const haystack = `${exercise.name} ${exercise.muscleGroup}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const groupedExercises = groupExercisesByLetter(filteredExercises);

  return (
    <div className="pageWrap">
      <div className="row">
        <div>
          <h1 className="title">Exercises</h1>
          <div className="subtle compact">{catalog.length} clean exercises in your catalog</div>
        </div>
        <button className="ghostBtn" onClick={() => setRefreshKey((value) => value + 1)}>
          Refresh
        </button>
      </div>

      <div className="pageIntro">
        Browse the exercise dictionary by letter, with duplicates and invalid names filtered out.
      </div>

      <input
        className="searchBox"
        placeholder="Search exercises or muscle groups"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {error ? <div className="errorBanner">{error}</div> : null}
      {loading ? (
        <div className="subtle">Loading…</div>
      ) : groupedExercises.length === 0 ? (
        <div className="subtle">No matches.</div>
      ) : (
        <div className="exerciseGroups">
          {groupedExercises.map((group) => (
            <section className="exerciseGroup" key={group.letter}>
              <div className="groupHeader">{group.letter}</div>
              <div className="exerciseGroupList">
                {group.items.map((exercise) => (
                  <ExerciseCatalogRow key={exercise.id} exercise={exercise} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateWorkout({ token }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [title, setTitle] = useState(location.state?.title || "");
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timerId = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadExercises() {
      setLoading(true);
      setError("");

      try {
        const data = await fetchJson(
          `${API}/api/exercises`,
          token,
          navigate,
          "Failed to load exercises."
        );

        if (!ignore && data) {
          setCatalog(prepareExercises(data.exercises ?? []));
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message || "Failed to load exercises.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadExercises();

    return () => {
      ignore = true;
    };
  }, [navigate, token]);

  const filteredCatalog = catalog.filter((exercise) => {
    const haystack = `${exercise.name} ${exercise.muscleGroup}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  function addExercise(exercise) {
    setSelectedExercises((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        exerciseId: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        sets: "",
        reps: "",
        weight: "",
        notes: "",
      },
    ]);
  }

  function updateExercise(entryId, field, value) {
    setSelectedExercises((current) =>
      current.map((exercise) =>
        exercise.id === entryId ? { ...exercise, [field]: value } : exercise
      )
    );
  }

  function removeExercise(entryId) {
    setSelectedExercises((current) =>
      current.filter((exercise) => exercise.id !== entryId)
    );
  }

  function exitWithoutSaving() {
    navigate("/", {
      replace: true,
      state: {
        flash: "Workout discarded.",
        draftTitle: title,
      },
    });
  }

  async function finishWorkout() {
    if (selectedExercises.length === 0) {
      alert("Add at least one exercise before finishing your workout.");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`${API}/api/workouts`, {
        method: "POST",
        headers: addAuthHeader(token, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          title: title.trim() || "Evening Workout",
          exercises: selectedExercises,
        }),
      });

      if (response.status === 401) {
        alert("Session expired. Please log in again.");
        navigate("/login");
        return;
      }

      if (!response.ok) {
        const message = await readErrorMessage(response, "Failed to finish workout.");
        setError(message);
        return;
      }

      const savedWorkout = await response.json();
      navigate("/", {
        replace: true,
        state: {
          flash: `Saved "${savedWorkout.title}" to History.`,
          draftTitle: "",
        },
      });
    } catch {
      setError("Failed to finish workout. Unable to reach the API.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pageWrap">
      <div className="builderHeader">
        <div>
          <h1 className="title">Create Workout</h1>
          <div className="pageIntro builderIntro">
            The timer starts as soon as this page opens. Add exercises, log details, then finish to
            save the session to History.
          </div>
        </div>
        <div className="timerCard">
          <div className="timerLabel">Workout Timer</div>
          <div className="timerValue">{formatDuration(elapsedSeconds)}</div>
        </div>
      </div>

      <input
        className="searchBox"
        placeholder="Workout title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />

      {error ? <div className="errorBanner">{error}</div> : null}

      <div className="builderGrid">
        <section className="panel builderMain">
          <div className="row">
            <h2 className="sectionTitle">Selected Exercises</h2>
            <span className="countPill">
              {selectedExercises.length} item{selectedExercises.length === 1 ? "" : "s"}
            </span>
          </div>

          {selectedExercises.length === 0 ? (
            <div className="emptyState">
              Choose exercises from the catalog to start logging this workout.
            </div>
          ) : (
            <div className="selectedList">
              {selectedExercises.map((exercise) => (
                <div className="selectedCard" key={exercise.id}>
                  <div className="row selectedHeader">
                    <div>
                      <div className="exerciseName">{exercise.name}</div>
                      <div className="exerciseSub">{exercise.muscleGroup}</div>
                    </div>
                    <button
                      className="ghostBtn compactBtn"
                      onClick={() => removeExercise(exercise.id)}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="fieldGrid">
                    <label>
                      Sets
                      <input
                        className="fieldInput"
                        value={exercise.sets}
                        onChange={(event) =>
                          updateExercise(exercise.id, "sets", event.target.value)
                        }
                        placeholder="4"
                      />
                    </label>
                    <label>
                      Reps
                      <input
                        className="fieldInput"
                        value={exercise.reps}
                        onChange={(event) =>
                          updateExercise(exercise.id, "reps", event.target.value)
                        }
                        placeholder="8-12"
                      />
                    </label>
                    <label>
                      Weight
                      <input
                        className="fieldInput"
                        value={exercise.weight}
                        onChange={(event) =>
                          updateExercise(exercise.id, "weight", event.target.value)
                        }
                        placeholder="135 lb"
                      />
                    </label>
                  </div>

                  <label className="notesField">
                    Notes
                    <input
                      className="fieldInput"
                      value={exercise.notes}
                      onChange={(event) =>
                        updateExercise(exercise.id, "notes", event.target.value)
                      }
                      placeholder="Tempo, rest time, or quick notes"
                    />
                  </label>
                </div>
              ))}
            </div>
          )}

          <div className="builderActions">
            <button className="ghostBtn" onClick={exitWithoutSaving}>
              Exit Without Saving
            </button>
            <button className="ghostBtn" onClick={() => navigate("/history")}>
              View History
            </button>
            <button className="primaryBtn actionBtn" onClick={finishWorkout} disabled={saving}>
              {saving ? "Finishing..." : "Finish Workout"}
            </button>
          </div>
        </section>

        <aside className="panel builderSidebar">
          <div className="row">
            <h2 className="sectionTitle">Exercise Catalog</h2>
            <span className="countPill">{catalog.length}</span>
          </div>

          <input
            className="searchBox inlineSearch"
            placeholder="Search exercises"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          {loading ? (
            <div className="subtle">Loading catalog…</div>
          ) : filteredCatalog.length === 0 ? (
            <div className="emptyState">No exercises match that search.</div>
          ) : (
            <div className="catalogList catalogListCompact">
              {filteredCatalog.map((exercise) => (
                <ExerciseCatalogRow
                  key={exercise.id}
                  exercise={exercise}
                  actionLabel="Add"
                  onAction={() => addExercise(exercise)}
                />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Profile({ token }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    workoutCount: 0,
    exerciseCount: 0,
    settings: DEFAULT_SETTINGS,
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const email = getEmailFromToken(token);

  useEffect(() => {
    let ignore = false;

    async function loadProfileSnapshot() {
      setLoading(true);
      setError("");

      try {
        const [workouts, exercises, settings] = await Promise.all([
          fetchJson(`${API}/api/workouts`, token, navigate, "Failed to load workouts."),
          fetchJson(`${API}/api/exercises`, token, navigate, "Failed to load exercises."),
          fetchJson(`${API}/api/settings`, token, navigate, "Failed to load settings."),
        ]);

        if (!ignore) {
          setStats({
            workoutCount: workouts?.workouts?.length ?? 0,
            exerciseCount: prepareExercises(exercises?.exercises ?? []).length,
            settings: toFormSettings(settings),
          });
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message || "Failed to load profile.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadProfileSnapshot();

    return () => {
      ignore = true;
    };
  }, [navigate, refreshKey, token]);

  return (
    <div className="pageWrap">
      <div className="row">
        <h1 className="title">Profile</h1>
        <button className="ghostBtn" onClick={() => setRefreshKey((value) => value + 1)}>
          Refresh
        </button>
      </div>

      <div className="pageIntro">
        This profile belongs to the currently signed-in account and stays unique to that user.
      </div>

      {error ? <div className="errorBanner">{error}</div> : null}
      {loading ? (
        <div className="subtle">Loading…</div>
      ) : (
        <div className="panelStack">
          <section className="panel">
            <div className="sectionTitle">Account Overview</div>
            <div className="statGrid">
              <div className="statCard">
                <div className="statLabel">Display Name</div>
                <div className="statValue">
                  {stats.settings.displayName || email || "Unknown"}
                </div>
              </div>
              <div className="statCard">
                <div className="statLabel">Email</div>
                <div className="statValue">{email || "Unknown"}</div>
              </div>
              <div className="statCard">
                <div className="statLabel">Logged Workouts</div>
                <div className="statValue">{stats.workoutCount}</div>
              </div>
              <div className="statCard">
                <div className="statLabel">Body Weight</div>
                <div className="statValue">
                  {stats.settings.bodyWeight
                    ? `${stats.settings.bodyWeight} ${stats.settings.bodyWeightUnit}`
                    : "Not set"}
                </div>
              </div>
              <div className="statCard">
                <div className="statLabel">Available Exercises</div>
                <div className="statValue">{stats.exerciseCount}</div>
              </div>
              <div className="statCard">
                <div className="statLabel">Preferred Unit</div>
                <div className="statValue">{stats.settings.preferredUnit.toUpperCase()}</div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Settings({ token }) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    let ignore = false;

    async function loadSettings() {
      setLoading(true);
      setError("");

      try {
        const data = await fetchJson(
          `${API}/api/settings`,
          token,
          navigate,
          "Failed to load settings."
        );

        if (!ignore && data) {
          setSettings(toFormSettings(data));
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message || "Failed to load settings.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      ignore = true;
    };
  }, [navigate, token]);

  function updateSettings(field, value) {
    setSettings((current) => ({ ...current, [field]: value }));
    setSuccessMessage("");
    setError("");
  }

  async function saveSettings() {
    try {
      setSaving(true);
      setError("");
      setSuccessMessage("");

      const response = await fetch(`${API}/api/settings`, {
        method: "PUT",
        headers: addAuthHeader(token, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          preferredUnit: settings.preferredUnit,
          displayName: settings.displayName,
          bodyWeight: settings.bodyWeight === "" ? null : Number(settings.bodyWeight),
          bodyWeightUnit: settings.bodyWeightUnit,
          remindersEnabled: settings.remindersEnabled,
          reminderTime: settings.reminderTime,
        }),
      });

      if (response.status === 401) {
        alert("Session expired. Please log in again.");
        navigate("/login");
        return;
      }

      if (!response.ok) {
        const message = await readErrorMessage(response, "Failed to save settings.");
        setError(message);
        return;
      }

      const savedSettings = await response.json();
      setSettings(toFormSettings(savedSettings));
      setSuccessMessage("Settings saved.");
    } catch {
      setError("Failed to save settings. Unable to reach the API.");
    } finally {
      setSaving(false);
    }
  }

  function updatePasswordField(field, value) {
    setPasswordForm((current) => ({ ...current, [field]: value }));
    setPasswordError("");
    setPasswordSuccess("");
  }

  async function changePassword() {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      setPasswordError("Fill in your current and new password.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New password and confirmation must match.");
      return;
    }

    try {
      setPasswordError("");
      setPasswordSuccess("");

      const response = await fetch(`${API}/api/change-password`, {
        method: "POST",
        headers: addAuthHeader(token, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      if (response.status === 401) {
        const message = await readErrorMessage(response, "Current password is incorrect.");
        setPasswordError(message);
        return;
      }

      if (!response.ok) {
        const message = await readErrorMessage(response, "Failed to change password.");
        setPasswordError(message);
        return;
      }

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordSuccess("Password updated.");
    } catch {
      setPasswordError("Failed to change password. Unable to reach the API.");
    }
  }

  return (
    <div className="pageWrap">
      <h1 className="title">Settings</h1>
      <div className="pageIntro">
        Manage the account preferences that shape how this app feels for each individual user.
      </div>

      {error ? <div className="errorBanner">{error}</div> : null}
      {successMessage ? <div className="flashMessage">{successMessage}</div> : null}

      {loading ? (
        <div className="subtle">Loading…</div>
      ) : (
        <div className="panelStack">
          <section className="panel">
            <div className="sectionTitle">Units</div>
            <div className="helperText">Choose the weight unit you want the app to use by default.</div>
            <div className="segmentedControl">
              {["lb", "kg"].map((unit) => (
                <button
                  key={unit}
                  type="button"
                  className={`segmentBtn${settings.preferredUnit === unit ? " active" : ""}`}
                  onClick={() => updateSettings("preferredUnit", unit)}
                >
                  {unit.toUpperCase()}
                </button>
              ))}
            </div>
          </section>

          <section className="panel settingsGrid">
            <div>
              <div className="sectionTitle">Profile Basics</div>
              <div className="helperText">Make the app feel personal and store an optional body weight for future progress features.</div>
            </div>

            <label className="settingsField">
              Display name
              <input
                className="fieldInput"
                value={settings.displayName}
                onChange={(event) => updateSettings("displayName", event.target.value)}
                placeholder="Your name"
              />
            </label>

            <div className="inlineFields">
              <label className="settingsField">
                Body weight
                <input
                  className="fieldInput"
                  type="number"
                  min="0"
                  step="0.1"
                  value={settings.bodyWeight}
                  onChange={(event) => updateSettings("bodyWeight", event.target.value)}
                  placeholder="Optional"
                />
              </label>

              <div className="settingsField">
                Body weight unit
                <div className="segmentedControl compactSegments">
                  {["lb", "kg"].map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      className={`segmentBtn${settings.bodyWeightUnit === unit ? " active" : ""}`}
                      onClick={() => updateSettings("bodyWeightUnit", unit)}
                    >
                      {unit.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="sectionTitle">Reminder Preference</div>
            <div className="helperText">Even without push notifications yet, this keeps your preferred workout reminder ready.</div>
            <label className="toggleRow">
              <input
                type="checkbox"
                checked={settings.remindersEnabled}
                onChange={(event) => updateSettings("remindersEnabled", event.target.checked)}
              />
              <span>Enable workout reminders</span>
            </label>

            <label className="settingsField">
              Reminder time
              <input
                className="fieldInput"
                type="time"
                value={settings.reminderTime}
                disabled={!settings.remindersEnabled}
                onChange={(event) => updateSettings("reminderTime", event.target.value)}
              />
            </label>
          </section>

          <div className="settingsActions">
            <button className="primaryBtn actionBtn" onClick={saveSettings} disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>

          <section className="panel">
            <div className="sectionTitle">Security</div>
            <div className="helperText">Change your password by confirming the current one first.</div>
            {passwordError ? <div className="errorBanner">{passwordError}</div> : null}
            {passwordSuccess ? <div className="flashMessage">{passwordSuccess}</div> : null}
            <div className="settingsGrid">
              <label className="settingsField">
                Current password
                <input
                  className="fieldInput"
                  type="password"
                  autoComplete="current-password"
                  value={passwordForm.currentPassword}
                  onChange={(event) =>
                    updatePasswordField("currentPassword", event.target.value)
                  }
                />
              </label>

              <label className="settingsField">
                New password
                <input
                  className="fieldInput"
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.newPassword}
                  onChange={(event) => updatePasswordField("newPassword", event.target.value)}
                />
              </label>

              <label className="settingsField">
                Confirm new password
                <input
                  className="fieldInput"
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    updatePasswordField("confirmPassword", event.target.value)
                  }
                />
              </label>
            </div>

            <div className="settingsActions">
              <button className="ghostBtn" onClick={changePassword}>
                Change Password
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ExerciseCatalogRow({ exercise, actionLabel, onAction }) {
  return (
    <div className="exerciseRow">
      <img
        className="exerciseImg"
        src={resolveExerciseImageSource(exercise.image)}
        alt={exercise.name}
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = logo;
        }}
      />
      <div className="exerciseText">
        <div className="exerciseName">{exercise.name}</div>
        <div className="exerciseSub">{exercise.muscleGroup}</div>
      </div>
      {onAction ? (
        <button className="ghostBtn compactBtn" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || "");
  const [message, setMessage] = useState("");
  const [redirecting, setRedirecting] = useState(false);

  function saveToken(nextToken) {
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setMessage("Logged out.");
  }

  async function loginUser(creds) {
    setMessage("");

    try {
      const response = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });

      if (response.status === 200) {
        const payload = await response.json();
        saveToken(payload.token);
        setMessage("Login successful. Redirecting…");
        setRedirecting(true);
        setTimeout(() => setRedirecting(false), 900);
      } else {
        const detail = await readErrorMessage(response, "Login failed.");
        setMessage(detail);
      }
    } catch {
      setMessage("Login failed. Unable to reach the API.");
    }
  }

  async function signupUser(creds) {
    setMessage("");

    try {
      const response = await fetch(`${API}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });

      if (response.status === 201) {
        const payload = await response.json();
        saveToken(payload.token);
        setMessage("Signup successful. You’re now logged in. Redirecting…");
        setRedirecting(true);
        setTimeout(() => setRedirecting(false), 900);
      } else if (response.status === 409) {
        setMessage("Email already registered.");
      } else {
        const detail = await readErrorMessage(response, "Signup failed.");
        setMessage(detail);
      }
    } catch {
      setMessage("Signup failed. Unable to reach the API.");
    }
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <Layout authed={!!token} onLogout={logout}>
              <RequireAuth token={token}>
                <Home />
              </RequireAuth>
            </Layout>
          }
        />

        <Route
          path="/create-workout"
          element={
            <Layout authed={!!token} onLogout={logout} showNav={false}>
              <RequireAuth token={token}>
                <CreateWorkout token={token} />
              </RequireAuth>
            </Layout>
          }
        />

        <Route
          path="/profile"
          element={
            <Layout authed={!!token} onLogout={logout}>
              <RequireAuth token={token}>
                <Profile token={token} />
              </RequireAuth>
            </Layout>
          }
        />

        <Route
          path="/history"
          element={
            <Layout authed={!!token} onLogout={logout}>
              <RequireAuth token={token}>
                <History token={token} />
              </RequireAuth>
            </Layout>
          }
        />

        <Route
          path="/exercises"
          element={
            <Layout authed={!!token} onLogout={logout}>
              <RequireAuth token={token}>
                <Exercises token={token} />
              </RequireAuth>
            </Layout>
          }
        />

        <Route
          path="/settings"
          element={
            <Layout authed={!!token} onLogout={logout}>
              <RequireAuth token={token}>
                <Settings token={token} />
              </RequireAuth>
            </Layout>
          }
        />

        <Route
          path="/login"
          element={
            <Layout authed={!!token} onLogout={logout} showNav={false}>
              {token && redirecting ? (
                <div className="subtle centerMsg">{message}</div>
              ) : token ? (
                <Navigate to="/" replace />
              ) : (
                <div className="loginPage">
                  <img className="brandLogo" src={logo} alt="DynamicFit" />

                  <div className="authHeader">
                    <h1 className="title center">Login</h1>
                    {message ? <div className="subtle centerMsg">{message}</div> : null}
                  </div>

                  <div className="authGrid">
                    <div className="authCard">
                      <h2 className="authTitle">Log In</h2>
                      <Login onSubmit={loginUser} buttonLabel="Log In" />
                    </div>

                    <div className="authCard">
                      <h2 className="authTitle">Sign Up</h2>
                      <Login onSubmit={signupUser} buttonLabel="Sign Up" />
                    </div>
                  </div>
                </div>
              )}
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
