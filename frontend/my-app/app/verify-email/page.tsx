"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { fetchJson } from "@/lib/api";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("This verification link is missing information.");
      return;
    }

    const verify = async () => {
      try {
        const data = await fetchJson<{ message: string }>(
          `/api/alumni/verify-email?token=${encodeURIComponent(token)}`,
        );
        setStatus("success");
        setMessage(data.message);
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Verification failed.");
      }
    };

    verify();
  }, [token]);

  return (
    <div className="w-full max-w-md text-center">
      <h1 className="text-3xl font-bold text-maroon-700 mb-4">
        Email Verification
      </h1>

      {status === "loading" && (
        <p className="text-xl text-gray-700">Verifying...</p>
      )}

      {status === "success" && (
        <>
          <p className="text-xl text-green-700 mb-6">{message}</p>
          <a
            href="/login"
            className="inline-block text-xl font-semibold bg-maroon-700 text-white rounded-md py-3 px-8 hover:bg-maroon-800"
          >
            Go to Log In
          </a>
        </>
      )}

      {status === "error" && <p className="text-xl text-red-600">{message}</p>}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="flex-1 flex items-center justify-center bg-white px-4 py-10">
      <Suspense
        fallback={
          <p className="text-xl text-gray-700">Loading verification...</p>
        }
      >
        <VerifyEmailContent />
      </Suspense>
    </main>
  );
}
