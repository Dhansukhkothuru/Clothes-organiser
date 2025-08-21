import React, { useState } from "react";
import { User, Lock, Eye, EyeOff } from "lucide-react";

export default function SignUp({ onAuthed }) {
  const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5174/api";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Signup failed");
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem("token", data.token);
      storage.setItem("user", JSON.stringify(data.user));
      (remember ? sessionStorage : localStorage).removeItem("token");
      (remember ? sessionStorage : localStorage).removeItem("user");
      if (remember) localStorage.setItem("remember_me", "1");
      else localStorage.removeItem("remember_me");
      onAuthed?.(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <form
        onSubmit={submit}
        className="bg-white w-full max-w-sm p-6 rounded-2xl shadow"
      >
        <h1 className="text-2xl font-bold mb-4">Create account</h1>
        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
        <label className="block text-sm mb-1">Username</label>
        <div className="relative mb-3">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
            <User className="w-4 h-4" />
          </span>
          <input
            className="w-full border rounded p-2 pl-9"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Choose a username"
          />
        </div>
        <label className="block text-sm mb-1">Password</label>
        <div className="relative mb-3">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
            <Lock className="w-4 h-4" />
          </span>
          <input
            className="w-full border rounded p-2 pl-9 pr-10"
            type={showPwd ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a password"
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
            aria-label={showPwd ? "Hide password" : "Show password"}
          >
            {showPwd ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm mb-3 select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember me
        </label>
        <button
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded p-2"
        >
          {loading ? "Creating..." : "Sign up"}
        </button>
        <div className="text-sm mt-3">
          Have an account?{" "}
          <a className="text-indigo-600" href="#/signin">
            Sign in
          </a>
        </div>
      </form>
    </div>
  );
}
