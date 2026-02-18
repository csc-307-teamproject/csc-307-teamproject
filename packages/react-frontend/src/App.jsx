import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:8000";

function Layout({ children }) {
  return (
    <div className="appShell">
      <div className="screen">{children}</div>

      {/* Bottom nav (fake iOS-ish) */}
      <nav className="bottomNav">
        <Link to="/" className="navBtn">Home</Link>
        <Link to="/history" className="navBtn">History</Link>
      </nav>
    </div>
  );
}

function Home() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  async function startWorkout() {
    try {
      setCreating(true);
      await fetch(`${API}/api/workouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Evening Workout" }),
      });
      navigate("/history");
    } catch (e) {
      alert("Failed to start workout. Is the backend running on :8000?");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Layout>
      <h1 className="title">Start Workout</h1>

      <button className="primaryBtn" onClick={startWorkout} disabled={creating}>
        {creating ? "Starting..." : "Start a Workout +"}
      </button>

      <div className="subtle">
        Demo: Press the button → creates a workout → view it in History.
      </div>
    </Layout>
  );
}

function History() {
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/workouts`);
      const data = await res.json();
      setWorkouts(data.workouts ?? []);
    } catch (e) {
      alert("Failed to load workouts. Is backend running?");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Layout>
      <div className="row">
        <h1 className="title">Workout History</h1>
        <button className="ghostBtn" onClick={load}>Refresh</button>
      </div>

      {loading ? (
        <div className="subtle">Loading…</div>
      ) : workouts.length === 0 ? (
        <div className="subtle">No workouts yet.</div>
      ) : (
        <div className="list">
          {workouts.map((w) => (
            <div className="listItem" key={w.id}>
              <div className="date">{w.date}</div>
              <div className="workoutTitle">{w.title}</div>
            </div>
          ))}
        </div>
      )}

      <div className="footerHint">Backend: {API}</div>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/history" element={<History />} />
      </Routes>
    </BrowserRouter>
  );
}

