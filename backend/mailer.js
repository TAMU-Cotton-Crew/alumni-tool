const { EmailClient } = require("@azure/communication-email");

const client = new EmailClient(process.env.ACS_CONNECTION_STRING);
const FROM_ADDRESS = process.env.EMAIL_FROM;

// Azure Communication Services returns HTTP 429 when our sending quota is used up.
function isEmailRateLimitError(err) {
  if (!err) return false;
  if (err.rateLimited) return true;
  if (err.statusCode === 429 || err.status === 429) return true;
  if (err.code === "TooManyRequests") return true;
  return /\b429\b|too many requests|throttl|quota/i.test(err.message || "");
}

async function sendEmail(to, subject, html) {
  let result;
  try {
    const poller = await client.beginSend({
      senderAddress: FROM_ADDRESS,
      content: { subject, html },
      recipients: { to: [{ address: to }] },
    });
    result = await poller.pollUntilDone();
  } catch (err) {
    if (isEmailRateLimitError(err)) {
      const limited = new Error("Email sending is rate limited (429).");
      limited.rateLimited = true;
      limited.cause = err;
      throw limited;
    }
    throw err;
  }

  if (result.status !== "Succeeded") {
    throw new Error(`Email failed to send: ${result.status}`);
  }

  return result;
}

async function sendVerificationEmail(to, name, link) {
  await sendEmail(
    to,
    "Verify your email - BAEN Community",
    `
      <p>Hi ${name},</p>
      <p>Thanks for joining the BAEN Community. Please confirm your email address by clicking the link below:</p>
      <p><a href="${link}">Verify My Email</a></p>
      <p>This link will expire in 24 hours.</p>
    `,
  );
}

async function sendPasswordResetEmail(to, name, link) {
  await sendEmail(
    to,
    "Reset your password - BAEN Community",
    `
      <p>Hi ${name},</p>
      <p>We received a request to reset your password. Click the link below to choose a new one:</p>
      <p><a href="${link}">Reset My Password</a></p>
      <p>This link will expire in 1 hour. If you did not request this, you can safely ignore this email.</p>
    `,
  );
}

async function sendMfaCodeEmail(to, name, code) {
  await sendEmail(
    to,
    "Your BAEN Community login code",
    `
      <p>Hi ${name},</p>
      <p>Your login code is:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
      <p>This code will expire in 10 minutes. If you did not try to log in, you can safely ignore this email.</p>
    `,
  );
}

// Escape user-written text before putting it in an email's HTML
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Connection request: alumni only see the student's short bio and a link to
// review it on the site. No name or email is shared at this stage.
// Recipients are in BCC in batches of 50; the visible "To" is our own address
// so nobody's email is exposed. Returns { sent, rateLimited }.
async function sendProposalEmails({ body, link, recipients }) {
  const BATCH_SIZE = 50;
  const html = `
    <p>A BAEN student would like to connect with you through the BAEN Connect Portal.</p>
    <p><strong>About them:</strong></p>
    <div style="border-left: 4px solid #500000; padding: 8px 12px; margin: 12px 0;">
      ${escapeHtml(body).replace(/\r?\n/g, "<br/>")}
    </div>
    <p><a href="${link}">Review this request and connect</a></p>
    <p>If you choose to connect, we'll introduce you to each other by email.</p>
    <p style="color:#666;font-size:12px;">You received this because you opted in to connecting with current BAEN students. You can turn this off on your BAEN Community profile.</p>
  `;

  let sent = 0;
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    try {
      const poller = await client.beginSend({
        senderAddress: FROM_ADDRESS,
        content: { subject: "BAEN Connect: a student would like to connect", html },
        recipients: {
          to: [{ address: FROM_ADDRESS }],
          bcc: batch.map((address) => ({ address })),
        },
      });
      const result = await poller.pollUntilDone();
      if (result.status !== "Succeeded") {
        throw new Error(`Email failed to send: ${result.status}`);
      }
      sent += batch.length;
    } catch (err) {
      if (isEmailRateLimitError(err)) return { sent, rateLimited: true };
      if (sent > 0) {
        console.error("Proposal email batch failed:", err);
        return { sent, rateLimited: false };
      }
      throw err;
    }
  }
  return { sent, rateLimited: false };
}

// Sent when an alumnus accepts: introduces the student and alumnus to each
// other (student in To, alumnus in CC) so they can reply-all to start talking.
async function sendConnectionIntroEmail({
  studentEmail,
  studentName,
  alumniEmail,
  alumniName,
  alumniRole = "a BAEN alum",
  body,
}) {
  try {
    const poller = await client.beginSend({
      senderAddress: FROM_ADDRESS,
      content: {
        subject: `BAEN Connect: ${studentName}, meet ${alumniName}`,
        html: `
          <p>Hi ${escapeHtml(studentName)} and ${escapeHtml(alumniName)},</p>
          <p>Great news: <strong>${escapeHtml(alumniName)}</strong> (${escapeHtml(alumniEmail)}), ${escapeHtml(alumniRole)}, accepted
             <strong>${escapeHtml(studentName)}</strong>'s (${escapeHtml(studentEmail)}) connection request through the BAEN Connect Portal.</p>
          <p><strong>${escapeHtml(studentName)}'s request:</strong></p>
          <div style="border-left: 4px solid #500000; padding: 8px 12px; margin: 12px 0;">
            ${escapeHtml(body).replace(/\r?\n/g, "<br/>")}
          </div>
          <p>Use <strong>Reply All</strong> to start the conversation. Gig 'em!</p>
        `,
      },
      recipients: {
        to: [{ address: studentEmail }],
        cc: [{ address: alumniEmail }],
      },
      replyTo: [{ address: studentEmail }, { address: alumniEmail }],
    });
    const result = await poller.pollUntilDone();
    if (result.status !== "Succeeded") {
      throw new Error(`Email failed to send: ${result.status}`);
    }
  } catch (err) {
    if (isEmailRateLimitError(err)) {
      const limited = new Error("Email sending is rate limited (429).");
      limited.rateLimited = true;
      limited.cause = err;
      throw limited;
    }
    throw err;
  }
}

module.exports = {
  sendProposalEmails,
  sendConnectionIntroEmail,
  isEmailRateLimitError,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendMfaCodeEmail,
};
