const nodemailer = require('nodemailer');

function isEmailConfigured() {
  return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

/**
 * Sends one plain-text email.
 * Returns true if the email was sent, false if SMTP is not configured
 * or sending failed. Never throws, so callers can fall back to the
 * terminal dev log instead of crashing the request.
 */
async function sendEmail({ to, subject, text }) {
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
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      text,
    });
    console.log(`[email] Sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error(`[email] Failed to send to ${to}: ${err.message}`);
    return false;
  }
}

module.exports = { sendEmail, isEmailConfigured };
