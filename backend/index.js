var express = require("express");
var crypto = require("crypto");
var bcrypt = require("bcrypt");
var router = express.Router();
var db = require("./db");
var { buildMessageOptions } = require("./messages");
var {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendMfaCodeEmail,
  isEmailRateLimitError,
  sendConnectionIntroEmail,
  sendProposalEmails,
} = require("./mailer");

const SALT_ROUNDS = 12;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const INDUSTRY_CATEGORIES = [
  "Power Machinery",
  "Instrumentation and Controls",
  "Air Quality",
  "Bioenergy",
  "Food Engineering",
  "Water Availability and Quality",
  "Water Conservation",
  "Wastewater",
  "Structures",
  "Data Analytics",
  "GIS",
  "Management",
  "Engineering Technician",
  "Sales",
  "Technical Sales",
  "Irrigation Systems Manager",
  "Production Supervisor",
  "Logistics",
  "Project Administrator",
  "Surveying",
  "Staff Consultant",
  "Technical Support Specialist",
  "Military",
  "Teacher",
  "Educator",
  "Safety Training",
  "Safety Manager",
  "Safety",
  "Government",
  "Farm Manager",
  "Ranch Manager",
  "Rain Water Harvesting",
  "Construction",
  "Consulting",
  "Installer",
  "Electrician",
  "Energy Management",
  "Resource Management",
  "Land Development",
  "Permitting",
  "Environmental Consulting",
  "Energy",
  "Farmer/Rancher",
  "Entrepreneur",
];

// "What are you looking to gain from this network?" (multi-select).
// Must match NETWORKING_GOALS in frontend/my-app/lib/networking.ts.
const NETWORKING_GOALS = [
  "Internship Opportunities",
  "Full-Time Employment",
  "Professional Networking",
  "Mentorship/Career Advice",
  "Industry Connections",
  "Hiring or Recruiting",
  "General Involvement",
  "Student Organization Involvement",
];

// Shown in connection emails, e.g. "Alex Smith, a BAEN alum, accepted..."
function roleLabel(classification) {
  if (classification === "Friend of BAEN") return "a Friend of BAEN";
  if (classification === "Student") return "a BAEN student";
  return "a BAEN alum";
}

// Keep only allowed values from a multi-select; null means "not sent, keep as is"
function cleanList(value, allowed) {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter((v) => allowed.includes(v)))];
}

// Trim free text and cap its length; null means "not sent, keep as is"
function cleanText(value, max) {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, max);
}

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// MFA can be turned off for local testing by putting MFA_ENABLED=false in .env.
// If the setting is missing or anything other than "false", MFA stays ON.
// Sent when Azure email hits its quota (HTTP 429). The frontend looks for
// rateLimited: true to show a "try again in an hour" notice.
const RETRY_AFTER_SECONDS = 60 * 60;
function sendRateLimited(res, error) {
  res.set("Retry-After", String(RETRY_AFTER_SECONDS));
  return res.status(429).json({
    error,
    rateLimited: true,
    retryAfterSeconds: RETRY_AFTER_SECONDS,
  });
}

const MFA_ENABLED =
  (process.env.MFA_ENABLED || "true").trim().toLowerCase() !== "false";
if (!MFA_ENABLED) {
  console.warn("WARNING: MFA is DISABLED (MFA_ENABLED=false). Do not use in production.");
}

async function isAdminRequester(requesterId) {
  if (!requesterId) return false;
  const result = await db.query(`SELECT email FROM alumni WHERE id = $1`, [
    requesterId,
  ]);
  if (result.rows.length === 0) return false;
  return ADMIN_EMAILS.includes(result.rows[0].email.toLowerCase());
}

// ---------- Token helpers ----------

function generateUrlToken() {
  return crypto.randomBytes(32).toString("hex");
}

function generateMfaCode(length = 12) {
  const charset = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += charset[bytes[i] % charset.length];
  }
  return code;
}

async function createToken(client, alumniId, type, token, expiresInMs) {
  const expiresAt = new Date(Date.now() + expiresInMs);
  await client.query(
    `INSERT INTO auth_tokens (alumni_id, token, type, expires_at) VALUES ($1, $2, $3, $4)`,
    [alumniId, token, type, expiresAt],
  );
}

// ---------- Directory listing ----------
router.get("/alumni", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, classification, first_name AS "firstName", last_name AS "lastName", email, company, job_title, work_city, work_state, work_country
       FROM alumni ORDER BY last_name, first_name`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching alumni:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- Verify email ----------
// MUST COME BEFORE /alumni/:id
router.get("/alumni/verify-email", async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: "Missing verification token." });
  }

  try {
    const tokenResult = await db.query(
      `SELECT id, alumni_id FROM auth_tokens
       WHERE token = $1 AND type = 'email_verify' AND used = FALSE AND expires_at > NOW()`,
      [token],
    );

    if (tokenResult.rows.length === 0) {
      return res
        .status(400)
        .json({ error: "This verification link is invalid or has expired." });
    }

    const { id: tokenId, alumni_id: alumniId } = tokenResult.rows[0];

    await db.query(`UPDATE alumni SET email_verified = TRUE WHERE id = $1`, [
      alumniId,
    ]);
    await db.query(`UPDATE auth_tokens SET used = TRUE WHERE id = $1`, [
      tokenId,
    ]);

    res.json({
      success: true,
      message: "Your email has been verified. You may now log in.",
    });
  } catch (err) {
    console.error("Email verification error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- Single profile (with degrees) ----------
router.get("/alumni/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const alumniResult = await db.query(
      `SELECT id, classification, first_name AS "firstName", last_name AS "lastName", email, company, job_title, job_description,
              industry_category, work_city, work_state, work_country, work_zipcode, linkedin_url,
              seeking_internship, seeking_fulltime, seeking_grad_school, bio,
              hiring_employees, reconnect_baen, capstone_client, baen_activities,
              baen_updates, baen_fundraising, visit_department, last_modified, backup_email,
              interests, networking_goals, major, hometown, grad_year
       FROM alumni WHERE id = $1`,
      [id],
    );

    if (alumniResult.rows.length === 0) {
      return res.status(404).json({ error: "Profile not found." });
    }

    const degreesResult = await db.query(
      `SELECT id, degree_level, degree_name, year_conferred
       FROM alumni_degrees WHERE alumni_id = $1 ORDER BY year_conferred`,
      [id],
    );

    res.json({ ...alumniResult.rows[0], degrees: degreesResult.rows });
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- Sign up ----------
router.post("/alumni", async (req, res) => {
  const {
    classification,
    firstName,
    lastName,
    email,
    password,
  } = req.body;

  // Degrees are no longer collected at signup; people add them on their profile page.
  if (
    !classification ||
    !firstName?.trim() ||
    !lastName?.trim() ||
    !email ||
    !password
  ) {
    return res.status(400).json({ error: "Please fill out every field." });
  }

  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const normalizedEmail = email.toLowerCase().trim();
    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();

    // An email can belong to only one account, as either a main or backup email
    const backupTaken = await client.query(
      `SELECT 1 FROM alumni WHERE backup_email = $1 LIMIT 1`,
      [normalizedEmail],
    );
    if (backupTaken.rows.length > 0) {
      await client.query("ROLLBACK");
      return res
        .status(409)
        .json({ error: "An account with that email already exists." });
    }

    const alumniResult = await client.query(
      `INSERT INTO alumni (classification, first_name, last_name, email, password)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, classification, first_name AS "firstName", last_name AS "lastName", email`,
      [classification, cleanFirst, cleanLast, normalizedEmail, hashedPassword],
    );

    const alumniId = alumniResult.rows[0].id;

    const verifyToken = generateUrlToken();
    await createToken(
      client,
      alumniId,
      "email_verify",
      verifyToken,
      24 * 60 * 60 * 1000,
    );

    await client.query("COMMIT");

    const verifyLink = `${FRONTEND_URL}/verify-email?token=${verifyToken}`;
    // The account is already saved, so an email failure doesn't undo signup.
    // We just tell the frontend so it can warn the user.
    let emailRateLimited = false;
    try {
      await sendVerificationEmail(normalizedEmail, cleanFirst, verifyLink);
    } catch (emailErr) {
      if (isEmailRateLimitError(emailErr)) {
        emailRateLimited = true;
        console.warn("Signup verification email not sent: email sending is rate limited (429).");
      } else {
        console.error("Failed to send verification email:", emailErr);
      }
    }

    res.status(201).json({
      ...alumniResult.rows[0],
      emailRateLimited,
      message: emailRateLimited
        ? "Your account was created, but we couldn't send the verification email right now."
        : "Please check your email to verify your account.",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Alumni Creation Error:", err);

    if (err.code === "23505") {
      return res
        .status(409)
        .json({ error: "An account with that email already exists." });
    }

    res.status(500).json({ error: err.message || "Internal Server Error" });
  } finally {
    client.release();
  }
});

// ---------- Resend verification email ----------
router.post("/alumni/resend-verification", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Please enter your email address." });
  }

  const genericMessage = {
    message:
      "If an account exists for that email and needs verifying, a new link has been sent.",
  };

  try {
    const result = await db.query(
      `SELECT id, first_name AS "firstName", last_name AS "lastName", email, email_verified FROM alumni
       WHERE email = $1 OR backup_email = $1
       ORDER BY (email = $1) DESC LIMIT 1`,
      [email.toLowerCase().trim()],
    );

    if (result.rows.length === 0 || result.rows[0].email_verified) {
      return res.json(genericMessage);
    }

    const user = result.rows[0];
    const verifyToken = generateUrlToken();
    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      await createToken(
        client,
        user.id,
        "email_verify",
        verifyToken,
        24 * 60 * 60 * 1000,
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const verifyLink = `${FRONTEND_URL}/verify-email?token=${verifyToken}`;
    await sendVerificationEmail(user.email, user.firstName, verifyLink);

    res.json(genericMessage);
  } catch (err) {
    if (isEmailRateLimitError(err)) {
      console.warn("Resend verification blocked: email sending is rate limited (429).");
      return sendRateLimited(
        res,
        "Emails have been temporarily limited for security reasons. Please try again in an hour.",
      );
    }
    console.error("Resend verification error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- Log in: step 1 (password check, triggers MFA email) ----------
router.post("/alumni/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ error: "Please enter your email and password." });
  }

  const genericError = { error: "Email or password is incorrect." };

  try {
    const result = await db.query(
      `SELECT id, first_name AS "firstName", last_name AS "lastName", email, password, email_verified FROM alumni
       WHERE email = $1 OR backup_email = $1
       ORDER BY (email = $1) DESC LIMIT 1`,
      [email.toLowerCase().trim()],
    );

    if (result.rows.length === 0) {
      return res.status(401).json(genericError);
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json(genericError);
    }

    if (!user.email_verified) {
      return res.status(403).json({
        error:
          "Please verify your email before logging in. Check your inbox for the verification link.",
        needsVerification: true,
      });
    }

    // MFA turned off: log in straight away with the same info /verify-mfa returns
    if (!MFA_ENABLED) {
      const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
      return res.json({
        mfaRequired: false,
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isAdmin,
      });
    }

    const mfaCode = generateMfaCode();
    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      await createToken(client, user.id, "mfa", mfaCode, 10 * 60 * 1000);
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    await sendMfaCodeEmail(user.email, user.firstName, mfaCode);

    res.json({ mfaRequired: true, alumniId: user.id });
  } catch (err) {
    if (isEmailRateLimitError(err)) {
      console.warn("Login blocked: email sending is rate limited (429).");
      return sendRateLimited(
        res,
        "Sign-ins have been temporarily limited for security reasons. Please try again in an hour.",
      );
    }
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- Log in: step 2 (verify MFA code) ----------
router.post("/alumni/verify-mfa", async (req, res) => {
  const { alumniId, code } = req.body;

  if (!alumniId || !code) {
    return res.status(400).json({ error: "Please enter your login code." });
  }

  const genericError = { error: "That code is incorrect or has expired." };

  try {
    // FIX 1: Pass JavaScript's current time as $2 instead of relying on PostgreSQL's NOW()
    // This ensures the exact same clock is used for creation and validation.
    const tokenResult = await db.query(
      `SELECT id, token, attempts FROM auth_tokens
       WHERE alumni_id = $1 AND type = 'mfa' AND used = FALSE AND expires_at > $2
       ORDER BY created_at DESC LIMIT 1`,
      [alumniId, new Date()],
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json(genericError);
    }

    const tokenRow = tokenResult.rows[0];

    if (tokenRow.attempts >= 5) {
      return res.status(429).json({
        error:
          "Too many incorrect attempts. Please log in again to get a new code.",
      });
    }

    // FIX 2: Add .trim() to tokenRow.token in case your database column pads with spaces
    if (tokenRow.token.trim() !== code.toUpperCase().trim()) {
      await db.query(
        `UPDATE auth_tokens SET attempts = attempts + 1 WHERE id = $1`,
        [tokenRow.id],
      );
      return res.status(401).json(genericError);
    }

    await db.query(`UPDATE auth_tokens SET used = TRUE WHERE id = $1`, [
      tokenRow.id,
    ]);

    const userResult = await db.query(
      `SELECT id, classification, first_name AS "firstName", last_name AS "lastName", email FROM alumni WHERE id = $1`,
      [alumniId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Account not found." });
    }

    const user = userResult.rows[0];
    const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());

    res.json({ ...user, isAdmin });
  } catch (err) {
    console.error("MFA verification error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- Forgot password ----------
router.post("/alumni/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Please enter your email address." });
  }

  const genericMessage = {
    message:
      "If an account exists for that email, a password reset link has been sent.",
  };

  try {
    const result = await db.query(
      `SELECT id, first_name AS "firstName", last_name AS "lastName", email FROM alumni
       WHERE email = $1 OR backup_email = $1
       ORDER BY (email = $1) DESC LIMIT 1`,
      [email.toLowerCase().trim()],
    );

    if (result.rows.length === 0) {
      return res.json(genericMessage);
    }

    const user = result.rows[0];
    const resetToken = generateUrlToken();
    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      await createToken(
        client,
        user.id,
        "password_reset",
        resetToken,
        60 * 60 * 1000,
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const resetLink = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
    await sendPasswordResetEmail(user.email, user.firstName, resetLink);

    res.json(genericMessage);
  } catch (err) {
    if (isEmailRateLimitError(err)) {
      console.warn("Password reset blocked: email sending is rate limited (429).");
      return sendRateLimited(
        res,
        "Password resets have been temporarily limited for security reasons. Please try again in an hour.",
      );
    }
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- Reset password ----------
router.post("/alumni/reset-password", async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: "Missing token or new password." });
  }

  try {
    const tokenResult = await db.query(
      `SELECT id, alumni_id FROM auth_tokens
       WHERE token = $1 AND type = 'password_reset' AND used = FALSE AND expires_at > $2`,
      [token, new Date()],
    );

    if (tokenResult.rows.length === 0) {
      return res
        .status(400)
        .json({ error: "This reset link is invalid or has expired." });
    }

    const { id: tokenId, alumni_id: alumniId } = tokenResult.rows[0];
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    await db.query(`UPDATE alumni SET password = $1 WHERE id = $2`, [
      hashedPassword,
      alumniId,
    ]);
    await db.query(`UPDATE auth_tokens SET used = TRUE WHERE id = $1`, [
      tokenId,
    ]);

    res.json({
      success: true,
      message: "Your password has been updated. You may now log in.",
    });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- Backup email (can also be used to log in) ----------
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.put("/alumni/:id/backup-email", async (req, res) => {
  const { id } = req.params;
  const backupEmail =
    typeof req.body.backup_email === "string"
      ? req.body.backup_email.trim().toLowerCase()
      : "";

  try {
    // Empty value removes the backup email
    if (!backupEmail) {
      await db.query(
        `UPDATE alumni SET backup_email = NULL, last_modified = NOW() WHERE id = $1`,
        [id],
      );
      return res.json({ backup_email: null });
    }

    if (!EMAIL_PATTERN.test(backupEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    const own = await db.query(`SELECT email FROM alumni WHERE id = $1`, [id]);
    if (own.rows.length === 0) {
      return res.status(404).json({ error: "Profile not found." });
    }
    if (own.rows[0].email.toLowerCase() === backupEmail) {
      return res.status(400).json({
        error: "Your backup email must be different from your main email.",
      });
    }

    // Each email can only log in to one account
    const taken = await db.query(
      `SELECT 1 FROM alumni
       WHERE id <> $1 AND (LOWER(email) = $2 OR backup_email = $2)
       LIMIT 1`,
      [id, backupEmail],
    );
    if (taken.rows.length > 0) {
      return res
        .status(409)
        .json({ error: "That email is already used by another account." });
    }

    const result = await db.query(
      `UPDATE alumni SET backup_email = $1, last_modified = NOW()
       WHERE id = $2 RETURNING backup_email`,
      [backupEmail, id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ error: "That email is already used by another account." });
    }
    console.error("Backup email update error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- Update profile ----------
router.put("/alumni/:id", async (req, res) => {
  const { id } = req.params;
  const {
    classification,
    company,
    job_title,
    job_description,
    industry_category,
    work_city,
    work_state,
    work_country,
    work_zipcode,
    linkedin_url,
    seeking_internship,
    seeking_fulltime,
    seeking_grad_school,
    bio,
    hiring_employees,
    reconnect_baen,
    capstone_client,
    baen_activities,
    baen_updates,
    baen_fundraising,
    visit_department,
    interests,
    networking_goals,
    major,
    hometown,
    grad_year,
  } = req.body;

  if (industry_category && !INDUSTRY_CATEGORIES.includes(industry_category)) {
    return res.status(400).json({ error: "Invalid industry category." });
  }
  const cleanInterests = cleanList(interests, INDUSTRY_CATEGORIES);
  const cleanGoals = cleanList(networking_goals, NETWORKING_GOALS);
  const cleanGradYear = cleanText(grad_year, 4);
  if (cleanGradYear && !/^\d{4}$/.test(cleanGradYear)) {
    return res.status(400).json({ error: "Please enter a 4-digit graduation year." });
  }

  try {
    const result = await db.query(
      `UPDATE alumni SET
        classification = COALESCE($1, classification),
        company = COALESCE($2, company),
        job_title = COALESCE($3, job_title),
        job_description = COALESCE($4, job_description),
        industry_category = COALESCE($5, industry_category),
        work_city = COALESCE($6, work_city),
        work_state = COALESCE($7, work_state),
        work_country = COALESCE($8, work_country),
        work_zipcode = COALESCE($9, work_zipcode),
        linkedin_url = COALESCE($10, linkedin_url),
        seeking_internship = COALESCE($11, seeking_internship),
        seeking_fulltime = COALESCE($12, seeking_fulltime),
        seeking_grad_school = COALESCE($13, seeking_grad_school),
        bio = COALESCE($14, bio),
        hiring_employees = COALESCE($15, hiring_employees),
        reconnect_baen = COALESCE($16, reconnect_baen),
        capstone_client = COALESCE($17, capstone_client),
        baen_activities = COALESCE($18, baen_activities),
        baen_updates = COALESCE($19, baen_updates),
        baen_fundraising = COALESCE($20, baen_fundraising),
        visit_department = COALESCE($21, visit_department),
        interests = COALESCE($22, interests),
        networking_goals = COALESCE($23, networking_goals),
        major = COALESCE($24, major),
        hometown = COALESCE($25, hometown),
        grad_year = COALESCE($26, grad_year),
        last_modified = NOW()
       WHERE id = $27
       RETURNING id, last_modified`,
      [
        classification,
        company,
        job_title,
        job_description,
        industry_category,
        work_city,
        work_state,
        work_country,
        work_zipcode,
        linkedin_url,
        seeking_internship,
        seeking_fulltime,
        seeking_grad_school,
        bio,
        hiring_employees,
        reconnect_baen,
        capstone_client,
        baen_activities,
        baen_updates,
        baen_fundraising,
        visit_department,
        cleanInterests,
        cleanGoals,
        cleanText(major, 120),
        cleanText(hometown, 300), // JSON: {"country","state","city","zip"}
        cleanGradYear,
        id,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Profile not found." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- Add / remove degrees ----------
router.post("/alumni/:id/degrees", async (req, res) => {
  const { id } = req.params;
  const { degree_level, degree_name, year_conferred } = req.body;

  if (!degree_level || !degree_name || !year_conferred) {
    return res
      .status(400)
      .json({ error: "Degree level, name, and year are required." });
  }

  try {
    const result = await db.query(
      `INSERT INTO alumni_degrees (alumni_id, degree_level, degree_name, year_conferred)
       VALUES ($1, $2, $3, $4)
       RETURNING id, degree_level, degree_name, year_conferred`,
      [id, degree_level, degree_name, year_conferred],
    );
    await db.query(`UPDATE alumni SET last_modified = NOW() WHERE id = $1`, [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Add degree error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/alumni/:id/degrees/:degreeId", async (req, res) => {
  const { id, degreeId } = req.params;
  try {
    const result = await db.query(
      `DELETE FROM alumni_degrees WHERE id = $1 AND alumni_id = $2 RETURNING id`,
      [degreeId, id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Degree not found." });
    }
    await db.query(`UPDATE alumni SET last_modified = NOW() WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete degree error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- BAEN Community Portal ----------
// Alumni who opted in ("reconnect_baen") and verified their email receive proposals.
const PROPOSALS_PER_DAY = 1;

// Special "location of interest" choices. These must match ANY_LOCATION in
// frontend/my-app/app/portal/page.tsx exactly. Any other value is a US state name.
const LOCATION_ANYWHERE = "Open to any location";
const LOCATION_OUTSIDE_US = "Open to locations outside the US";

// Opted-in, verified alumni (never the sender), narrowed by location:
// - a US state: alumni whose work state is that state
// - "outside the US": alumni whose work country is set and isn't the US
// - "any location" or no location: everyone opted in
async function getProposalRecipients(excludeId, location) {
  const params = [excludeId];
  let locationFilter = "";
  if (location === LOCATION_OUTSIDE_US) {
    locationFilter = `AND COALESCE(work_country, '') NOT IN ('', 'United States')`;
  } else if (location && location !== LOCATION_ANYWHERE) {
    params.push(location);
    locationFilter = `AND work_country = 'United States' AND LOWER(work_state) = LOWER($2)`;
  }
  const result = await db.query(
    `SELECT id, email FROM alumni
     WHERE reconnect_baen = TRUE
       AND classification IN ('Alumni', 'Friend of BAEN')
       AND email_verified = TRUE
       AND id <> $1
       ${locationFilter}`,
    params,
  );
  return result.rows; // [{ id, email }]
}

// How many alumni a proposal would reach. With ?state=..., counts only
// alumni matching that location (shown live under the Location field).
router.get("/portal/recipient-count", async (req, res) => {
  const { requesterId, state } = req.query;
  if (!requesterId) {
    return res.status(400).json({ error: "Missing requester." });
  }
  try {
    const location = typeof state === "string" ? state.trim() : "";
    const recipients = await getProposalRecipients(requesterId, location);
    res.json({ count: recipients.length });
  } catch (err) {
    console.error("Recipient count error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Checks the portal selections; returns { error } or the cleaned values
function readPortalSelections(body) {
  const { alumniId, interests, state, goals } = body;
  if (!alumniId) return { error: "Please log in again." };
  if (
    !Array.isArray(interests) ||
    interests.length === 0 ||
    !interests.every((i) => INDUSTRY_CATEGORIES.includes(i))
  ) {
    return { error: "Please choose at least one area of interest." };
  }
  const location = typeof state === "string" ? state.trim() : "";
  if (!location || location.length > 60) {
    return { error: "Please choose a location of interest." };
  }
  if (
    !Array.isArray(goals) ||
    goals.length === 0 ||
    !goals.every((g) => NETWORKING_GOALS.includes(g))
  ) {
    return { error: "Please choose what you're looking to gain from this network." };
  }
  return { alumniId, interests: [...new Set(interests)], goals: [...new Set(goals)], location };
}

// Profile details the message templates use (plus the person's first degree)
async function loadSender(alumniId) {
  const result = await db.query(
    `SELECT a.id, a.first_name, a.last_name, a.email, a.email_verified, a.classification,
            a.major, a.company, a.job_title, a.industry_category,
            (SELECT d.degree_name FROM alumni_degrees d
             WHERE d.alumni_id = a.id AND d.degree_name <> 'Other'
             ORDER BY d.year_conferred LIMIT 1) AS first_degree
     FROM alumni a WHERE a.id = $1`,
    [alumniId],
  );
  return result.rows[0] || null;
}

// The messages a person can choose from, built from their profile + selections
router.post("/portal/message-options", async (req, res) => {
  const picked = readPortalSelections(req.body);
  if (picked.error) return res.status(400).json({ error: picked.error });
  try {
    const sender = await loadSender(picked.alumniId);
    if (!sender) return res.status(404).json({ error: "Account not found." });
    res.json({ options: buildMessageOptions(sender, picked) });
  } catch (err) {
    console.error("Message options error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/portal/proposals", async (req, res) => {
  // ---- Validate input ----
  const picked = readPortalSelections(req.body);
  if (picked.error) return res.status(400).json({ error: picked.error });
  const { interests } = picked;
  const cleanState = picked.location;

  try {
    const sender = await loadSender(picked.alumniId);
    if (!sender) {
      return res.status(404).json({ error: "Account not found." });
    }

    // People can only send one of the pre-written messages. The server
    // rebuilds it here, so the text can't be changed in the browser.
    const chosen = buildMessageOptions(sender, picked).find(
      (o) => o.id === req.body.messageId,
    );
    if (!chosen) {
      return res.status(400).json({ error: "Please choose one of the suggested messages." });
    }
    const cleanBody = chosen.text;
    if (!sender.email_verified) {
      return res
        .status(403)
        .json({ error: "Please verify your email before sending proposals." });
    }

    // ---- Limit how often one person can email everyone ----
    const recent = await db.query(
      `SELECT COUNT(*)::int AS n FROM connections
       WHERE alumni_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [sender.id],
    );
    if (recent.rows[0].n >= PROPOSALS_PER_DAY) {
      return res.status(429).json({
        error:
          "You can send one proposal every 24 hours. Please try again tomorrow.",
      });
    }

    // Only alumni in the chosen location receive the proposal
    const recipients = await getProposalRecipients(sender.id, cleanState);
    if (recipients.length === 0) {
      return res.status(400).json({
        error:
          "There are no alumni available to connect with in that location yet. Try another location.",
      });
    }

    // Save the request first so its id can go in the email link
    const created = await db.query(
      `INSERT INTO connections (alumni_id, interests, state, body, recipient_count)
       VALUES ($1, $2, $3, $4, 0) RETURNING id`,
      [sender.id, interests, cleanState, cleanBody],
    );
    const connectionId = created.rows[0].id;

    let outcome;
    try {
      outcome = await sendProposalEmails({
        body: cleanBody,
        link: `${FRONTEND_URL}/connections`,
        recipients: recipients.map((r) => r.email),
      });
    } catch (err) {
      await db.query(`DELETE FROM connections WHERE id = $1`, [connectionId]);
      if (isEmailRateLimitError(err)) {
        return sendRateLimited(
          res,
          "Emails have been temporarily limited for security reasons. Please try again in an hour.",
        );
      }
      throw err;
    }

    if (outcome.sent === 0) {
      // Nothing went out: remove the record so it doesn't use up today's request
      await db.query(`DELETE FROM connections WHERE id = $1`, [connectionId]);
      return sendRateLimited(
        res,
        "Emails have been temporarily limited for security reasons. Please try again in an hour.",
      );
    }

    // Batches go out in order, so the first `sent` recipients got the email.
    // Only they can see and accept this request.
    const reached = recipients.slice(0, outcome.sent).map((r) => r.id);
    await db.query(
      `INSERT INTO connection_recipients (connection_id, alumni_id)
       SELECT $1, UNNEST($2::int[])`,
      [connectionId, reached],
    );
    await db.query(`UPDATE connections SET recipient_count = $1 WHERE id = $2`, [
      outcome.sent,
      connectionId,
    ]);

    res.json({
      sent: outcome.sent,
      total: recipients.length,
      partial: outcome.sent < recipients.length,
    });
  } catch (err) {
    console.error("Proposal send error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ---------- BAEN Connections Proposals (alumni inbox) ----------
// Alumni only see the request text, interests and location: never who sent it
// until they accept.
router.get("/connections/inbox", async (req, res) => {
  const { alumniId } = req.query;
  if (!alumniId) {
    return res.status(400).json({ error: "Please log in again." });
  }
  try {
    const result = await db.query(
      `SELECT c.id, c.body, c.interests, c.state, c.created_at,
              r.status, r.responded_at
       FROM connection_recipients r
       JOIN connections c ON c.id = r.connection_id
       WHERE r.alumni_id = $1
       ORDER BY (r.status = 'pending') DESC, c.created_at DESC`,
      [alumniId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Connections inbox error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/connections/:connectionId/accept", async (req, res) => {
  const { connectionId } = req.params;
  const { alumniId } = req.body;
  if (!alumniId) {
    return res.status(400).json({ error: "Please log in again." });
  }

  try {
    // Claim the request (only works once, and only for alumni it was sent to)
    const claimed = await db.query(
      `UPDATE connection_recipients
       SET status = 'accepted', responded_at = NOW()
       WHERE connection_id = $1 AND alumni_id = $2 AND status = 'pending'
       RETURNING id`,
      [connectionId, alumniId],
    );
    if (claimed.rows.length === 0) {
      return res.status(409).json({
        error: "This request is no longer available, or you've already responded.",
      });
    }

    const info = await db.query(
      `SELECT c.body,
              s.first_name AS s_first, s.last_name AS s_last, s.email AS s_email,
              a.first_name AS a_first, a.last_name AS a_last, a.email AS a_email,
              a.classification AS a_class
       FROM connections c
       JOIN alumni s ON s.id = c.alumni_id
       JOIN alumni a ON a.id = $2
       WHERE c.id = $1`,
      [connectionId, alumniId],
    );
    const row = info.rows[0];

    try {
      await sendConnectionIntroEmail({
        studentEmail: row.s_email,
        studentName: `${row.s_first} ${row.s_last}`.trim(),
        alumniEmail: row.a_email,
        alumniName: `${row.a_first} ${row.a_last}`.trim(),
        alumniRole: roleLabel(row.a_class),
        body: row.body,
      });
    } catch (err) {
      // Email didn't go out: put the request back so they can try again
      await db.query(
        `UPDATE connection_recipients SET status = 'pending', responded_at = NULL WHERE id = $1`,
        [claimed.rows[0].id],
      );
      if (isEmailRateLimitError(err)) {
        return sendRateLimited(
          res,
          "Emails have been temporarily limited for security reasons. Please try connecting again in an hour.",
        );
      }
      throw err;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Accept connection error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/connections/:connectionId/decline", async (req, res) => {
  const { connectionId } = req.params;
  const { alumniId } = req.body;
  if (!alumniId) {
    return res.status(400).json({ error: "Please log in again." });
  }
  try {
    const result = await db.query(
      `UPDATE connection_recipients
       SET status = 'declined', responded_at = NOW()
       WHERE connection_id = $1 AND alumni_id = $2 AND status = 'pending'
       RETURNING id`,
      [connectionId, alumniId],
    );
    if (result.rows.length === 0) {
      return res.status(409).json({
        error: "This request is no longer available, or you've already responded.",
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Decline connection error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Companies
router.get("/companies", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT company FROM alumni
       WHERE company IS NOT NULL AND TRIM(company) != ''
       ORDER BY company`,
    );
    res.json(result.rows.map((r) => r.company));
  } catch (err) {
    console.error("Error fetching companies:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Admin Directory
router.get("/admin/alumni", async (req, res) => {
  const { requesterId } = req.query;

  try {
    const allowed = await isAdminRequester(requesterId);
    if (!allowed) {
      return res
        .status(403)
        .json({ error: "You are not authorized to view this page." });
    }

    const result = await db.query(
      `
      SELECT
        a.id, a.classification, a.first_name AS "firstName", a.last_name AS "lastName", a.email, a.company, a.job_title,
        a.industry_category, a.work_city, a.work_state, a.work_country,
        a.seeking_internship, a.seeking_fulltime, a.seeking_grad_school,
        COALESCE(
          STRING_AGG(d.degree_name || ' (' || d.year_conferred || ')', ', ' ORDER BY d.year_conferred),
          ''
        ) AS degrees
      FROM alumni a
      LEFT JOIN alumni_degrees d ON d.alumni_id = a.id
      WHERE LOWER(a.email) != ALL($1::text[])
      GROUP BY a.id
      ORDER BY a.last_name, a.first_name
      `,
      [ADMIN_EMAILS],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Admin alumni fetch error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
