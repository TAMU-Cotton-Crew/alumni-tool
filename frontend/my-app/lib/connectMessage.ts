// Builds the suggested introduction for a BAEN Connect request from both
// people's profiles. Pure function (no React), so it's easy to test and tweak.
//
// Rules from the request:
// - Tailored to the sender -> recipient pair (Student / Alumni / Friend)
// - Uses names, major, company/industry, shared interests, and the sender's goals
// - Falls back to a general introduction when profiles are mostly empty
// - Never assumes the RECIPIENT will mentor, recruit, or offer a job

export interface MessagePerson {
  firstName: string;
  lastName?: string;
  classification: string | null;
  major?: string | null;
  company?: string | null;
  job_title?: string | null;
  industry_category?: string | null;
  interests?: string[] | null;
  networking_goals?: string[] | null;
  degrees?: { degree_name: string }[] | null;
}

type Role = "Student" | "Alumni" | "Friend";

export function roleOf(classification: string | null | undefined): Role {
  if (classification === "Student") return "Student";
  if (classification === "Friend of BAEN") return "Friend";
  return "Alumni";
}

const clean = (v?: string | null) => (v ?? "").trim();

// "Biological and Agricultural Engineering (B.S.)" -> "Biological and Agricultural Engineering"
const stripDegreeType = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, "").trim();

function majorOf(p: MessagePerson): string {
  const major = clean(p.major);
  if (major) return major;
  const firstDegree = p.degrees?.find((d) => clean(d.degree_name) && d.degree_name !== "Other");
  return firstDegree ? stripDegreeType(firstDegree.degree_name) : "";
}

// "GIS at Acme Co.", "Acme Co.", "GIS", or ""
function workOf(p: MessagePerson): string {
  const industry = clean(p.industry_category);
  const company = clean(p.company);
  if (industry && company) return `${industry} at ${company}`;
  return company || industry;
}

function sharedInterest(a: MessagePerson, b: MessagePerson): string {
  const theirs = new Set(b.interests ?? []);
  return (a.interests ?? []).find((i) => theirs.has(i)) ?? "";
}

// One optional sentence based on the SENDER's own goals
function goalSentence(sender: MessagePerson, to: Role): string {
  const goals = new Set(sender.networking_goals ?? []);
  const from = roleOf(sender.classification);
  const rules: [boolean, string][] =
    from === "Student"
      ? [
          [to !== "Student" && goals.has("Internship Opportunities"), "I'm also exploring internship opportunities in the field."],
          [to !== "Student" && goals.has("Full-Time Employment"), "I'm also starting to explore full-time opportunities."],
          [to !== "Student" && goals.has("Mentorship/Career Advice"), "I'd appreciate any career advice you might be open to sharing."],
          [to === "Student" && goals.has("Student Organization Involvement"), "I'm also looking to get more involved in student organizations."],
          [goals.has("Professional Networking") || goals.has("Industry Connections"), "I'm working on growing my professional network."],
        ]
      : [
          [to === "Student" && goals.has("Mentorship/Career Advice"), "I enjoy sharing career advice with current students."],
          [to === "Student" && goals.has("Hiring or Recruiting"), "I'm also interested in connecting with emerging talent."],
          [goals.has("Industry Connections") || goals.has("Professional Networking"), "I'm always glad to expand my industry connections."],
          [goals.has("General Involvement"), "I'm looking to stay involved with the BAEN community."],
        ];
  return rules.find(([applies]) => applies)?.[1] ?? "";
}

export function generateConnectionMessage(sender: MessagePerson, recipient: MessagePerson): string {
  const name = clean(recipient.firstName) || "there";
  const from = roleOf(sender.classification);
  const to = roleOf(recipient.classification);

  const myMajor = majorOf(sender);
  const myWork = workOf(sender);
  const theirWork = workOf(recipient);
  const shared = sharedInterest(sender, recipient);
  const theirInterest = shared || (recipient.interests ?? [])[0] || "";

  const signature = `Thanks,\n${[clean(sender.firstName), clean(sender.lastName)].filter(Boolean).join(" ")}`;
  const build = (...sentences: string[]) =>
    `Howdy ${name}! ${sentences.filter(Boolean).join(" ")}\n\n${signature}`;

  // Not enough on either profile to personalize: general introduction
  const nothingToSay = !myMajor && !myWork && !theirWork && !theirInterest && !(sender.interests ?? []).length;
  if (nothingToSay) {
    const who =
      from === "Student" ? "a Texas A&M BAEN student" : from === "Friend" ? "a friend of the Texas A&M BAEN department" : "a Texas A&M BAEN graduate";
    return build(`I'm ${who}, and I found your profile on the BAEN Connect Portal.`, "I'd love to connect and learn more about your experience.");
  }

  const goal = goalSentence(sender, to);

  if (from === "Student") {
    const intro = myMajor ? `I'm currently studying ${myMajor} at Texas A&M` : "I'm currently a student at Texas A&M";

    if (to === "Alumni") {
      return build(
        `${intro}${shared ? ` and am interested in ${shared}` : ""}.`,
        goal,
        theirWork
          ? `I noticed your experience in ${theirWork} and would love to connect and learn more about your career path!`
          : "I'd love to connect and learn more about your career path!",
      );
    }
    if (to === "Friend") {
      return build(
        `${intro}${shared ? ` and am interested in ${shared}` : ""}.`,
        goal,
        theirWork
          ? `I'm interested in your experience in ${theirWork} and would love to connect and learn more about your work.`
          : "I'm interested in your industry experience and would love to connect and learn more about your work.",
      );
    }
    // Student -> Student
    const sameMajor = myMajor && majorOf(recipient) && myMajor === majorOf(recipient);
    return build(
      myMajor ? `I'm studying ${myMajor}${sameMajor ? " too" : ""}.` : "I'm a fellow BAEN student.",
      shared ? `I saw we're both interested in ${shared}.` : "",
      goal,
      "It would be great to connect and share ideas about classes, career goals, or opportunities to collaborate.",
    );
  }

  if (from === "Friend") {
    return build(
      myWork ? `I work in ${myWork} and am a friend of the Texas A&M BAEN department.` : "I'm a friend of the Texas A&M BAEN department.",
      goal,
      shared
        ? `I noticed we share an interest in ${shared} and would welcome the chance to connect and explore ways to collaborate.`
        : "I'd welcome the chance to connect and explore industry connections or ways to collaborate.",
    );
  }

  // Sender is an alum
  if (to === "Student") {
    return build(
      myWork
        ? `I graduated from Texas A&M and currently work in ${myWork}.`
        : myMajor
          ? `I graduated from Texas A&M in ${myMajor}.`
          : "I'm a Texas A&M BAEN graduate.",
      goal,
      theirInterest
        ? `I noticed your interest in ${theirInterest} and would be happy to connect and share my experience!`
        : "I'd be happy to connect and share my experience!",
    );
  }
  // Alum -> Alum (or Friend)
  return build(
    myWork ? `I'm a fellow Aggie working in ${myWork}.` : "I'm a fellow Aggie and BAEN graduate.",
    goal,
    shared
      ? `It looks like we share an interest in ${shared}, and I'd enjoy connecting and comparing notes on our industry experience.`
      : theirWork
        ? `I noticed your experience in ${theirWork} and would enjoy connecting professionally.`
        : "I'd enjoy connecting and growing our professional networks.",
  );
}

export const countWords = (text: string) =>
  text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

export const containsLink = (text: string) => /(https?:\/\/|www\.)/i.test(text);
