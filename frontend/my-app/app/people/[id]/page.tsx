"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchJson, isRateLimited } from "@/lib/api";
import { PublicPerson, headline, locationOf, STATUS_STYLES } from "@/lib/people";
import {
  MessagePerson,
  containsLink,
  countWords,
  generateConnectionMessage,
} from "@/lib/connectMessage";

const MAX_WORDS = 150;

// A member's profile, with a Connect panel that pre-fills a personalized message
export default function PersonPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const personId = params.id;

  const [alumniId, setAlumniId] = useState<string | null>(null);
  const [person, setPerson] = useState<PublicPerson | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [suggested, setSuggested] = useState("");
  const [message, setMessage] = useState("");
  const [composing, setComposing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ emailed: boolean } | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("alumniId");
    if (!id) {
      router.push(`/login?next=/people/${personId}`);
      return;
    }
    setAlumniId(id);

    // Load their public profile and my own profile (for the suggested message)
    Promise.all([
      fetchJson<PublicPerson>(`/api/people/${personId}?requesterId=${encodeURIComponent(id)}`, { cache: "no-store" }),
      fetchJson<MessagePerson>(`/api/alumni/${id}`, { cache: "no-store" }),
    ])
      .then(([them, me]) => {
        setPerson(them);
        const text = generateConnectionMessage(me, them);
        setSuggested(text);
        setMessage(text);
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Something went wrong."),
      );
  }, [router, personId]);

  const words = countWords(message);
  const hasLink = containsLink(message);
  const isSelf = alumniId !== null && String(person?.id) === alumniId;

  const send = async () => {
    if (!alumniId || !person) return;
    setSendError(null);
    if (words < 5) return setSendError("Please include a short introduction.");
    if (words > MAX_WORDS) return setSendError(`Please keep your message under ${MAX_WORDS} words.`);
    if (hasLink) return setSendError("Links aren't allowed in connection messages.");

    setSending(true);
    try {
      const result = await fetchJson<{ emailed: boolean }>("/api/connections/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alumniId, recipientId: person.id, message }),
      });
      setSent(result);
      setComposing(false);
      setPerson({ ...person, connection_status: "pending" });
    } catch (err) {
      setSendError(
        isRateLimited(err)
          ? "Emails are temporarily limited. Please try again in an hour."
          : err instanceof Error
            ? err.message
            : "Something went wrong.",
      );
    } finally {
      setSending(false);
    }
  };

  if (!alumniId) return null;

  return (
    <main className="flex-1 bg-white px-4 py-10">
      <div className="w-full max-w-3xl mx-auto">
        <a href="/directory" className="inline-block mb-4 text-maroon-700 underline font-medium">
          ← Back to directory
        </a>

        {loadError && <p className="text-red-600 text-lg font-medium">{loadError}</p>}
        {!person && !loadError && <p className="text-lg text-gray-700">Loading profile...</p>}

        {person && (
          <>
            {/* Profile */}
            <section className="rounded-xl shadow-md border border-gray-200 p-6 mb-6">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold text-maroon-700">
                  {person.firstName} {person.lastName}
                </h1>
                {person.classification && (
                  <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_STYLES[person.classification] ?? "bg-gray-100 text-gray-700"}`}>
                    {person.classification}
                  </span>
                )}
              </div>
              {headline(person) && <p className="text-lg text-gray-800 mt-2">{headline(person)}</p>}
              {locationOf(person) && <p className="text-gray-600">{locationOf(person)}</p>}

              {person.degrees && person.degrees.length > 0 && (
                <p className="text-gray-700 mt-3">
                  {person.degrees.map((d) => `${d.degree_name}${d.year_conferred ? ` (${d.year_conferred})` : ""}`).join(" · ")}
                </p>
              )}

              {(person.interests ?? []).length > 0 && (
                <>
                  <h2 className="text-lg font-semibold text-gray-900 mt-5 mb-2">Areas of Interest</h2>
                  <div className="flex flex-wrap gap-2">
                    {(person.interests ?? []).map((t) => (
                      <span key={t} className="rounded-full bg-maroon-50 px-3 py-1 text-sm text-maroon-800">{t}</span>
                    ))}
                  </div>
                </>
              )}

              {(person.networking_goals ?? []).length > 0 && (
                <>
                  <h2 className="text-lg font-semibold text-gray-900 mt-5 mb-2">Looking For</h2>
                  <div className="flex flex-wrap gap-2">
                    {(person.networking_goals ?? []).map((g) => (
                      <span key={g} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-800">{g}</span>
                    ))}
                  </div>
                </>
              )}

              {person.bio && (
                <p className="text-gray-800 mt-5 whitespace-pre-line">{person.bio}</p>
              )}
            </section>

            {/* Connect */}
            {!isSelf && (
              <section className="rounded-xl shadow-md border border-gray-200 p-6">
                {person.connection_status === "accepted" && (
                  <p className="text-lg font-medium text-green-700">
                    ✓ You&apos;re connected. Check your email for the introduction.
                  </p>
                )}

                {person.connection_status === "pending" && (
                  <div>
                    <p className="text-lg font-medium text-gray-800">
                      {sent ? "✓ Request sent!" : "Connection request pending."}
                    </p>
                    <p className="text-gray-600 mt-1">
                      {sent && !sent.emailed
                        ? `We couldn't email ${person.firstName} right now, but they'll see your request next time they visit Connections.`
                        : `If ${person.firstName} accepts, we'll introduce you both by email.`}
                    </p>
                  </div>
                )}

                {!person.connection_status && !composing && (
                  <button
                    onClick={() => setComposing(true)}
                    className="text-xl font-semibold bg-maroon-700 text-white rounded-md px-8 py-3 hover:bg-maroon-800"
                  >
                    Connect with {person.firstName}
                  </button>
                )}

                {!person.connection_status && composing && (
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-1">Your introduction</h2>
                    <p className="text-gray-600 mb-3">
                      We wrote this from both of your profiles. Feel free to edit it.
                    </p>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={8}
                      className="w-full text-lg text-gray-900 bg-white border-2 border-gray-400 rounded-md p-3"
                    />
                    <div className="flex flex-wrap justify-between gap-2 mt-1 text-sm">
                      <span className={words > MAX_WORDS ? "text-red-600 font-medium" : "text-gray-600"}>
                        {words} / {MAX_WORDS} words
                      </span>
                      {message !== suggested && (
                        <button onClick={() => setMessage(suggested)} className="text-maroon-700 underline font-medium">
                          Reset to suggested message
                        </button>
                      )}
                    </div>
                    {hasLink && (
                      <p className="text-red-600 mt-2">Links aren&apos;t allowed. You can share them after you connect.</p>
                    )}
                    {sendError && <p className="text-red-600 text-lg font-medium mt-3">{sendError}</p>}
                    <div className="flex flex-wrap gap-3 mt-4">
                      <button
                        onClick={send}
                        disabled={sending || words > MAX_WORDS || hasLink}
                        className="text-xl font-semibold bg-maroon-700 text-white rounded-md px-8 py-3 hover:bg-maroon-800 disabled:opacity-60"
                      >
                        {sending ? "Sending..." : "Send Request"}
                      </button>
                      <button
                        onClick={() => setComposing(false)}
                        className="px-6 py-3 rounded-md border-2 border-gray-400 text-gray-800 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 mt-3">
                      {person.firstName} will see your name and this message. Your email is only shared if they accept.
                    </p>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
