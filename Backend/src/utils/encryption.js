/**
 * Field-level encryption for sensitive identity numbers at rest
 * (CNIC, NTN, utility bill account numbers on the User model).
 *
 * - AES-256-GCM (authenticated encryption) via Node's built-in crypto.
 *   No new npm dependencies.
 * - Key comes from the ENCRYPTION_KEY env var: 64 hex chars (32 bytes).
 *   Generate one with:
 *     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   Put it in Backend/.env (local) and in the production env vars.
 *   NEVER commit it, NEVER paste it in chat.
 * - Wire format: "enc:<iv-hex>:<tag-hex>:<ciphertext-hex>".
 * - encrypt() is idempotent: already-encrypted values pass through, so
 *   double-encryption can never happen.
 * - decrypt() returns non-encrypted (legacy plaintext) values as-is, so
 *   accounts created before encryption stay readable.
 */
const crypto = require('crypto');

const PREFIX = 'enc:';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 16;

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex.trim())) {
    throw new Error(
      'ENCRYPTION_KEY is missing or invalid — expected 64 hex characters (32 bytes). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" ' +
        'and put it in Backend/.env (never commit it).'
    );
  }
  return Buffer.from(hex.trim(), 'hex');
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encrypt(plaintext) {
  if (plaintext === undefined || plaintext === null || plaintext === '') return plaintext;
  const s = String(plaintext);
  if (isEncrypted(s)) return s; // idempotent — never double-encrypt
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(s, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

function decrypt(payload) {
  if (payload === undefined || payload === null || payload === '') return payload;
  const s = String(payload);
  if (!isEncrypted(s)) return s; // legacy plaintext — return as-is
  const parts = s.split(':');
  if (parts.length !== 4) throw new Error('Malformed encrypted value.');
  const [, ivHex, tagHex, ctHex] = parts;
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctHex, 'hex')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

module.exports = { encrypt, decrypt, isEncrypted };
