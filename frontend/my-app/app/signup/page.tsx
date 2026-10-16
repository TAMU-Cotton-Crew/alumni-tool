"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/api";
import { SubmitEvent } from "react";

export default function SignUp() {
  const router = useRouter();
  const [form, setForm] = useState({
    classification: "Alumni",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  // True when the account was created but Azure's email limit blocked the verification email
  const [emailLimited, setEmailLimited] = useState(false);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await fetchJson<{ emailRateLimited?: boolean }>("/api/alumni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classification: form.classification,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          password: form.password,
        }),
      });
      setEmailLimited(Boolean(result.emailRateLimited));
      setSignupComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (signupComplete && emailLimited) {
    return (
      <main className="flex-1 flex items-center justify-center bg-white px-4 py-10">
        <div className="w-full max-w-md text-center">
          <h1 className="text-3xl font-bold text-maroon-700 mb-4">
            Account Created
          </h1>
          <div
            role="alert"
            className="rounded-md border-2 border-amber-500 bg-amber-50 p-4 text-left"
          >
            <p className="text-lg font-semibold text-amber-900">
              We couldn&apos;t send your verification email yet
            </p>
            <p className="text-base text-amber-900 mt-1">
              For security reasons, emails have been temporarily limited. Your
              account for <strong>{form.email}</strong> was saved, so you
              don&apos;t need to sign up again.
            </p>
            <p className="text-base text-amber-900 mt-2">
              Please come back in an hour, go to{" "}
              <a href="/login" className="underline font-medium">
                Log In
              </a>
              , enter your email and password, and click{" "}
              <strong>Resend Verification Email</strong>.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (signupComplete) {
    return (
      <main className="flex-1 flex items-center justify-center bg-white px-4 py-10">
        <div className="w-full max-w-md text-center">
          <h1 className="text-3xl font-bold text-maroon-700 mb-4">
            Check Your Email
          </h1>
          <p className="text-xl text-gray-700">
            We've sent a verification link to <strong>{form.email}</strong>.
            Please click that link before logging in.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-8 text-maroon-700">
          Create Your Account
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              I am a...
            </label>
            <select
              value={form.classification}
              onChange={(e) => handleChange("classification", e.target.value)}
              className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
            >
              <option value="Alumni">Alumni</option>
              <option value="Student">
                Student
              </option>
              <option value="Friend of BAEN">Friend of BAEN</option>
            </select>
          </div>

          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              First Name
            </label>
            <input
              type="text"
              required
              value={form.firstName}
              onChange={(e) => handleChange("firstName", e.target.value)}
              className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
            />
          </div>
          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              Last Name
            </label>
            <input
                type="text"
                required
                value={form.lastName}
                onChange={(e) => handleChange("lastName", e.target.value)}
                className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
            />
          </div>

          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
            />
          </div>
          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => handleChange("password", e.target.value)}
              className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
            />
          </div>

          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              required
              value={form.confirmPassword}
              onChange={(e) => handleChange("confirmPassword", e.target.value)}
              className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
            />
          </div>

          {error && <p className="text-red-600 text-lg font-medium">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full text-xl font-semibold bg-maroon-700 text-white rounded-md py-3 mt-2 hover:bg-maroon-800 disabled:opacity-60"
          >
            {submitting ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-lg mt-6 text-gray-700">
          Already have an account?{" "}
          <a href="/login" className="text-maroon-700 underline font-medium">
            Log In
          </a>
        </p>
      </div>
    </main>
  );
}
