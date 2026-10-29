const nodemailer = require('nodemailer');

function isEmailConfigured() {
  return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

/**
 * Sends one email — plain text, HTML, or both, with optional attachments.
 * - Old callers that pass only { to, subject, text } keep working exactly as before.
 * - New branded templates pass { html } too; it is forwarded to nodemailer
 *   unchanged. (v5 templates load the logo from LOGO_URL — no attachments.)
 * - Sender name is ALWAYS the brand: "Asan Tijarat" (overridable with
 *   EMAIL_FROM_NAME in .env). The address is EMAIL_FROM, else EMAIL_USER.
 * Returns true if the email was sent, false if SMTP is not configured
 * or sending failed. Never throws, so callers can fall back to the
 * terminal dev log instead of crashing the request.
 */
async function sendEmail({ to, subject, text, html, attachments }) {
  if (!isEmailConfigured()) {
    return false;
  }
  try {
    const port = Number(process.env.EMAIL_PORT || 587);
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const fromName = process.env.EMAIL_FROM_NAME || 'Asan Tijarat';
    await transporter.sendMail({
      from: { name: fromName, address: fromAddress },
      to,
      subject,
      text,
      ...(html ? { html } : {}),
      ...(attachments && attachments.length ? { attachments } : {}),
    });
    console.log(`[email] Sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error(`[email] Failed to send to ${to}: ${err.message}`);
    return false;
  }
}

module.exports = { sendEmail, isEmailConfigured };
