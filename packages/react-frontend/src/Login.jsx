import { useState } from "react";

export default function Login({ onSubmit, buttonLabel = "Log In" }) {
  const [creds, setCreds] = useState({ email: "", pwd: "" });

  function handleChange(e) {
    const { name, value } = e.target;
    setCreds((prev) => ({ ...prev, [name]: value }));
  }

  function submitForm(e) {
    e.preventDefault();
    onSubmit(creds);
    setCreds({ email: "", pwd: "" });
  }

  return (
    <form onSubmit={submitForm} className="authBox">
      <label>Email</label>
      <input
        type="email"
        name="email"
        value={creds.email}
        onChange={handleChange}
        autoComplete="email"
      />

      <label>Password</label>
      <input
        type="password"
        name="pwd"
        value={creds.pwd}
        onChange={handleChange}
        autoComplete="current-password"
      />

      <button className="primaryBtn" type="submit">
        {buttonLabel}
      </button>
    </form>
  );
}
