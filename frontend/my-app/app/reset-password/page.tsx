"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { fetchJson } from "@/lib/api";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!token) {
      setError("This reset link is missing information.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await fetchJson<{ message: string }>(
        "/api/alumni/reset-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        },
      );
      setMessage(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (message) {
    return (
      <div className="text-center">
        <p className="text-xl text-green-700 mb-6">{message}</p>
        <a
          href="/login"
          className="inline-block text-xl font-semibold bg-maroon-700 text-white rounded-md py-3 px-8 hover:bg-maroon-800"
        >
          Go to Log In
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label className="block text-lg font-medium text-gray-800 mb-1">
          New Password
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full text-lg text-gray-900 border-2 border-gray-400 rounded-md p-3"
        />
      </div>
      <div>
        <label className="block text-lg font-medium text-gray-800 mb-1">
          Confirm New Password
        </label>
        <input
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full text-lg text-gray-900 border-2 border-gray-400 rounded-md p-3"
        />
      </div>
      {error && <p className="text-red-600 text-lg font-medium">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full text-xl font-semibold bg-maroon-700 text-white rounded-md py-3 hover:bg-maroon-800 disabled:opacity-60"
      >
        {submitting ? "Saving..." : "Set New Password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex-1 flex items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-8 text-maroon-700">
          Reset Password
        </h1>
        <Suspense
          fallback={
            <p className="text-center text-gray-600">Loading form...</p>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
