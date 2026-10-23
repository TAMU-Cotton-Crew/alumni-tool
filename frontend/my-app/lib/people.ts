// Shared types/helpers for directory and profile pages

export interface PublicPerson {
  id: number;
  firstName: string;
  lastName: string;
  classification: string | null;
  company: string | null;
  job_title: string | null;
  industry_category: string | null;
  work_city: string | null;
  work_state: string | null;
  work_country: string | null;
  major: string | null;
  grad_year: string | null;
  hometown: string | null;
  interests: string[] | null;
  networking_goals: string[] | null;
  connection_status: "pending" | "accepted" | null;
  bio?: string | null;
  degrees?: { degree_level: string; degree_name: string; year_conferred: number }[];
}

// One-line summary under someone's name
export function headline(p: PublicPerson): string {
  if (p.classification === "Student") {
    return [p.major, p.grad_year ? `Class of ${p.grad_year}` : ""].filter(Boolean).join(" · ");
  }
  if (p.job_title && p.company) return `${p.job_title} at ${p.company}`;
  return p.job_title || p.company || p.industry_category || "";
}

export function locationOf(p: PublicPerson): string {
  const place = [p.work_city, p.work_state].filter(Boolean).join(", ");
  if (place) return place;
  if (p.work_country && p.work_country !== "United States") return p.work_country;
  return p.classification === "Student" ? p.hometown ?? "" : "";
}

export const STATUS_STYLES: Record<string, string> = {
  Student: "bg-blue-50 text-blue-800",
  Alumni: "bg-maroon-50 text-maroon-800",
  "Friend of BAEN": "bg-amber-50 text-amber-800",
};
