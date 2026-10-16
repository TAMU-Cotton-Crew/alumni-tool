"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson, isRateLimited } from "@/lib/api";

interface Request {
  id: number;
  body: string;
  interests: string[];
  state: string;
  created_at: string;
  status: "pending" | "accepted" | "declined";
}

// BAEN Connections Proposals: alumni review anonymous student requests and
// choose to connect (which emails both of them an introduction).
export default function ConnectionsPage() {
  const router = useRouter();
  const [alumniId, setAlumniId] = useState<string | null>(null);
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [messages, setMessages] = useState<
    Record<number, { kind: "ok" | "error" | "limit"; text: string }>
  >({});

  useEffect(() => {
    const id = localStorage.getItem("alumniId");
    if (!id) {
      // Come back here after logging in (links in emails point to this page)
      router.push("/login?next=/connections");
      return;
    }
    setAlumniId(id);
    fetchJson<Request[]>(
      `/api/connections/inbox?alumniId=${encodeURIComponent(id)}`,
      { cache: "no-store" },
    )
      .then(setRequests)
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Something went wrong."),
      );
  }, [router]);

  const respond = async (requestId: number, action: "accept" | "decline") => {
    if (!alumniId) return;
    setBusyId(requestId);
    setMessages((m) => {
      const copy = { ...m };
      delete copy[requestId];
      return copy;
    });
    try {
      await fetchJson(`/api/connections/${requestId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alumniId }),
      });
      setRequests((prev) =>
        (prev ?? []).map((r) =>
          r.id === requestId
            ? { ...r, status: action === "accept" ? "accepted" : "declined" }
            : r,
        ),
      );
      setMessages((m) => ({
        ...m,
        [requestId]:
          action === "accept"
            ? {
                kind: "ok",
                text: "✓ Connected! We've emailed you both an introduction. Check your inbox.",
              }
            : { kind: "ok", text: "Request dismissed." },
      }));
    } catch (err) {
      setMessages((m) => ({
        ...m,
        [requestId]: isRateLimited(err)
          ? {
              kind: "limit",
              text: "Emails are temporarily limited for security reasons. Please try connecting again in an hour.",
            }
          : {
              kind: "error",
              text: err instanceof Error ? err.message : "Something went wrong.",
            },
      }));
    } finally {
      setBusyId(null);
    }
  };

  if (!alumniId) return null;

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const answered = (requests ?? []).filter((r) => r.status !== "pending");

  const renderCard = (r: Request) => {
    const msg = messages[r.id];
    return (
      <div
        key={r.id}
        className="rounded-xl shadow-md border border-gray-200 p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-sm text-gray-600">
            {new Date(r.created_at).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · {r.state}
          </p>
          {r.status === "accepted" && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
              Connected
            </span>
          )}
          {r.status === "declined" && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">
              Dismissed
            </span>
          )}
        </div>

        <p className="text-lg text-gray-900 whitespace-pre-line border-l-4 border-maroon-700 pl-4">
          {r.body}
        </p>

        <div className="flex flex-wrap gap-2 mt-4">
          {r.interests.map((i) => (
            <span
              key={i}
              className="rounded-full bg-maroon-50 px-3 py-1 text-sm text-maroon-800"
            >
              {i}
            </span>
          ))}
        </div>

        {r.status === "pending" && (
          <div className="flex flex-wrap gap-3 mt-5">
            <button
              onClick={() => respond(r.id, "accept")}
              disabled={busyId === r.id}
              className="bg-maroon-700 text-white px-6 py-3 rounded-md font-semibold hover:bg-maroon-800 disabled:opacity-60"
            >
              {busyId === r.id ? "Working..." : "Connect"}
            </button>
            <button
              onClick={() => respond(r.id, "decline")}
              disabled={busyId === r.id}
              className="px-6 py-3 rounded-md border-2 border-gray-400 text-gray-800 hover:bg-gray-50 disabled:opacity-60"
            >
              Not right now
            </button>
          </div>
        )}

        {msg && (
          <p
            className={`mt-3 font-medium ${
              msg.kind === "ok"
                ? "text-green-700"
                : msg.kind === "limit"
                  ? "text-amber-800"
                  : "text-red-600"
            }`}
          >
            {msg.text}
          </p>
        )}
      </div>
    );
  };

  return (
    <main className="flex-1 bg-white px-4 py-10">
      <div className="w-full max-w-3xl mx-auto">
        <a
          href="/home"
          className="inline-block mb-4 text-maroon-700 underline font-medium"
        >
          ← Back to menu
        </a>
        <h1 className="text-3xl font-bold text-maroon-700">
          BAEN Connections Proposals
        </h1>
        <p className="text-lg text-gray-700 mt-2 mb-8">
          BAEN students who&apos;d like to connect with alumni in your area.
          Their names stay private until you choose <strong>Connect</strong>;
          then we&apos;ll introduce you both by email.
        </p>

        {loadError && (
          <p className="text-red-600 text-lg font-medium">{loadError}</p>
        )}
        {!requests && !loadError && (
          <p className="text-lg text-gray-700">Loading requests...</p>
        )}

        {requests && (
          <div className="flex flex-col gap-6">
            {pending.length === 0 && (
              <p className="text-lg text-gray-700">
                No new requests right now. We&apos;ll email you when a student
                reaches out.
              </p>
            )}
            {pending.map(renderCard)}

            {answered.length > 0 && (
              <>
                <h2 className="text-2xl font-bold text-gray-900 mt-6">
                  Past Requests
                </h2>
                {answered.map(renderCard)}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
