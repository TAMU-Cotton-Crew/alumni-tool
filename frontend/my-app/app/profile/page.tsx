"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/api";
import { TAMU_DEGREES, DEGREE_TYPES } from "@/lib/degrees";
import { INDUSTRY_CATEGORIES } from "@/lib/industries";
import { Country, State, City } from "country-state-city";

/* Look to expand Industry List, There also exists a column for work_state and I've added one for work_zipcode */

/* Consider Degree Programs Instead and then Other */

const countries = [...Country.getAllCountries()].sort((a, b) => {
  if (a.isoCode === "US") return -1;
  if (b.isoCode === "US") return 1;
  return a.name.localeCompare(b.name);
});

const usStates = State.getStatesOfCountry("US");

interface Degree {
  id: number;
  degree_level: string;
  degree_name: string;
  year_conferred: number;
}

interface Profile {
  id: number;
  classification: string;
  firstName: string;
  lastName: string;
  email: string;
  backup_email: string | null;
  company: string | null;
  job_title: string | null;
  job_description: string | null;
  industry_category: string | null;
  work_city: string | null; /* Currently work_city is showing counties... */
  work_state: string | null;
  work_country: string | null;
  work_zipcode: string | null;
  linkedin_url: string | null;
  seeking_internship: boolean;
  seeking_fulltime: boolean;
  seeking_grad_school: boolean;
  hiring_employees: boolean;
  reconnect_baen: boolean;
  capstone_client: boolean;
  baen_activities: boolean;
  baen_updates: boolean;
  baen_fundraising: boolean;
  visit_department: boolean;
  bio: string | null;
  degrees: Degree[];
}

function blankIfNull(value: string | null): string {
  return value ?? "";
}

export default function ProfilePage() {
  const router = useRouter();

  const [alumniId, setAlumniId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [companies, setCompanies] = useState<string[]>([]);
  const [cities, setCities] = useState<
    ReturnType<typeof City.getCitiesOfState>
  >([]);

  const [form, setForm] = useState({
    classification: "Alumni",
    company: "",
    job_title: "",
    job_description: "",
    industry_category: "",
    work_city: "",
    work_state: "",
    work_country: "",
    work_zipcode: "",
    linkedin_url: "",
    seeking_internship: false,
    seeking_fulltime: false,
    seeking_grad_school: false,
    hiring_employees: false,
    reconnect_baen: false,
    capstone_client: false,
    baen_activities: false,
    baen_updates: false,
    baen_fundraising: false,
    visit_department: false,
    bio: "",
  });

  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [newDegree, setNewDegree] = useState({
    degree_level: "Undergraduate",
    degree_name: "",
    year_conferred: "",
  });
  const [addingDegree, setAddingDegree] = useState(false);
  const [otherDegree, setOtherDegree] = useState({ name: "", type: "B.S." });

  // ---- Login emails (main email is read-only; backup can also be used to log in) ----
  const [mainEmail, setMainEmail] = useState("");
  const [backupEmail, setBackupEmail] = useState("");
  const [savedBackupEmail, setSavedBackupEmail] = useState("");
  const [savingBackup, setSavingBackup] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  // ---- Load profile on mount ----
  useEffect(() => {
    const id = localStorage.getItem("alumniId");
    if (!id) {
      router.push("/login");
      return;
    }
    setAlumniId(id);

    const loadProfile = async () => {
      try {
        const [data, companyList] = await Promise.all([
          fetchJson<Profile>(`/api/alumni/${id}`, {
            cache: "no-store",
          }),
          fetchJson<string[]>(`/api/companies`, {
            next: { revalidate: 3600 },
          }),
        ]);
        setForm({
          classification: blankIfNull(data.classification) || "Alumni",
          company: blankIfNull(data.company),
          job_title: blankIfNull(data.job_title),
          job_description: blankIfNull(data.job_description),
          industry_category: blankIfNull(data.industry_category),
          work_city: blankIfNull(data.work_city),
          work_state: blankIfNull(data.work_state),
          work_country: blankIfNull(data.work_country),
          work_zipcode: blankIfNull(data.work_zipcode),
          linkedin_url: blankIfNull(data.linkedin_url),
          seeking_internship: !!data.seeking_internship,
          seeking_fulltime: !!data.seeking_fulltime,
          seeking_grad_school: !!data.seeking_grad_school,
          hiring_employees: !!data.hiring_employees,
          reconnect_baen: !!data.reconnect_baen,
          capstone_client: !!data.capstone_client,
          baen_activities: !!data.baen_activities,
          baen_updates: !!data.baen_updates,
          baen_fundraising: !!data.baen_fundraising,
          visit_department: !!data.visit_department,
          bio: blankIfNull(data.bio),
        });
        setDegrees(data.degrees);
        setMainEmail(data.email);
        setBackupEmail(blankIfNull(data.backup_email));
        setSavedBackupEmail(blankIfNull(data.backup_email));
        setCompanies(companyList);

        if (data.work_country === "United States" && data.work_state) {
          const selectedState = usStates.find(
            (s) => s.name === data.work_state,
          );
          if (selectedState) {
            setCities(City.getCitiesOfState("US", selectedState.isoCode).filter((c) => !/ (County|Parish|Borough|Census Area)$/.test(c.name))); /* This is necessary because otherwise getCitiesOfState returns counties and cities*/
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load your profile.",
        );
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleChange = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Save or remove the backup email ("" removes it)
  const saveBackupEmail = async (value: string) => {
    if (!alumniId) return;
    setSavingBackup(true);
    setBackupMessage(null);
    setBackupError(null);
    try {
      const result = await fetchJson<{ backup_email: string | null }>(
        `/api/alumni/${alumniId}/backup-email`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backup_email: value }),
        },
      );
      const saved = result.backup_email ?? "";
      setBackupEmail(saved);
      setSavedBackupEmail(saved);
      setBackupMessage(saved ? "✓ Backup email saved" : "✓ Backup email removed");
      setTimeout(() => setBackupMessage(null), 3000);
    } catch (err) {
      setBackupError(
        err instanceof Error ? err.message : "Failed to save backup email.",
      );
    } finally {
      setSavingBackup(false);
    }
  };

  const handleSave = async (
    e: React.FormEvent<HTMLFormElement> | React.MouseEvent,
    section: string,
  ) => {
    e.preventDefault();
    if (!alumniId) return;

    setSaving(section);
    setSavedSection(null);
    setError(null);

    try {
      await fetchJson(`/api/alumni/${alumniId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      setSavedSection(section);
      setTimeout(() => setSavedSection(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save your information.",
      );
    } finally {
      setSaving(null);
    }
  };

  const handleAddDegree = async () => {
    if (!alumniId) return;
    if (!newDegree.degree_name || !newDegree.year_conferred) {
      setError("Please select a degree and enter a year before adding it.");
      return;
    }

    const isOther = newDegree.degree_name === "Other";
    if (isOther && !otherDegree.name.trim()) {
      setError("Please type the name of your degree.");
      return;
    }
    // "Other" is saved as e.g. "Soil Science (M.S.)", matching the list's format
    const degreeName = isOther
      ? `${otherDegree.name.trim()} (${otherDegree.type})`
      : newDegree.degree_name;

    setAddingDegree(true);
    setError(null);

    try {
      const created = await fetchJson<Degree>(
        `/api/alumni/${alumniId}/degrees`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...newDegree, degree_name: degreeName }),
        },
      );
      setDegrees((prev) => [...prev, created]);
      setNewDegree({
        degree_level: "Undergraduate",
        degree_name: "",
        year_conferred: "",
      });
      setOtherDegree({ name: "", type: "B.S." });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add degree.");
    } finally {
      setAddingDegree(false);
    }
  };

  const handleDeleteDegree = async (degreeId: number) => {
    if (!alumniId) return;
    if (degrees.length <= 1) {
      setError("You must keep at least one degree on file.");
      return;
    }

    try {
      await fetchJson(`/api/alumni/${alumniId}/degrees/${degreeId}`, {
        method: "DELETE",
      });
      setDegrees((prev) => prev.filter((d) => d.id !== degreeId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove degree.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("alumniId");
    localStorage.removeItem("alumniName");
    router.push("/");
  };

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center bg-white">
        <p className="text-xl text-gray-700">Loading your profile...</p>
      </main>
    );
  }

  const isAlumni = ["Alumni", "Friend of BAEN"].includes(form.classification);

  return (
    <main className="flex-1 bg-white px-4 py-10">
      <a href="/home" className="inline-block mb-4 text-maroon-700 underline font-medium">
        ← Back to menu
      </a>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-maroon-700">My Profile</h1>
        <p className="text-gray-600 text-lg mt-2">
          Keep your professional information updated! All fields are optional.
        </p>
      </div>

      {error && (
        <p className="text-red-600 text-lg font-medium mb-4">{error}</p>
      )}

      {/* Classification / Status Selection */}
      <section className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Current Academic / Professional Status
        </h2>
        <p className="text-gray-600 mb-4">
          Updating your status unlocks options specific to current students or
          alumni.
        </p>
        <div>
          <label className="block text-lg font-medium text-gray-800 mb-1">
            Status
          </label>
          <select
            value={form.classification}
            onChange={(e) => handleChange("classification", e.target.value)}
            className="w-full text-lg text-gray-900 bg-white border-2 border-gray-400 rounded-md p-3"
          >
            <option value="Student">Student</option>
            <option value="Alumni">Alumni</option>
            <option value="Friend of BAEN">Friend of BAEN</option> {/* Treated like Alumni for the opportunities section and BAEN Connect */}
          </select>
        </div>

        <button
          onClick={(e) => handleSave(e, "Status")}
          disabled={saving === "Status"}
          className="flex justify-start gap-2 mt-4 bg-maroon-700 text-white px-6 py-3 rounded-md hover:bg-maroon-800 disabled:opacity-60"
        >
          {saving === "Status" ? "Saving..." : "Save Changes"}
        </button>

        {savedSection === "Status" && (
          <p className="text-green-700 font-medium mt-2">✓ Saved</p>
        )}
      </section>

      {/* Login emails */}
      <section className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Login Emails</h2>
        <p className="text-gray-600 mb-4">
          Add a backup email in case you lose access to your main one. You can
          log in with either email. Login codes and password resets are always
          sent to your main email.
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              Main Email
            </label>
            <p className="w-full text-lg text-gray-700 bg-gray-100 border-2 border-gray-300 rounded-md p-3">
              {mainEmail}
            </p>
          </div>

          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              Backup Email
            </label>
            <input
              type="email"
              value={backupEmail}
              onChange={(e) => setBackupEmail(e.target.value)}
              maxLength={254}
              className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
              placeholder="e.g. yourname@gmail.com"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button
            onClick={() => saveBackupEmail(backupEmail)}
            disabled={
              savingBackup ||
              backupEmail.trim().toLowerCase() === savedBackupEmail
            }
            className="bg-maroon-700 text-white px-6 py-3 rounded-md hover:bg-maroon-800 disabled:opacity-60"
          >
            {savingBackup ? "Saving..." : "Save Backup Email"}
          </button>
          {savedBackupEmail && (
            <button
              onClick={() => saveBackupEmail("")}
              disabled={savingBackup}
              className="px-6 py-3 rounded-md border-2 border-gray-400 text-gray-800 hover:bg-gray-50 disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </div>

        {backupMessage && (
          <p className="text-green-700 font-medium mt-2">{backupMessage}</p>
        )}
        {backupError && (
          <p className="text-red-600 font-medium mt-2">{backupError}</p>
        )}
      </section>

      {/* Degrees */}
      <section className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">My Degrees</h2>

        {degrees.length === 0 ? (
          <p className="text-lg text-gray-600 mb-4">No degrees on file yet.</p>
        ) : (
          <ul className="flex flex-col gap-3 mb-6">
            {degrees.map((d) => (
              <li
                key={d.id}
                className="flex justify-between items-center border-b border-gray-200 pb-2"
              >
                <span className="text-lg text-gray-800">
                  {d.degree_level} — {d.degree_name} ({d.year_conferred})
                </span>
                <button
                  onClick={() => handleDeleteDegree(d.id)}
                  className="text-red-600 underline text-base font-medium"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <h3 className="text-xl font-semibold text-gray-800 mb-3">
          Add Another Degree
        </h3>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              Degree Level
            </label>
            <select
              value={newDegree.degree_level}
              onChange={(e) =>
                setNewDegree((prev) => ({
                  ...prev,
                  degree_level: e.target.value,
                }))
              }
              className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
            >
              <option value="Undergraduate">Undergraduate</option>
              <option value="Graduate">Graduate</option>
              <option value="PhD">PhD</option>
            </select>
          </div>
          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              Degree / Major (Texas A&M)
            </label>
            <select
              value={newDegree.degree_name}
              onChange={(e) =>
                setNewDegree((prev) => ({
                  ...prev,
                  degree_name: e.target.value,
                }))
              }
              className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
            >
              <option value="">-- Select Texas A&M Degree Program --</option>
              {TAMU_DEGREES.map((deg) => (
                <option key={deg} value={deg}>
                  {deg}
                </option>
              ))}
            </select>
          </div>
          {newDegree.degree_name === "Other" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-lg font-medium text-gray-800 mb-1">
                  Degree Name
                </label>
                <input
                  type="text"
                  value={otherDegree.name}
                  onChange={(e) =>
                    setOtherDegree((prev) => ({ ...prev, name: e.target.value }))
                  }
                  maxLength={100}
                  className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
                  placeholder="e.g. Agricultural Engineering"
                />
              </div>
              <div>
                <label className="block text-lg font-medium text-gray-800 mb-1">
                  Degree Type
                </label>
                <select
                  value={otherDegree.type}
                  onChange={(e) =>
                    setOtherDegree((prev) => ({ ...prev, type: e.target.value }))
                  }
                  className="w-full text-lg text-gray-900 bg-white border-2 border-gray-400 rounded-md p-3"
                >
                  {DEGREE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              Year Conferred
            </label>
            <input
              type="text"
              value={newDegree.year_conferred}
              onChange={(e) =>
                setNewDegree((prev) => ({
                  ...prev,
                  year_conferred: e.target.value,
                }))
              }
              className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
              placeholder="e.g. 2005"
            />
          </div>
          <button
            type="button"
            onClick={handleAddDegree}
            disabled={addingDegree}
            className="text-lg font-semibold bg-gray-800 text-white rounded-md py-3 hover:bg-gray-900 disabled:opacity-60"
          >
            {addingDegree ? "Adding..." : "Add Degree"}
          </button>
        </div>
      </section>

      {/* Employment */}
      <section className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Current Employment
        </h2>
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              Company
            </label>
            <input
              type="text"
              list="company-options"
              value={form.company}
              onChange={(e) => handleChange("company", e.target.value)}
              className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
              placeholder="Start typing to search existing companies..."
            />
            <datalist id="company-options">
              {companies.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              Job Title
            </label>
            <input
              type="text"
              value={form.job_title}
              onChange={(e) => handleChange("job_title", e.target.value)}
              className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
            />
          </div>
          <div>
            <label className="block text-lg font-medium text-gray-800 mb-1">
              Industry Category
            </label>
            <select
              value={form.industry_category}
              onChange={(e) =>
                handleChange("industry_category", e.target.value)
              }
              className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
            >
              <option value="">-- Select an Industry --</option>
              {INDUSTRY_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-lg font-medium text-gray-800 mb-1">
                Work Country
              </label>
              <select
                value={form.work_country}
                onChange={(e) => {
                  const country = e.target.value;
                  handleChange("work_country", country);
                  if (country !== "United States") {
                    handleChange("work_state", "");
                    setCities([]);
                    handleChange("work_zipcode", '');
                  }
                }}
                className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
              >
                <option value="">Select Country</option>
                {countries.map((country) => (
                  <option key={country.isoCode} value={country.name}>
                    {country.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              {form.work_country === "United States" && (
                <div>
                  <label className="block text-lg font-medium text-gray-800 mb-1">
                    Work State
                  </label>
                  <select
                    value={form.work_state}
                    onChange={(e) => {
                      const state = e.target.value;
                      handleChange("work_state", state);
                      handleChange("work_city", "");
                      handleChange("work_zipcode", "");
                      const selectedState = usStates.find(
                        (s) => s.name === state,
                      );
                      if (selectedState) {
                        setCities(
                          City.getCitiesOfState("US", selectedState.isoCode).filter(
                            (c) => !/ (County|Parish|Borough|Census Area)$/.test(c.name),
                          ),
                        );
                      } else {
                        setCities([]);
                      }
                    }}
                    className="w-full text-lg text-gray-900 bg-white border-2 border-gray-400 rounded-md p-3"
                  >
                    <option value="">Select State</option>
                    {usStates.map((state) => (
                      <option key={state.isoCode} value={state.name}>
                        {state.name}
                      </option>
                    ))}
                  </select>
                </div>

              )}
            </div>
            <div>
              <label className="block text-lg font-medium text-gray-800 mb-1">
                Work City
              </label>
              {form.work_country === "United States"? (
                <select
                  value={form.work_city}
                  onChange={(e) => handleChange("work_city", e.target.value)}
                  disabled={form.work_state === ""}
                  className="w-full text-lg text-gray-900 bg-white border-2 border-gray-400 rounded-md p-3 disabled:bg-gray-100"
                >
                  <option value="">Select City</option>
                  {cities.map((city) => (
                    <option key={city.name} value={city.name}>
                      {city.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.work_city}
                  onChange={(e) => handleChange("work_city", e.target.value)}
                  className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
                  placeholder="City"
                />
              )}
            </div>
            {form.work_country === "United States" && (
              <div>
                <label className="block text-lg font-medium text-gray-800 mb-1">
                  Zip Code
                </label>
                <input
                  type="text"
                  value={form.work_zipcode}
                  onChange={(e) => handleChange("work_zipcode", e.target.value)}
                  maxLength={10}
                  className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
                  placeholder="e.g. 77843"
                />
              </div>
            )}
            </div>

          <button
            onClick={(e) => handleSave(e, "Employment")}
            disabled={saving === "Employment"}
            className="flex w-fit justify-start gap-2 mt-4 bg-maroon-700 text-white px-6 py-3 rounded-md hover:bg-maroon-800 disabled:opacity-60"
          >
            {saving === "Employment" ? "Saving..." : "Save Changes"}
          </button>

          {savedSection === "Employment" && (
            <p className="text-green-700 font-medium mt-2">✓ Saved</p>
          )}
        </div>
      </section>

      {/* Professional Networking */}
      <section className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Professional Networking
        </h2>
        <div>
          <label className="block text-lg font-medium text-gray-800 mb-1">
            LinkedIn Profile URL
          </label>
          <input
            type="url"
            value={form.linkedin_url}
            onChange={(e) => handleChange("linkedin_url", e.target.value)}
            className="w-full text-lg text-gray-900 placeholder:text-gray-500 bg-white border-2 border-gray-400 rounded-md p-3"
            placeholder="https://linkedin.com/in/yourname"
          />

          <button
            onClick={(e) => handleSave(e, "Networking")}
            disabled={saving === "Networking"}
            className="flex justify-start gap-2 mt-4 bg-maroon-700 text-white px-6 py-3 rounded-md hover:bg-maroon-800 disabled:opacity-60"
          >
            {saving === "Networking" ? "Saving..." : "Save Changes"}
          </button>

          {savedSection === "Networking" && (
            <p className="text-green-700 font-medium mt-2">✓ Saved</p>
          )}
        </div>
      </section>

      {/* Dynamic Section: Alumni Opportunities VS Student Career Options */}
      <section className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-8">
        {isAlumni ? (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              BAEN Department Involvement & Opportunities
            </h2>
            <div className="flex flex-col gap-3">
              <label className="block text-lg font-medium text-gray-800 mb-1">
                Please select any areas of interest.
              </label>
              <label className="flex items-center gap-3 text-lg text-gray-800">
                <input
                    type="checkbox"
                    checked={form.reconnect_baen}
                    onChange={(e) =>
                        handleChange("reconnect_baen", e.target.checked)
                    }
                    className="w-6 h-6"
                />
                Looking to Connect with Current Students
              </label>
              <label className="flex items-center gap-3 text-lg text-gray-800">
                <input
                  type="checkbox"
                  checked={form.hiring_employees}
                  onChange={(e) =>
                    handleChange("hiring_employees", e.target.checked)
                  }
                  className="w-6 h-6"
                />
                Employment or Internship Opportunities for BAEN Students
              </label>
              <label className="flex items-center gap-3 text-lg text-gray-800">
                <input
                  type="checkbox"
                  checked={form.capstone_client}
                  onChange={(e) =>
                    handleChange("capstone_client", e.target.checked)
                  }
                  className="w-6 h-6"
                />
                Serving as a BAEN Capstone Project Sponsor/Client
              </label>
              <label className="flex items-center gap-3 text-lg text-gray-800">
                <input
                  type="checkbox"
                  checked={form.baen_activities}
                  onChange={(e) =>
                    handleChange("baen_activities", e.target.checked)
                  }
                  className="w-6 h-6"
                />
                Participating in BAEN events and activities
              </label>
              <label className="flex items-center gap-3 text-lg text-gray-800">
                <input
                  type="checkbox"
                  checked={form.baen_updates}
                  onChange={(e) =>
                    handleChange("baen_updates", e.target.checked)
                  }
                  className="w-6 h-6"
                />
                Receiving BAEN news and updates
              </label>
              <label className="flex items-center gap-3 text-lg text-gray-800">
                <input
                  type="checkbox"
                  checked={form.baen_fundraising}
                  onChange={(e) =>
                    handleChange("baen_fundraising", e.target.checked)
                  }
                  className="w-6 h-6"
                />
                Supporting BAEN fundraising initiatives
              </label>
              <label className="flex items-center gap-3 text-lg text-gray-800">
                <input
                  type="checkbox"
                  checked={form.visit_department}
                  onChange={(e) =>
                    handleChange("visit_department", e.target.checked)
                  }
                  className="w-6 h-6"
                />
                Visiting with BAEN faculty, staff, and students
              </label>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Student Career Interests
            </h2>
            <div className="flex flex-col gap-3">
              <label className="block text-lg font-medium text-gray-800 mb-1">
                Select all that apply:
              </label>
              <label className="flex items-center gap-3 text-lg text-gray-800">
                <input
                  type="checkbox"
                  checked={form.seeking_internship}
                  onChange={(e) =>
                    handleChange("seeking_internship", e.target.checked)
                  }
                  className="w-6 h-6"
                />
                Seeking an Internship
              </label>
              <label className="flex items-center gap-3 text-lg text-gray-800">
                <input
                  type="checkbox"
                  checked={form.seeking_fulltime}
                  onChange={(e) =>
                    handleChange("seeking_fulltime", e.target.checked)
                  }
                  className="w-6 h-6"
                />
                Seeking a Full-Time Position
              </label>
              <label className="flex items-center gap-3 text-lg text-gray-800">
                <input
                  type="checkbox"
                  checked={form.seeking_grad_school}
                  onChange={(e) =>
                    handleChange("seeking_grad_school", e.target.checked)
                  }
                  className="w-6 h-6"
                />
                Seeking Graduate School Opportunities
              </label>
            </div>
          </>
        )}

        <button
          onClick={(e) => handleSave(e, "Engagement")}
          disabled={saving === "Engagement"}
          className="flex justify-start mt-4 gap-2 bg-maroon-700 text-white px-6 py-3 rounded-md hover:bg-maroon-800 disabled:opacity-60"
        >
          {saving === "Engagement" ? "Saving..." : "Save Changes"}
        </button>

        {savedSection === "Engagement" && (
          <p className="text-green-700 font-medium mt-2">✓ Saved</p>
        )}
      </section>

      <div className="flex justify-center mt-10 mb-6">
        <button
          onClick={handleLogout}
          className="text-red-600 text-lg font-medium underline"
        >
          Log Out
        </button>
      </div>
    </main>
  );
}
