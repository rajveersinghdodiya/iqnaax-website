const nodemailer = require('nodemailer');
const db = require('../services/db');

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
const OTP_EXPIRY_MINUTES = 5;

function nowUtcString() {
  return new Date().toISOString().replace('T', ' ').split('.')[0];
}

function expiryUtcString() {
  const expires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);
  return expires.toISOString().replace('T', ' ').split('.')[0];
}

function getSmtpConfig() {
  const smtpEmail = process.env.SMTP_EMAIL;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const senderEmail = process.env.SMTP_FROM_EMAIL || smtpEmail;
  return { smtpEmail, smtpPassword, senderEmail };
}

function createTransporter() {
  const { smtpEmail, smtpPassword } = getSmtpConfig();
  if (!smtpEmail || !smtpPassword) {
    throw new Error('SMTP_EMAIL and SMTP_PASSWORD must be configured');
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: smtpEmail,
      pass: smtpPassword,
    },
  });
}

async function sendEmailViaSmtp(toEmail, code) {
  const { senderEmail } = getSmtpConfig();
  const transporter = createTransporter();

  const message = {
    from: senderEmail,
    to: toEmail,
    subject: 'Your IQNAAX verification code',
    text: `Your IQNAAX OTP is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
  };

  await transporter.sendMail(message);
}

async function sendOtp(req, res, next) {
  try {
    const body = req.body || {};
    const email = (body.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    await db.run('DELETE FROM otp_codes WHERE email = ?', [email]);

    const code = `${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
    const expiresAt = expiryUtcString();
    await db.run('INSERT INTO otp_codes (email, code, expires_at, used) VALUES (?, ?, ?, 0)', [email, code, expiresAt]);

    try {
      await sendEmailViaSmtp(email, code);
    } catch (err) {
      await db.run('DELETE FROM otp_codes WHERE email = ?', [email]);
      return res.status(500).json({ error: err.message });
    }

    return res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const body = req.body || {};
    const email = (body.email || '').trim().toLowerCase();
    const otp = String(body.otp || '').trim();

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }
    if (!EMAIL_REGEX.test(email) || !/^[0-9]{6}$/.test(otp)) {
      return res.status(400).json({ error: 'Invalid email or OTP' });
    }

    const now = nowUtcString();
    await db.run('DELETE FROM otp_codes WHERE expires_at < ?', [now]);

    const row = await db.get(
      'SELECT id, email, code, expires_at, used, created_at FROM otp_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at >= ? ORDER BY created_at DESC LIMIT 1',
      [email, otp, now]
    );

    if (!row) {
      return res.status(400).json({ error: 'OTP is invalid or has expired' });
    }

    await db.run('UPDATE otp_codes SET used = 1 WHERE id = ?', [row.id]);
    return res.json({ message: 'OTP verified successfully', success: true });
  } catch (err) {
    next(err);
  }
}

async function createContact(req, res, next) {
  try {
    const body = req.body || {};
    const name = body.name;
    const email = body.email;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    if (!EMAIL_REGEX.test(String(email).trim())) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const phone = body.phone || '';
    const organization = body.organization || '';
    const inquiryType = body.inquiry_type || '';
    const message = body.message || `Inquiry type: ${inquiryType || 'N/A'}; Organization: ${organization || 'N/A'}`;

    const result = await db.run(
      'INSERT INTO contacts (name, email, phone, organization, inquiry_type, message) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, phone, organization, inquiryType, message]
    );

    return res.status(201).json({
      message: 'Contact submission created successfully',
      contact: {
        id: result.lastID,
        name,
        email,
        phone,
        organization,
        inquiry_type: inquiryType,
        message,
      }
    });
  } catch (err) {
    next(err);
  }
}

async function debugResend(req, res, next) {
  try {
    const { smtpEmail, smtpPassword, senderEmail } = getSmtpConfig();
    return res.json({
      smtp_configured: Boolean(smtpEmail && smtpPassword),
      smtp_email_loaded: Boolean(smtpEmail),
      sender_email: senderEmail,
      smtp_host: 'smtp.gmail.com',
      smtp_port: 587,
      smtp_status: smtpEmail && smtpPassword ? 'configured' : 'missing_credentials',
    });
  } catch (err) {
    next(err);
  }
}

async function debugOtp(req, res, next) {
  try {
    const email = (req.query.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'email query parameter is required' });
    }

    const row = await db.get('SELECT id, email, code, expires_at, used, created_at FROM otp_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1', [email]);
    if (!row) {
      return res.status(404).json({ error: 'no otp found for email' });
    }

    const isExpired = row.expires_at < nowUtcString();
    return res.json({
      stored_otp: row.code,
      email: row.email,
      created_at: row.created_at,
      expires_at: row.expires_at,
      used: Boolean(row.used),
      is_expired: isExpired,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  sendOtp,
  verifyOtp,
  createContact,
  debugResend,
  debugOtp,
};
