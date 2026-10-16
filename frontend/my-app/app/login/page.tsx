"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson, isRateLimited } from "@/lib/api";

// Remembered across refreshes so the notice stays up for the full hour
const RATE_LIMIT_KEY = "signInLimitedUntil";
const DEFAULT_LIMIT_SECONDS = 60 * 60;

export default function Login() {
  const router = useRouter();

  const [step, setStep] = useState<"credentials" | "mfa">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [alumniId, setAlumniId] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // "idle" -> "sending" -> "sent" (stays sent so the email is only ever resent once)
  const [resendStatus, setResendStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [resendError, setResendError] = useState<string | null>(null);

  // Set when the server answers 429 (email quota reached): timestamp in ms
  const [limitedUntil, setLimitedUntil] = useState<number | null>(null);
  const isLimited = limitedUntil !== null && Date.now() < limitedUntil;

  // Restore an active limit after a refresh, and clear it once the hour is up
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(RATE_LIMIT_KEY));
      if (saved && saved > Date.now()) setLimitedUntil(saved);
      else localStorage.removeItem(RATE_LIMIT_KEY);
    } catch {}
  }, []);

  useEffect(() => {
    if (!limitedUntil) return;
    const ms = limitedUntil - Date.now();
    const timer = setTimeout(() => {
      setLimitedUntil(null);
      try {
        localStorage.removeItem(RATE_LIMIT_KEY);
      } catch {}
    }, Math.max(ms, 0));
    return () => clearTimeout(timer);
  }, [limitedUntil]);

  const startRateLimit = (retryAfterSeconds?: unknown) => {
    const seconds =
      typeof retryAfterSeconds === "number" && retryAfterSeconds > 0
        ? retryAfterSeconds
        : DEFAULT_LIMIT_SECONDS;
    const until = Date.now() + seconds * 1000;
    setLimitedUntil(until);
    setError(null);
    try {
      localStorage.setItem(RATE_LIMIT_KEY, String(until));
    } catch {}
  };

  const limitedUntilText = limitedUntil
    ? new Date(limitedUntil).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  // Save the logged-in user and go to their page (used with or without MFA)
  const completeLogin = (user: {
    id: number;
    firstName: string;
    lastName: string;
    isAdmin: boolean;
  }) => {
    localStorage.setItem("alumniId", String(user.id));
    localStorage.setItem("alumniName", `${user.firstName} ${user.lastName}`);
    localStorage.setItem("isAdmin", String(user.isAdmin));
    // e.g. /login?next=/connections when coming from a connection-request email
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/home");
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setSubmitting(true);

    try {
      const data = await fetchJson<{
        mfaRequired: boolean;
        alumniId?: number;
        id?: number;
        firstName?: string;
        lastName?: string;
        isAdmin?: boolean;
      }>("/api/alumni/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      // MFA is turned off on the server: skip the code screen
      if (!data.mfaRequired) {
        completeLogin({
          id: data.id!,
          firstName: data.firstName ?? "",
          lastName: data.lastName ?? "",
          isAdmin: Boolean(data.isAdmin),
        });
        return;
      }

      setAlumniId(data.alumniId ?? null);
      setStep("mfa");
    } catch (err) {
      if (isRateLimited(err)) {
        startRateLimit(err.body?.retryAfterSeconds);
        return;
      }
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      if (message.toLowerCase().includes("verify your email")) {
        setNeedsVerification(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const user = await fetchJson<{
        id: number;
        firstName: string;
        lastName: string;
        isAdmin: boolean;
      }>("/api/alumni/verify-mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alumniId, code }),
      });

      completeLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    // Only allow one resend: ignore clicks while sending or after it succeeded
    if (resendStatus === "sending" || resendStatus === "sent") return;

    setResendStatus("sending");
    setResendError(null);
    try {
      await fetchJson<{ message: string }>("/api/alumni/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResendStatus("sent");
    } catch (err) {
      // Email quota reached: explain it here at the resend button only.
      // The "sign-ins are limited" notice is reserved for the login request,
      // which can only hit the limit when MFA is on (it emails a code).
      if (isRateLimited(err)) {
        setResendStatus("error");
        setResendError(
          "We couldn't send the email right now because emails are temporarily limited. Please try again in an hour.",
        );
        return;
      }
      // A failed request didn't send anything, so let them try again
      setResendStatus("error");
      setResendError(
        `${err instanceof Error ? err.message : "Something went wrong."} Please try again.`,
      );
    }
  };

  if (step === "mfa") {
    return (
      <main className="flex-1 flex items-center justify-center bg-white px-4 py-10">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-4 text-maroon-700">
            Enter Your Code
          </h1>
          <p className="text-lg text-gray-700 text-center mb-8">
            We sent a login code to your email. It may take a minute to arrive.
          </p>

          <form onSubmit={handleMfaSubmit} className="flex flex-col gap-5">
            <div>
              <label className="block text-lg font-medium text-gray-800 mb-1">
                Login Code
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full text-2xl text-gray-800 tracking-widest text-center border-2 border-gray-400 rounded-md p-3 uppercase"
                placeholder="XXXXXXXXXXXX"
                maxLength={12}
              />
            </div>

            {error && (
              <p className="text-red-600 text-lg font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full text-xl font-semibold bg-maroon-700 text-white rounded-md py-3 hover:bg-maroon-800 disabled:opacity-60"
            >
              {submitting ? "Checking..." : "Log In"}
            </button>
          </form>

          <p className="text-center text-lg mt-6 text-gray-700">
            <button
              onClick={() => {
                setStep("credentials");
                setCode("");
                setError(null);
              }}
              className="text-maroon-700 underline font-medium"
            >
              Start Over
            </button>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-8 text-maroon-700">
          Log In
        </h1>

        <form
          onSubmit={handleCredentialsSubmit}
          className="flex flex-col gap-5"
        >
          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              Email Address
            </label>
            <p className="text-sm text-gray-600 mb-1">
              Your main email or the backup email on your profile
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-gray-900 text-lg border-2 border-gray-400 rounded-md p-3"
            />
          </div>

          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-lg text-gray-900 border-2 border-gray-400 rounded-md p-3"
            />
          </div>

          {isLimited && (
            <div
              role="alert"
              className="rounded-md border-2 border-amber-500 bg-amber-50 p-4"
            >
              <p className="text-lg font-semibold text-amber-900">
                Sign-ins are temporarily limited
              </p>
              <p className="text-base text-amber-900 mt-1">
                For security reasons, sign-ins have been limited. Please try
                again in an hour (after {limitedUntilText}).
              </p>
            </div>
          )}

          {error && <p className="text-red-600 text-lg font-medium">{error}</p>}

          {needsVerification && (
            <div>
              {resendStatus === "sent" ? (
                <div
                  role="status"
                  className="rounded-md border-2 border-green-600 bg-green-50 p-4"
                >
                  <p className="text-lg font-semibold text-green-800">
                    ✓ Verification email sent
                  </p>
                  <p className="text-base text-green-900 mt-1">
                    We sent a new link to <strong>{email}</strong>. Check your
                    inbox and spam folder. The link expires in 24 hours.
                  </p>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendStatus === "sending"}
                    className="text-lg text-maroon-700 underline font-medium disabled:opacity-60 disabled:no-underline"
                  >
                    {resendStatus === "sending"
                      ? "Sending..."
                      : "Resend Verification Email"}
                  </button>
                  {resendStatus === "error" && resendError && (
                    <p className="text-red-600 mt-2">
                      {resendError}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || isLimited}
            className="w-full text-xl font-semibold bg-maroon-700 text-white rounded-md py-3 hover:bg-maroon-800 disabled:opacity-60"
          >
            {submitting ? "Checking..." : "Continue"}
          </button>
        </form>

        <p className="text-center text-lg mt-4 text-gray-700">
          <a
            href="/forgot-password"
            className="text-maroon-700 underline font-medium"
          >
            Forgot your password?
          </a>
        </p>

        <p className="text-center text-lg mt-4 text-gray-700">
          Don't have an account?{" "}
          <a href="/signup" className="text-maroon-700 underline font-medium">
            Sign Up
          </a>
        </p>
      </div>
    </main>
  );
}
