import { useState } from "react";

export default function Login({ onSubmit, buttonLabel = "Log In" }) {
  const [creds, setCreds] = useState({ username: "", pwd: "" });

  function handleChange(e) {
    const { name, value } = e.target;
    setCreds((prev) => ({ ...prev, [name]: value }));
  }

  function submitForm(e) {
    e.preventDefault();
    onSubmit(creds);
    setCreds({ username: "", pwd: "" });
  }

  return (
    <form onSubmit={submitForm} className="authBox">
      <label>Username</label>
      <input name="username" value={creds.username} onChange={handleChange} />

      <label>Password</label>
      <input
        type="password"
        name="pwd"
        value={creds.pwd}
        onChange={handleChange}
      />

      <button className="primaryBtn" type="submit">
        {buttonLabel}
      </button>
    </form>
  );
}
