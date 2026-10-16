"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = await fetchJson<{ message: string }>(
        "/api/alumni/forgot-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
      );
      setMessage(data.message);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex-1 flex items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-8 text-maroon-700">
          Forgot Password
        </h1>

        {message ? (
          <p className="text-xl text-gray-700 text-center">{message}</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="block text-lg font-medium text-gray-800 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-lg text-gray-900 border-2 border-gray-400 rounded-md p-3"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full text-xl font-semibold bg-maroon-700 text-white rounded-md py-3 hover:bg-maroon-800 disabled:opacity-60"
            >
              {submitting ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}

        <p className="text-center text-lg mt-6 text-gray-700">
          <a href="/login" className="text-maroon-700 underline font-medium">
            Back to Log In
          </a>
        </p>
      </div>
    </main>
  );
}
