const fs = require('fs');
const path = require('path');

// Logo for emails: Backend/assets/logo.png (copied from Frontend/public/logo.png).
// If the file is missing, emails fall back to a styled text header —
// a broken logo image is never sent.
const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'logo.png');

function baseUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function logoAttachment() {
  if (!fs.existsSync(LOGO_PATH)) return [];
  return [{ filename: 'logo.png', path: LOGO_PATH, cid: 'asan-logo' }];
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function header() {
  const logo = fs.existsSync(LOGO_PATH)
    ? '<img src="cid:asan-logo" alt="Asan Tijarat" width="120" style="display:block;margin:0 auto 12px auto;" />'
    : '<div style="font-size:24px;font-weight:800;color:#0B3D2E;margin-bottom:12px;">Asan Tijarat</div>';
  return (
    '<div style="background:#0B3D2E;padding:24px;text-align:center;">' +
    logo +
    '<div style="color:#ffffff;font-size:14px;">Pakistan\'s B2B Wholesale Marketplace</div>' +
    '</div>'
  );
}

function footer() {
  const url = baseUrl();
  return (
    '<div style="padding:16px 24px;background:#F7FAFC;color:#718096;font-size:12px;line-height:1.6;text-align:center;">' +
    'By using Asan Tijarat you agree to our ' +
    `<a href="${url}/terms" style="color:#27AE7A;">Terms &amp; Conditions</a>. ` +
    'This is an automated email — please do not reply to it directly.<br />' +
    'Asan Tijarat — Wholesale Trade, Made Simple.' +
    '</div>'
  );
}

function wrap(title, bodyHtml) {
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;border:1px solid #E2E8F0;">' +
    header() +
    '<div style="padding:24px;color:#1A202C;font-size:15px;line-height:1.7;">' +
    `<h2 style="margin:0 0 12px 0;color:#0B3D2E;font-size:20px;">${title}</h2>` +
    bodyHtml +
    '</div>' +
    footer() +
    '</div>'
  );
}

/**
 * OTP email — sent when the trader requests a verification code.
 * Code and 5-minute expiry are stated plainly; the code must never be shared.
 */
function otpEmail({ name, otp }) {
  const safeName = escapeHtml(name);
  const html = wrap(
    'Your verification code',
    `<p>Hello ${safeName},</p>` +
      '<p>Your Asan Tijarat verification code is:</p>' +
      `<div style="text-align:center;font-size:32px;font-weight:800;letter-spacing:6px;color:#0B3D2E;background:#F7FAFC;border:1px solid #E2E8F0;padding:16px;margin:16px 0;">${escapeHtml(otp)}</div>` +
      '<p>This code <strong>expires in 5 minutes</strong>. Do not share it with anyone.</p>' +
      '<p>If you did not request this code, please ignore this email.</p>'
  );
  const text =
    `Hello ${name},\n\n` +
    `Your Asan Tijarat verification code is: ${otp}\n\n` +
    'This code expires in 5 minutes. Do not share it with anyone.\n\n' +
    'If you did not request this code, ignore this email.';
  return { subject: 'Asan Tijarat - Your verification code', html, text, attachments: logoAttachment() };
}

/**
 * Pending-verification email — sent right AFTER OTP verification succeeds.
 * Main point, in plain words: the account is now in the verification process,
 * it will be verified against the trader's NTN and CNIC documents, and only
 * then will registration be granted. No time promise is made here.
 */
function pendingVerificationEmail({ name, businessName, role }) {
  const safeName = escapeHtml(name);
  const safeBusiness = escapeHtml(businessName);
  const roleLabel = role === 'supplier' ? 'supplier' : 'shopkeeper';
  const html = wrap(
    'Your account is under verification',
    `<p>Hello ${safeName},</p>` +
      '<p>Thank you for verifying your email. Your Asan Tijarat account is now <strong>in the verification process</strong>.</p>' +
      `<p>Business: <strong>${safeBusiness}</strong><br />Account type: <strong>${roleLabel}</strong></p>` +
      '<p>What happens next:</p>' +
      '<ol>' +
      '<li>Our team will verify your account against the <strong>NTN number and CNIC documents</strong> you submitted during registration.</li>' +
      '<li>Once verification is complete, you will receive a confirmation email and your registration will be granted.</li>' +
      '<li>Only then will you be able to sign in and start your business on Asan Tijarat.</li>' +
      '</ol>' +
      '<p>No further action is needed from you right now. Please wait for the confirmation email.</p>'
  );
  const text =
    `Hello ${name},\n\n` +
    'Thank you for verifying your email. Your Asan Tijarat account is now in the verification process.\n\n' +
    `Business: ${businessName}\nAccount type: ${roleLabel}\n\n` +
    'What happens next:\n' +
    '1. Our team will verify your account against the NTN number and CNIC documents you submitted during registration.\n' +
    '2. Once verification is complete, you will receive a confirmation email and your registration will be granted.\n' +
    '3. Only then will you be able to sign in and start your business on Asan Tijarat.\n\n' +
    'No further action is needed from you right now. Please wait for the confirmation email.';
  return { subject: 'Asan Tijarat - Your account is under verification', html, text, attachments: logoAttachment() };
}

/**
 * Account-verified email — sent when an admin approves the account
 * (verified changes false -> true). The trader can now sign in and
 * start their business.
 */
function accountVerifiedEmail({ name, businessName }) {
  const safeName = escapeHtml(name);
  const safeBusiness = escapeHtml(businessName);
  const signinUrl = `${baseUrl()}/signin`;
  const html = wrap(
    'Your account has been verified',
    `<p>Hello ${safeName},</p>` +
      '<p>Good news — your Asan Tijarat account has been <strong>verified</strong>!</p>' +
      `<p>Business: <strong>${safeBusiness}</strong></p>` +
      '<p>You can now sign in with your registered email and password and start your business on Asan Tijarat.</p>' +
      `<div style="text-align:center;margin:24px 0;"><a href="${signinUrl}" style="display:inline-block;background:#27AE7A;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:8px;">Sign In to Asan Tijarat</a></div>` +
      `<p style="font-size:13px;color:#718096;">If the button does not work, open this link in your browser:<br />${signinUrl}</p>` +
      '<p>Thank you for joining Asan Tijarat.</p>'
  );
  const text =
    `Hello ${name},\n\n` +
    'Good news — your Asan Tijarat account has been verified!\n\n' +
    `Business: ${businessName}\n\n` +
    'You can now sign in with your registered email and password and start your business on Asan Tijarat.\n\n' +
    `Sign in here: ${signinUrl}\n\n` +
    'Thank you for joining Asan Tijarat.';
  return { subject: 'Asan Tijarat - Your account has been approved', html, text, attachments: logoAttachment() };
}

/**
 * Contact admin notification — branded version of the plain-text email
 * the contact form used to send. Uses the same logo/header as the other
 * branded emails, but a custom footer WITHOUT the do-not-reply line,
 * because the admin must reply to the sender directly.
 */
function contactAdminNotificationEmail({ name, email, subject, message }) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeSubject = escapeHtml(subject || 'New message');
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br />');
  const termsUrl = baseUrl() + '/terms';
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;border:1px solid #E2E8F0;">' +
    header() +
    '<div style="padding:24px;color:#1A202C;font-size:15px;line-height:1.7;">' +
    '<h2 style="margin:0 0 12px 0;color:#0B3D2E;font-size:20px;">New contact message</h2>' +
    '<p><strong>From:</strong> ' + safeName + '</p>' +
    '<p><strong>Email:</strong> ' + safeEmail + '</p>' +
    '<p><strong>Subject:</strong> ' + safeSubject + '</p>' +
    '<div style="background:#F7FAFC;border:1px solid #E2E8F0;border-left:4px solid #27AE7A;padding:16px;margin:16px 0;">' + safeMessage + '</div>' +
    '<p>To reply, email the sender directly at ' + safeEmail + '.</p>' +
    '</div>' +
    '<div style="padding:16px 24px;background:#F7FAFC;color:#718096;font-size:12px;line-height:1.6;text-align:center;">' +
    'By using Asan Tijarat you agree to our ' +
    '<a href="' + termsUrl + '" style="color:#27AE7A;">Terms &amp; Conditions</a>.' +
    '</div>' +
    '</div>';
  const text =
    'New contact message\n\n' +
    'From: ' + name + '\n' +
    'Email: ' + email + '\n' +
    'Subject: ' + (subject || 'New message') + '\n\n' +
    message + '\n\n' +
    'To reply, email the sender directly at ' + email + '.';
  return { subject: 'Asan Tijarat contact: ' + (subject || 'New message'), html, text, attachments: logoAttachment() };
}

/**
 * Contact auto-reply — branded version sent to the person who filled
 * the contact form. No time promise is made here.
 */
function contactAutoReplyEmail({ name, subject, message }) {
  const safeName = escapeHtml(name);
  const safeSubject = escapeHtml(subject || 'New message');
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br />');
  const html = wrap(
    'We received your message',
    `<p>Hello ${safeName},</p>` +
      '<p>Thank you for contacting Asan Tijarat. We received your message and our team will review it.</p>' +
      (subject ? `<p><strong>Subject:</strong> ${safeSubject}</p>` : '') +
      `<div style="background:#F7FAFC;border:1px solid #E2E8F0;border-left:4px solid #27AE7A;padding:16px;margin:16px 0;">${safeMessage}</div>` +
      '<p>We will get back to you on your email address.</p>'
  );
  const text =
    `Hello ${name},\n\n` +
    'Thank you for contacting Asan Tijarat. We received your message and our team will review it.\n\n' +
    message + '\n\n' +
    'We will get back to you on your email address.';
  return { subject: 'Asan Tijarat - We received your message', html, text, attachments: logoAttachment() };
}

/**
 * Account-suspended email — sent when an admin suspends an account.
 * The admin-written reason is shown in the box. No time promise is made.
 * Email failure never blocks the suspension — that rule lives in the
 * admin controller, which sends this only as a notification.
 */
function accountSuspendedEmail({ name, businessName, reason }) {
  const safeName = escapeHtml(name);
  const safeBusiness = escapeHtml(businessName);
  const safeReason = escapeHtml(reason || '').replace(/\n/g, '<br />');
  const html = wrap(
    'Your account has been suspended',
    `<p>Hello ${safeName},</p>` +
      '<p>Your Asan Tijarat account has been <strong>temporarily suspended</strong>, so you cannot sign in right now.</p>' +
      (safeBusiness ? `<p>Business: <strong>${safeBusiness}</strong></p>` : '') +
      (reason
        ? `<p><strong>Reason:</strong></p><div style="background:#F7FAFC;border:1px solid #E2E8F0;border-left:4px solid #27AE7A;padding:16px;margin:16px 0;">${safeReason}</div>`
        : '<p>For more details, please contact us through the contact form on the website.</p>') +
      '<p>If you believe this is a mistake, please contact us through the contact form on the website and our team will review it.</p>'
  );
  const text =
    `Hello ${name},\n\n` +
    'Your Asan Tijarat account has been temporarily suspended, so you cannot sign in right now.\n\n' +
    (businessName ? `Business: ${businessName}\n\n` : '') +
    (reason ? `Reason: ${reason}\n\n` : '') +
    'If you believe this is a mistake, please contact us through the contact form on the website and our team will review it.';
  return { subject: 'Asan Tijarat - Your account has been suspended', html, text, attachments: logoAttachment() };
}

/**
 * Account-rejected email — sent when an admin rejects a registration.
 * The admin-written reason is shown in the box. No sign-in button here,
 * because a rejected account cannot sign in.
 */
function accountRejectedEmail({ name, businessName, reason }) {
  const safeName = escapeHtml(name);
  const safeBusiness = escapeHtml(businessName);
  const safeReason = escapeHtml(reason || '').replace(/\n/g, '<br />');
  const html = wrap(
    'Your registration was not approved',
    `<p>Hello ${safeName},</p>` +
      '<p>Thank you for registering on Asan Tijarat. After review, your registration could <strong>not be approved</strong>.</p>' +
      (safeBusiness ? `<p>Business: <strong>${safeBusiness}</strong></p>` : '') +
      (reason
        ? `<p><strong>Reason:</strong></p><div style="background:#F7FAFC;border:1px solid #E2E8F0;border-left:4px solid #27AE7A;padding:16px;margin:16px 0;">${safeReason}</div>`
        : '<p>For more details, please contact us through the contact form on the website.</p>') +
      '<p>If you believe the information submitted was incorrect, please contact us through the contact form on the website.</p>'
  );
  const text =
    `Hello ${name},\n\n` +
    'Thank you for registering on Asan Tijarat. After review, your registration could not be approved.\n\n' +
    (businessName ? `Business: ${businessName}\n\n` : '') +
    (reason ? `Reason: ${reason}\n\n` : '') +
    'If you believe the information submitted was incorrect, please contact us through the contact form on the website.';
  return { subject: 'Asan Tijarat - Your registration was not approved', html, text, attachments: logoAttachment() };
}

/**
 * Account-reactivated email — sent when an admin activates a suspended
 * account again. The trader can sign in with the registered credentials.
 */
function accountReactivatedEmail({ name, businessName }) {
  const safeName = escapeHtml(name);
  const safeBusiness = escapeHtml(businessName);
  const signinUrl = `${baseUrl()}/signin`;
  const html = wrap(
    'Your account has been reactivated',
    `<p>Hello ${safeName},</p>` +
      '<p>Good news — your Asan Tijarat account has been <strong>reactivated</strong>!</p>' +
      (safeBusiness ? `<p>Business: <strong>${safeBusiness}</strong></p>` : '') +
      '<p>You can now sign in with your registered email and password and start your business on Asan Tijarat.</p>' +
      `<div style="text-align:center;margin:24px 0;"><a href="${signinUrl}" style="display:inline-block;background:#27AE7A;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:8px;">Sign In to Asan Tijarat</a></div>` +
      `<p style="font-size:13px;color:#718096;">If the button does not work, open this link in your browser:<br />${signinUrl}</p>` +
      '<p>Thank you for continuing with Asan Tijarat.</p>'
  );
  const text =
    `Hello ${name},\n\n` +
    'Good news — your Asan Tijarat account has been reactivated!\n\n' +
    (businessName ? `Business: ${businessName}\n\n` : '') +
    'You can now sign in with your registered email and password and start your business on Asan Tijarat.\n\n' +
    `Sign in here: ${signinUrl}\n\n` +
    'Thank you for continuing with Asan Tijarat.';
  return { subject: 'Asan Tijarat - Your account has been reactivated', html, text, attachments: logoAttachment() };
}

module.exports = { otpEmail, pendingVerificationEmail, accountVerifiedEmail, contactAdminNotificationEmail, contactAutoReplyEmail, accountSuspendedEmail, accountRejectedEmail, accountReactivatedEmail };
