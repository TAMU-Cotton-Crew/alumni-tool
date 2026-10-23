"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/api";
import { INDUSTRY_CATEGORIES } from "@/lib/industries";
import { PublicPerson, headline, locationOf, STATUS_STYLES } from "@/lib/people";

// BAEN Connect directory: browse and filter members, then open a profile to connect
export default function DirectoryPage() {
  const router = useRouter();
  const [alumniId, setAlumniId] = useState<string | null>(null);
  const [people, setPeople] = useState<PublicPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [interest, setInterest] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("alumniId");
    if (!id) {
      router.push("/login?next=/directory");
      return;
    }
    setAlumniId(id);
  }, [router]);

  // Reload whenever a filter changes (search waits until typing pauses)
  useEffect(() => {
    if (!alumniId) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ requesterId: alumniId });
      if (query.trim()) params.set("q", query.trim());
      if (status) params.set("status", status);
      if (interest) params.set("interest", interest);
      fetchJson<PublicPerson[]>(`/api/directory?${params}`, { cache: "no-store" })
        .then((rows) => {
          setPeople(rows);
          setError(null);
        })
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Something went wrong."),
        );
    }, 300);
    return () => clearTimeout(timer);
  }, [alumniId, query, status, interest]);

  if (!alumniId) return null;

  return (
    <main className="flex-1 bg-white px-4 py-10">
      <div className="w-full max-w-5xl mx-auto">
        <a href="/portal" className="inline-block mb-4 text-maroon-700 underline font-medium">
          ← Back to BAEN Connect Portal
        </a>
        <h1 className="text-3xl font-bold text-maroon-700">Find People</h1>
        <p className="text-lg text-gray-700 mt-2 mb-6">
          Browse BAEN students, alumni and friends. Open a profile to send a
          connection request.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, major..."
            className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full text-lg text-gray-900 bg-white border-2 border-gray-400 rounded-md p-3"
          >
            <option value="">Everyone</option>
            <option value="Student">Students</option>
            <option value="Alumni">Alumni</option>
            <option value="Friend of BAEN">Friends of BAEN</option>
          </select>
          <select
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
            className="w-full text-lg text-gray-900 bg-white border-2 border-gray-400 rounded-md p-3"
          >
            <option value="">Any area of interest</option>
            {INDUSTRY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-red-600 text-lg font-medium">{error}</p>}
        {!people && !error && <p className="text-lg text-gray-700">Loading...</p>}
        {people && people.length === 0 && (
          <p className="text-lg text-gray-700">No one matches those filters yet.</p>
        )}

        {people && people.length > 0 && (
          <>
            <p className="text-sm text-gray-600 mb-3">
              {people.length} {people.length === 1 ? "person" : "people"}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {people.map((p) => {
                const tags = p.interests ?? [];
                return (
                  <a
                    key={p.id}
                    href={`/people/${p.id}`}
                    className="block rounded-xl border-2 border-gray-200 shadow-md p-5 hover:border-maroon-700 hover:shadow-lg transition"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xl font-semibold text-gray-900">
                        {p.firstName} {p.lastName}
                      </p>
                      {p.classification && (
                        <span className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${STATUS_STYLES[p.classification] ?? "bg-gray-100 text-gray-700"}`}>
                          {p.classification}
                        </span>
                      )}
                      {p.connection_status === "accepted" && (
                        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-sm font-medium text-green-800">
                          Connected
                        </span>
                      )}
                      {p.connection_status === "pending" && (
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-700">
                          Request pending
                        </span>
                      )}
                    </div>
                    {headline(p) && <p className="text-gray-700 mt-1">{headline(p)}</p>}
                    {locationOf(p) && <p className="text-sm text-gray-600">{locationOf(p)}</p>}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {tags.slice(0, 4).map((t) => (
                          <span key={t} className="rounded-full bg-maroon-50 px-3 py-1 text-sm text-maroon-800">
                            {t}
                          </span>
                        ))}
                        {tags.length > 4 && (
                          <span className="text-sm text-gray-600 self-center">+{tags.length - 4} more</span>
                        )}
                      </div>
                    )}
                  </a>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
