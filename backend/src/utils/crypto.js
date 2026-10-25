import crypto from 'crypto';

// AES-256-GCM encryption for credentials at rest (Gmail App Passwords).
// Stored format: "<ivHex>:<authTagHex>:<cipherHex>".
// MAIL_ENCRYPTION_KEY must be a 32-byte value — falls back to a fixed dev-only
// key so local `npm run dev` works without a .env; production must set a real
// one (see .env.example), otherwise stored passwords are not safely encrypted.
const RAW_KEY = process.env.MAIL_ENCRYPTION_KEY || 'dev-only-insecure-32-byte-key!!';
const KEY = crypto.createHash('sha256').update(RAW_KEY).digest(); // always exactly 32 bytes

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(stored) {
  const [ivHex, authTagHex, dataHex] = String(stored).split(':');
  if (!ivHex || !authTagHex || !dataHex) throw new Error('Invalid encrypted value');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}
