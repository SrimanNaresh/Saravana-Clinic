import { google } from 'googleapis';
import { Readable } from 'stream';

// Service-account Drive access for Patient Records: one Drive connection,
// configured once by an admin (no per-user OAuth, no "Connect" button — see
// GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_DRIVE_FOLDER_ID in .env.example).
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const SCOPES = ['https://www.googleapis.com/auth/drive'];

let cachedAuth = null;

function getAuth() {
  if (cachedAuth) return cachedAuth;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const credentials = JSON.parse(raw);
  cachedAuth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  return cachedAuth;
}

export function isConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && ROOT_FOLDER_ID);
}

function getDrive() {
  const auth = getAuth();
  if (!auth) throw new Error('Google Drive is not configured on this server yet.');
  return google.drive({ version: 'v3', auth });
}

// Escapes single quotes for safe use inside a Drive API `q` string literal.
function escapeForQuery(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Finds (or creates) the per-patient subfolder under the configured root.
export async function ensurePatientFolder(patientId, patientName) {
  const drive = getDrive();
  const folderName = `${patientId} - ${patientName}`.trim();
  const q = `'${ROOT_FOLDER_ID}' in parents and name = '${escapeForQuery(folderName)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const existing = await drive.files.list({ q, fields: 'files(id, name)' });
  if (existing.data.files?.length) return existing.data.files[0].id;

  const created = await drive.files.create({
    requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [ROOT_FOLDER_ID] },
    fields: 'id',
  });
  return created.data.id;
}

export async function uploadFile(folderId, filename, mimeType, buffer) {
  const drive = getDrive();
  const result = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, name',
  });
  return result.data;
}

export async function downloadFile(fileId) {
  const drive = getDrive();
  const meta = await drive.files.get({ fileId, fields: 'name, mimeType' });
  const result = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return { name: meta.data.name, mimeType: meta.data.mimeType, buffer: Buffer.from(result.data) };
}

export async function deleteFile(fileId) {
  const drive = getDrive();
  await drive.files.delete({ fileId });
}
