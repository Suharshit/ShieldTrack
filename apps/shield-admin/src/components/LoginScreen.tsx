import { useState, FormEvent } from "react";
import { supabase } from "../supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    if (email.trim() && password.trim()) {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (error) {
        setErrorMsg(error.message);
      }
      // If successful, onAuthStateChange in App.tsx will pick up the session
    }
    
    setLoading(false);
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <form
        onSubmit={handleLogin}
        className="bg-white p-10 rounded-xl text-center shadow-lg w-[350px]"
      >
        <h2 className="m-0 mb-2.5 text-[#1a237e] text-2xl font-bold">
          🛡️ ShieldTrack Admin
        </h2>
        <p className="text-gray-500 mb-5">
          Enter Admin Credentials to Access the Dashboard.
        </p>
        
        {errorMsg && (
          <div className="mb-4 p-2 bg-red-100 text-red-700 rounded-md text-sm text-left">
            {errorMsg}
          </div>
        )}

        <input
          type="email"
          placeholder="admin@school.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="p-3 w-full mb-3 border-2 border-gray-200 rounded-lg text-gray-800 bg-white box-border focus:outline-none focus:border-[#1a237e]"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="p-3 w-full mb-5 border-2 border-gray-200 rounded-lg text-gray-800 bg-white box-border focus:outline-none focus:border-[#1a237e]"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-3.5 bg-[#1a237e] text-white w-full border-none rounded-lg font-bold cursor-pointer transition hover:bg-opacity-90 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Enter Dashboard"}
        </button>
      </form>
    </div>
  );
}
