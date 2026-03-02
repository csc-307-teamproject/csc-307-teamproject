import {BrowserRouter, Routes, Route, Link, useNavigate, Navigate,} from "react-router-dom";
import { useEffect, useState } from "react";
import "./App.css";
import Login from "./Login.jsx";
import logo from "./assets/dynamicfitlogo.png";

const API = "http://localhost:8000";
const TOKEN_KEY = "auth_token";

function Layout({ children, authed, onLogout, showNav = true }) {
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
          <Link to="/" className="navBtn">
            Home
          </Link>
          <Link to="/history" className="navBtn">
            History
          </Link>

          {/* Only show Login when NOT authenticated */}
          {!authed ? (
            <Link to="/login" className="navBtn">
              Login
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function addAuthHeader(token, otherHeaders = {}) {
  if (!token) return otherHeaders;
  return { ...otherHeaders, Authorization: `Bearer ${token}` };
}

function RequireAuth({ token, children }) {
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function Home({ token }) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  async function startWorkout() {
    try {
      setCreating(true);
      const res = await fetch(`${API}/api/workouts`, {
        method: "POST",
        headers: addAuthHeader(token, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ title: "Evening Workout" }),
      });

      if (res.status === 401) {
        alert("Session expired. Please log in again.");
        navigate("/login");
        return;
      }

      navigate("/history");
    } catch {
      alert("Failed to start workout. Is the backend running on :8000?");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <h1 className="title">Start Workout</h1>

      <button className="primaryBtn" onClick={startWorkout} disabled={creating}>
        {creating ? "Starting..." : "Start a Workout +"}
      </button>

      <div className="subtle">
        Protected demo: button POSTs to backend using your JWT token.
      </div>
    </>
  );
}

function History({ token }) {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/workouts`, {
        headers: addAuthHeader(token),
      });

      if (res.status === 401) {
        alert("Not authorized. Please log in.");
        navigate("/login");
        return;
      }

      const data = await res.json();
      setWorkouts(data.workouts ?? []);
    } catch {
      alert("Failed to load workouts. Is backend running?");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <div className="row">
        <h1 className="title">Workout History</h1>
        <button className="ghostBtn" onClick={load}>
          Refresh
        </button>
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
    </>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || "");
  const [message, setMessage] = useState("");
  const [redirecting, setRedirecting] = useState(false);

  function saveToken(t) {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setMessage("Logged out.");
  }

  async function loginUser(creds) {
    setMessage("");
    const res = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });

    if (res.status === 200) {
      const payload = await res.json();
      saveToken(payload.token);
      setMessage("Login successful. Redirecting…");
      setRedirecting(true);
      setTimeout(() => setRedirecting(false), 900);
    } else {
      setMessage(`Login failed (${res.status}).`);
    }
  }

  async function signupUser(creds) {
    setMessage("");
    const res = await fetch(`${API}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });

    if (res.status === 201) {
      const payload = await res.json();
      saveToken(payload.token);
      setMessage("Signup successful. You’re now logged in. Redirecting…");
      setRedirecting(true);
      setTimeout(() => setRedirecting(false), 900);
    } else if (res.status === 409) {
      setMessage("Username already taken.");
    } else {
      setMessage(`Signup failed (${res.status}).`);
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
                <Home token={token} />
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
          path="/login"
          element={
            <Layout authed={!!token} onLogout={logout} showNav={false}>
              {/* If we already have a token, do NOT show login page */}
              {token && redirecting ? (
                <div className="subtle centerMsg">{message}</div>
              ) : token ? (
                <Navigate to="/" replace />
              ) : (
                <div className="loginPage">
                  <img className="brandLogo" src={logo} alt="DynamicFit" />

                  <div className="authHeader">
                    <h1 className="title center">Login</h1>
                    {message ? (
                      <div className="subtle centerMsg">{message}</div>
                    ) : null}
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
