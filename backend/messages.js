// Builds the pre-written connection messages people choose from on the
// BAEN Connect Portal. Users can't type their own text: the server builds the
// message from their profile and their selections, so every request stays
// respectful and on-topic.
//
// Messages stay anonymous (no names or contact details). Alumni only learn
// who sent a request after they choose to connect.

const LOCATION_ANYWHERE = "Open to any location";
const LOCATION_OUTSIDE_US = "Open to locations outside the US";

// How each networking goal reads inside a sentence
const GOAL_PHRASES = {
  "Internship Opportunities": "internship opportunities",
  "Full-Time Employment": "full-time employment",
  "Professional Networking": "professional networking",
  "Mentorship/Career Advice": "career mentorship",
  "Industry Connections": "industry connections",
  "Hiring or Recruiting": "hiring and recruiting",
  "General Involvement": "getting more involved with BAEN",
  "Student Organization Involvement": "student organization involvement",
};

// ["a"] -> "a", ["a","b"] -> "a and b", ["a","b","c"] -> "a, b, and c"
function joinList(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// At most 3 interests by name, then "and N other areas"
function interestPhrase(interests) {
  if (interests.length <= 3) return joinList(interests);
  const rest = interests.length - 2;
  return `${interests[0]}, ${interests[1]}, and ${rest} other areas`;
}

function goalPhrase(goals) {
  return joinList(goals.map((g) => GOAL_PHRASES[g] || g.toLowerCase()));
}

// " in Texas", " outside the US", or "" for anywhere
function locationPhrase(location) {
  if (!location || location === LOCATION_ANYWHERE) return "";
  if (location === LOCATION_OUTSIDE_US) return " outside the US";
  return ` in ${location}`;
}

const stripDegreeType = (name) => String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();
const clean = (v) => (typeof v === "string" ? v.trim() : "");

// sender: row from the alumni table (+ first_degree)
// selections: { interests: string[], goals: string[], location: string }
// Returns [{ id, label, text }]
function buildMessageOptions(sender, { interests, goals, location }) {
  const status = sender.classification;
  const major = clean(sender.major) || (sender.first_degree ? stripDegreeType(sender.first_degree) : "");
  const industry = clean(sender.industry_category);
  const company = clean(sender.company);
  const work = industry && company ? `${industry} at ${company}` : company || industry;

  const what = interestPhrase(interests);
  const want = goalPhrase(goals);
  const where = locationPhrase(location);
  // ", ideally in Texas" (reads better after a list of goals than a bare " in Texas")
  const ideally = where ? `, ideally${where}` : "";

  if (status === "Student") {
    const studying = major ? `studying ${major}` : "a student";
    return [
      {
        id: "career",
        label: "Learn about career paths",
        text:
          `Howdy! I'm currently ${studying} at Texas A&M and am interested in ${what}. ` +
          `Right now I'm focused on ${want}${where ? `, especially${where}` : ""}. ` +
          `I'd love to connect and learn more about your career path!`,
      },
      {
        id: "experience",
        label: "Hear about their experience",
        text:
          `Howdy! As a Texas A&M ${major ? `${major} student` : "student"}, I'm exploring ${what}. ` +
          `I'd love to connect with BAEN alumni${where ? ` working${where}` : ""} and hear about your experience in the field. ` +
          `I'm especially interested in ${want}.`,
      },
      {
        id: "brief",
        label: "Short and simple",
        text:
          `Howdy! I'm a Texas A&M ${major ? `${major} ` : ""}student interested in ${what}, ` +
          `looking for ${want}${ideally}. I'd appreciate the chance to connect.`,
      },
    ];
  }

  if (status === "Friend of BAEN") {
    return [
      {
        id: "collaborate",
        label: "Explore collaboration",
        text:
          `Howdy! I ${work ? `work in ${work} and am` : "am"} a friend of the Texas A&M BAEN department, interested in ${what}. ` +
          `I'm looking for ${want}${ideally}, and I'd welcome the chance to connect and explore ways to collaborate.`,
      },
      {
        id: "industry",
        label: "Build industry connections",
        text:
          `Howdy! As a friend of BAEN${work ? ` working in ${work}` : ""}, I'd like to connect with alumni${where ? ` based${where}` : ""} who share an interest in ${what}. ` +
          `I'm especially interested in ${want}.`,
      },
      {
        id: "brief",
        label: "Short and simple",
        text: `Howdy! I'm a friend of the BAEN department interested in ${what} and looking for ${want}${ideally}. I'd love to connect.`,
      },
    ];
  }

  // Alumni (and anyone else)
  return [
    {
      id: "network",
      label: "Network with fellow alumni",
      text:
        `Howdy! I'm a fellow Aggie ${work ? `working in ${work}` : "and BAEN graduate"} with an interest in ${what}. ` +
        `I'm looking for ${want}${ideally}, and I'd enjoy connecting and comparing notes on our industry experience.`,
    },
    {
      id: "expand",
      label: "Expand my network",
      text:
        `Howdy! I graduated from Texas A&M${major ? ` in ${major}` : ""} and am interested in ${what}. ` +
        `I'm hoping to grow my network${where} through ${want}. It would be great to connect!`,
    },
    {
      id: "brief",
      label: "Short and simple",
      text: `Howdy! Fellow BAEN alum here, interested in ${what} and looking for ${want}${ideally}. Let's connect!`,
    },
  ];
}

module.exports = { buildMessageOptions, GOAL_PHRASES };
