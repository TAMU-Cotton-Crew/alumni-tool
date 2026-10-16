"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/api";

interface AdminAlumnus {
  id: number;
  classification: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  job_title: string | null;
  industry_category: string | null;
  work_city: string | null;
  work_state: string | null;
  work_country: string | null;
  seeking_internship: boolean;
  seeking_fulltime: boolean;
  seeking_grad_school: boolean;
  open_to_research: boolean;
  degrees: string;
}

type SortKey = keyof AdminAlumnus;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "lastName", label: "Last Name" },
  { key: "firstName", label: "First Name" },
  { key: "classification", label: "Classification" },
  { key: "email", label: "Email" },
  { key: "degrees", label: "Degrees" },
  { key: "company", label: "Company" },
  { key: "job_title", label: "Job Title" },
  { key: "industry_category", label: "Industry" },
  { key: "work_city", label: "City" },
  { key: "work_state", label: "State" },
];

export default function AdminPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AdminAlumnus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("lastName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    const alumniId = localStorage.getItem("alumniId");
    const isAdmin = localStorage.getItem("isAdmin");

    if (!alumniId || isAdmin !== "true") {
      router.push("/login");
      return;
    }

    const load = async () => {
      try {
        const data = await fetchJson<AdminAlumnus[]>(
          `/api/admin/alumni?requesterId=${alumniId}`,
        );
        setRows(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load directory.",
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [router]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      // Booleans first (for the "seeking" flags if you sort by them later)
      if (typeof aVal === "boolean" || typeof bVal === "boolean") {
        const aNum = aVal ? 1 : 0;
        const bNum = bVal ? 1 : 0;
        return sortDir === "asc" ? aNum - bNum : bNum - aNum;
      }

      const aStr = (aVal ?? "").toString().toLowerCase();
      const bStr = (bVal ?? "").toString().toLowerCase();

      if (aStr < bStr) return sortDir === "asc" ? -1 : 1;
      if (aStr > bStr) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const handleLogout = () => {
    localStorage.removeItem("alumniId");
    localStorage.removeItem("alumniName");
    localStorage.removeItem("isAdmin");
    router.push("/");
  };

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center bg-white">
        <p className="text-xl text-gray-700">Loading directory...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center bg-white">
        <p className="text-xl text-red-600">{error}</p>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-white px-6 py-10">
      <a href="/home" className="inline-block mb-4 text-maroon-700 underline font-medium">
        ← Back to menu
      </a>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-maroon-700">Admin Directory</h1>
        <button
          onClick={handleLogout}
          className="text-lg font-medium text-maroon-700 underline"
        >
          Log Out
        </button>
      </div>

      <p className="text-gray-600 mb-4">
        {rows.length} {rows.length === 1 ? "person" : "people"} on file. Click a
        column heading to sort.
      </p>

      <div className="overflow-x-auto border-2 border-gray-200 rounded-md">
        <table className="min-w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="cursor-pointer select-none px-4 py-3 text-base font-semibold text-gray-800 border-b-2 border-gray-300 hover:bg-gray-200"
                >
                  {col.label}
                  {sortKey === col.key && (sortDir === "asc" ? " ▲" : " ▼")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-gray-200 hover:bg-gray-50"
              >
                <td className="px-4 py-3 text-base text-gray-800">
                  {row.lastName}
                </td>
                <td className="px-4 py-3 text-base text-gray-800">
                  {row.firstName}
                </td>
                <td className="px-4 py-3 text-base text-gray-800">
                  {row.classification}
                </td>
                <td className="px-4 py-3 text-base text-gray-800">
                  {row.email}
                </td>
                <td className="px-4 py-3 text-base text-gray-800">
                  {row.degrees || "—"}
                </td>
                <td className="px-4 py-3 text-base text-gray-800">
                  {row.company || "—"}
                </td>
                <td className="px-4 py-3 text-base text-gray-800">
                  {row.job_title || "—"}
                </td>
                <td className="px-4 py-3 text-base text-gray-800">
                  {row.industry_category || "—"}
                </td>
                <td className="px-4 py-3 text-base text-gray-800">
                  {row.work_city || "—"}
                </td>
                <td className="px-4 py-3 text-base text-gray-800">
                  {row.work_state || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
