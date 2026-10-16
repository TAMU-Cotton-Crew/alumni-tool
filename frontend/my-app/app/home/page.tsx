"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/api";

// Menu shown after logging in: choose where to go next
export default function HomeMenu() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [isAlumni, setIsAlumni] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const id = localStorage.getItem("alumniId");
    if (!id) {
      router.push("/login");
      return;
    }
    setName((localStorage.getItem("alumniName") || "").split(" ")[0]);
    setIsAdmin(localStorage.getItem("isAdmin") === "true");
    setReady(true);

    // Alumni get the connection-requests card (with a count of new requests)
    fetchJson<{ classification: string }>(`/api/alumni/${id}`, {
      cache: "no-store",
    })
      .then(async (p) => {
        if (!["Alumni", "Friend of BAEN"].includes(p.classification)) return;
        setIsAlumni(true);
        const inbox = await fetchJson<{ status: string }[]>(
          `/api/connections/inbox?alumniId=${encodeURIComponent(id)}`,
          { cache: "no-store" },
        );
        setPendingCount(inbox.filter((r) => r.status === "pending").length);
      })
      .catch(() => {});
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("alumniId");
    localStorage.removeItem("alumniName");
    localStorage.removeItem("isAdmin");
    router.push("/");
  };

  if (!ready) return null;

  const cardClass =
    "block w-full rounded-xl border-2 border-gray-200 shadow-md p-6 text-left hover:border-maroon-700 hover:shadow-lg transition";

  return (
    <main className="flex-1 flex items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-maroon-700 mb-2">
          {name ? `Welcome, ${name}` : "Welcome"}
        </h1>
        <p className="text-lg text-gray-700 text-center mb-8">
          Where would you like to go?
        </p>

        <div className="flex flex-col gap-4">
          <a href="/profile" className={cardClass}>
            <p className="text-xl font-semibold text-gray-900">My Profile</p>
            <p className="text-gray-600 mt-1">
              View and update your information.
            </p>
          </a>

          <a href="/portal" className={cardClass}>
            <p className="text-xl font-semibold text-gray-900">
              BAEN Connect Portal
            </p>
            <p className="text-gray-600 mt-1">
              Connect with the BAEN community.
            </p>
          </a>

          {isAlumni && (
            <a href="/connections" className={cardClass}>
              <p className="text-xl font-semibold text-gray-900">
                BAEN Connections Proposals
                {pendingCount > 0 && (
                  <span className="ml-2 inline-block rounded-full bg-maroon-700 px-2.5 py-0.5 text-sm font-semibold text-white align-middle">
                    {pendingCount} new
                  </span>
                )}
              </p>
              <p className="text-gray-600 mt-1">
                Review requests from BAEN students and choose who to connect
                with.
              </p>
            </a>
          )}

          {isAdmin && (
            <a href="/admin" className={cardClass}>
              <p className="text-xl font-semibold text-gray-900">
                Admin Directory
              </p>
              <p className="text-gray-600 mt-1">
                View and sort all alumni and student profiles.
              </p>
            </a>
          )}
        </div>

        <div className="flex justify-center mt-10">
          <button
            onClick={handleLogout}
            className="text-red-600 text-lg font-medium underline"
          >
            Log Out
          </button>
        </div>
      </div>
    </main>
  );
}
