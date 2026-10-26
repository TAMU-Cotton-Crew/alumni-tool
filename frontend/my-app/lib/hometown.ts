// A student's hometown is saved in the existing `hometown` text column as a
// small JSON object, so no database change is needed:
//   US:     {"country":"United States","state":"Texas","city":"Bryan","zip":"77801"}
//   Others: {"country":"Canada"}
// In SQL you can still read the parts, e.g.  hometown::json->>'state'

export interface Hometown {
  country: string;
  state: string;
  city: string;
  zip: string;
}

export const EMPTY_HOMETOWN: Hometown = { country: "", state: "", city: "", zip: "" };

export function parseHometown(text: string | null | undefined): Hometown {
  if (!text) return { ...EMPTY_HOMETOWN };
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object") {
      return {
        country: typeof v.country === "string" ? v.country : "",
        state: typeof v.state === "string" ? v.state : "",
        city: typeof v.city === "string" ? v.city : "",
        zip: typeof v.zip === "string" ? v.zip : "",
      };
    }
  } catch {
    // Older free-text value like "Bryan, TX": start over with the new fields
  }
  return { ...EMPTY_HOMETOWN };
}

export function serializeHometown(h: Hometown): string {
  if (!h.country) return "";
  if (h.country !== "United States") return JSON.stringify({ country: h.country });
  return JSON.stringify({ country: h.country, state: h.state, city: h.city, zip: h.zip });
}

// "Bryan, Texas 77801" or "Canada"
export function formatHometown(h: Hometown): string {
  if (h.country !== "United States") return h.country;
  const cityState = [h.city, h.state].filter(Boolean).join(", ");
  return [cityState, h.zip].filter(Boolean).join(" ") || h.country;
}
