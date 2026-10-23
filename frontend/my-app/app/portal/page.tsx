"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { State } from "country-state-city";
import { fetchJson, isRateLimited } from "@/lib/api";
import { INDUSTRY_CATEGORIES } from "@/lib/industries";
import { NETWORKING_GOALS } from "@/lib/networking";
import MultiSelectChecklist from "@/components/MultiSelectChecklist";

const US_STATES = State.getStatesOfCountry("US").map((s) => s.name);
// Must match LOCATION_ANYWHERE / LOCATION_OUTSIDE_US in backend/index.js and backend/messages.js
const ANY_LOCATION = ["Open to any location", "Open to locations outside the US"];

interface MessageOption {
  id: string;
  label: string;
  text: string;
}

// BAEN Connect Portal: pick interests, location and goals, then choose one of
// the pre-written connection messages to send to alumni and friends who opted in
export default function PortalPage() {
  const router = useRouter();
  const [alumniId, setAlumniId] = useState<string | null>(null);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  // Live count for the chosen location (null while nothing is chosen / loading)
  const [locationCount, setLocationCount] = useState<number | null>(null);
  const [countingLocation, setCountingLocation] = useState(false);

  const [interests, setInterests] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [goals, setGoals] = useState<string[]>([]);

  // Pre-written messages built by the server from the profile + selections
  const [options, setOptions] = useState<MessageOption[]>([]);
  const [messageId, setMessageId] = useState<string | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const [result, setResult] = useState<{
    sent: number;
    total: number;
    partial: boolean;
  } | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("alumniId");
    if (!id) {
      router.push("/login");
      return;
    }
    setAlumniId(id);
    fetchJson<{ count: number }>(
      `/api/portal/recipient-count?requesterId=${encodeURIComponent(id)}`,
      { cache: "no-store" },
    )
      .then((d) => setRecipientCount(d.count))
      .catch(() => setRecipientCount(null));

    // Start from the interests and goals saved on their profile
    fetchJson<{ interests: string[] | null; networking_goals: string[] | null }>(
      `/api/alumni/${id}`,
      { cache: "no-store" },
    )
      .then((p) => {
        setInterests((cur) => (cur.length ? cur : (p.interests ?? []).filter((i) => INDUSTRY_CATEGORIES.includes(i))));
        setGoals((cur) => (cur.length ? cur : (p.networking_goals ?? []).filter((g) => NETWORKING_GOALS.includes(g))));
      })
      .catch(() => {});
  }, [router]);

  // Rebuild the suggested messages whenever the selections change
  const ready = interests.length > 0 && location !== "" && goals.length > 0;
  useEffect(() => {
    if (!alumniId || !ready) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setLoadingOptions(true);
    const timer = setTimeout(() => {
      fetchJson<{ options: MessageOption[] }>("/api/portal/message-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alumniId, interests, state: location, goals }),
      })
        .then((d) => {
          if (cancelled) return;
          setOptions(d.options);
          // Keep their pick if that style still exists
          setMessageId((cur) => (d.options.some((o) => o.id === cur) ? cur : null));
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        })
        .finally(() => {
          if (!cancelled) setLoadingOptions(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [alumniId, ready, interests, location, goals]);

  // Re-count possible connections whenever the location changes
  useEffect(() => {
    if (!alumniId || !location) {
      setLocationCount(null);
      return;
    }
    let cancelled = false; // ignore answers for a location that's no longer selected
    setCountingLocation(true);
    fetchJson<{ count: number }>(
      `/api/portal/recipient-count?requesterId=${encodeURIComponent(
        alumniId,
      )}&state=${encodeURIComponent(location)}`,
      { cache: "no-store" },
    )
      .then((d) => {
        if (!cancelled) setLocationCount(d.count);
      })
      .catch(() => {
        if (!cancelled) setLocationCount(null);
      })
      .finally(() => {
        if (!cancelled) setCountingLocation(false);
      });
    return () => {
      cancelled = true;
    };
  }, [alumniId, location]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLimitNotice(null);

    if (interests.length === 0) {
      setError("Please choose at least one area of interest.");
      return;
    }
    if (!location) {
      setError("Please choose a location of interest.");
      return;
    }
    if (locationCount === 0) {
      setError("There are no alumni to connect with in that location yet.");
      return;
    }
    if (goals.length === 0) {
      setError("Please choose what you're looking to gain from this network.");
      return;
    }
    if (!messageId) {
      setError("Please choose one of the suggested messages.");
      return;
    }

    setSending(true);
    try {
      const data = await fetchJson<{
        sent: number;
        total: number;
        partial: boolean;
      }>("/api/portal/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alumniId,
          interests,
          state: location,
          goals,
          messageId,
        }),
      });
      setResult(data);
    } catch (err) {
      if (isRateLimited(err)) {
        setLimitNotice(
          "For security reasons, emails have been temporarily limited. Your proposal was not sent. Please try again in an hour.",
        );
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setSending(false);
    }
  };

  if (!alumniId) return null;

  // ---- After sending ----
  if (result) {
    return (
      <main className="flex-1 flex items-center justify-center bg-white px-4 py-10">
        <div className="w-full max-w-xl text-center">
          <h1 className="text-3xl font-bold text-maroon-700 mb-4">
            BAEN Connect Portal
          </h1>
          <div
            role="status"
            className={`rounded-xl border-2 p-6 text-left ${
              result.partial
                ? "border-amber-500 bg-amber-50"
                : "border-green-600 bg-green-50"
            }`}
          >
            <p
              className={`text-xl font-semibold ${
                result.partial ? "text-amber-900" : "text-green-800"
              }`}
            >
              {result.partial
                ? `Sent to ${result.sent} of ${result.total} alumni`
                : `✓ Proposal sent to ${result.sent} alumni`}
            </p>
            <p
              className={`text-base mt-2 ${
                result.partial ? "text-amber-900" : "text-green-900"
              }`}
            >
              {result.partial
                ? "Email sending was limited partway through, so not everyone received it."
                : "Your request was sent anonymously. Alumni only see what you wrote until they choose to connect."}{" "}
              If any Alumni choose to connect with you, you should receive an email from DoNotReply@cottoncrew.org with the alumni CC'd.
            </p>
          </div>
          <a
            href="/home"
            className="inline-block mt-8 text-lg text-maroon-700 underline font-medium"
          >
            ← Back to menu
          </a>
        </div>
      </main>
    );
  }

  /*Need to make sure location checks for outside of US is where state is = null this is the best way I can imagine to confirm the alumni is in US.*/
  //

  // ---- Proposal form ----
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
          BAEN Connect Portal
        </h1>

        <p className="text-lg text-gray-700 mt-2 mb-8">
          Tell us what you&apos;re looking for, choose a message, and
          we&apos;ll send your connection request to BAEN alumni and friends
          in your location of interest who have offered to connect.
          {recipientCount !== null && (
            <>
              {" "}
              <strong>
                {recipientCount} {recipientCount === 1 ? "alumnus has" : "alumni have"}
              </strong>{" "}
              offered to connect so far.
            </>
          )}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-8">
          {/* Interests */}
          <section className="rounded-xl shadow-md border border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              Areas of Interest
            </h2>
            <p className="text-gray-600 mb-4">Select all that apply.</p>
            <MultiSelectChecklist
              options={INDUSTRY_CATEGORIES}
              selected={interests}
              onChange={setInterests}
              searchable
              columns={2}
            />
          </section>

          {/* Location */}
          <section className="rounded-xl shadow-md border border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              Location of Interest
            </h2>
            <p
              className={`mb-4 font-medium ${
                locationCount === 0 ? "text-red-600" : "text-maroon-700"
              }`}
              aria-live="polite"
            >
              {!location
                ? "\u00a0"
                : countingLocation
                  ? "Counting possible connections..."
                  : locationCount === null
                    ? "\u00a0"
                    : locationCount === 0
                      ? `No possible connections for ${location} yet`
                      : `${locationCount} possible ${
                          locationCount === 1 ? "connection" : "connections"
                        } for ${location}`}
            </p>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full text-lg text-gray-900 bg-white border-2 border-gray-400 rounded-md p-3"
            >
              <option value="">-- Select a State/Location --</option>
              {ANY_LOCATION.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
              ))}
              {US_STATES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </section>

          {/* Networking goals */}
          <section className="rounded-xl shadow-md border border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              What are you looking to gain from this network?
            </h2>
            <p className="text-gray-600 mb-4">Select all that apply.</p>
            <MultiSelectChecklist
              options={NETWORKING_GOALS}
              selected={goals}
              onChange={setGoals}
              columns={2}
            />
          </section>

          {/* Choose a message */}
          <section className="rounded-xl shadow-md border border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              Choose your connection message
            </h2>
            <p className="text-gray-600 mb-4">
              We write these from your profile and the choices above. Pick the
              one that fits you best. Alumni won&apos;t see your name until they
              choose to connect.
            </p>

            {!ready && (
              <p className="text-gray-700 italic">
                Choose your areas of interest, a location, and what you&apos;re
                looking for to see suggested messages.
              </p>
            )}
            {ready && loadingOptions && options.length === 0 && (
              <p className="text-gray-700">Writing suggestions...</p>
            )}

            <div className="flex flex-col gap-3" role="radiogroup">
              {options.map((o) => (
                <label
                  key={o.id}
                  className={`block cursor-pointer rounded-lg border-2 p-4 transition ${
                    messageId === o.id
                      ? "border-maroon-700 bg-maroon-50"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="message"
                      value={o.id}
                      checked={messageId === o.id}
                      onChange={() => setMessageId(o.id)}
                      className="w-5 h-5"
                    />
                    <span className="text-lg font-semibold text-gray-900">{o.label}</span>
                  </span>
                  <span className="block text-gray-800 mt-2 ml-8">{o.text}</span>
                </label>
              ))}
            </div>
          </section>

          {limitNotice && (
            <div
              role="alert"
              className="rounded-md border-2 border-amber-500 bg-amber-50 p-4"
            >
              <p className="text-lg font-semibold text-amber-900">
                Emails are temporarily limited
              </p>
              <p className="text-base text-amber-900 mt-1">{limitNotice}</p>
            </div>
          )}
          {error && <p className="text-red-600 text-lg font-medium">{error}</p>}

          <div>
            <button
              type="submit"
              disabled={sending || recipientCount === 0 || locationCount === 0 || !messageId}
              className="w-full sm:w-auto text-xl font-semibold bg-maroon-700 text-white rounded-md px-8 py-3 hover:bg-maroon-800 disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send Proposal"}
            </button>
            <p className="text-sm text-gray-600 mt-2">
              {recipientCount === 0
                ? "No alumni are signed up to receive proposals yet."
                : locationCount === 0
                  ? "Choose a location with at least one possible connection."
                  : "You can send one proposal every 24 hours. If an alum connects, we'll introduce you both by email."}
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
