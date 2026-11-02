/**
 * sendEmail.js — Brevo HTTP API version.
 *
 * WHY: Render's network blocks outbound SMTP (Gmail 587/465 and Brevo SMTP
 * all timed out with "Connection timeout"). So we send via Brevo's HTTPS
 * API (port 443) instead of SMTP. No nodemailer, no SMTP ports.
 *
 * Env needed:
 *   BREVO_API_KEY   — Brevo dashboard → SMTP & API → API Keys → Generate
 *   EMAIL_FROM      — sender address (must be verified in Brevo → Senders)
 *   EMAIL_FROM_NAME — sender name, default "Asan Tijarat"
 *
 * Interface is UNCHANGED: sendEmail({ to, subject, text, html }) → true/false.
 * Never throws — callers fall back to the terminal dev log on failure.
 */
function isEmailConfigured() {
  return Boolean(process.env.BREVO_API_KEY);
}

async function sendEmail({ to, subject, text, html }) {
  if (!isEmailConfigured()) {
    return false;
  }
  try {
    const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const fromName = process.env.EMAIL_FROM_NAME || 'Asan Tijarat';
    if (!fromAddress) {
      console.error('[email] Missing EMAIL_FROM (sender address).');
      return false;
    }
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromAddress },
        to: [{ email: to }],
        subject,
        ...(html ? { htmlContent: html } : {}),
        ...(text ? { textContent: text } : {}),
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[email] Brevo API failed (${res.status}): ${errText}`);
      return false;
    }
    console.log(`[email] Sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error(`[email] Failed to send to ${to}: ${err.message}`);
    return false;
  }
}

module.exports = { sendEmail, isEmailConfigured };
