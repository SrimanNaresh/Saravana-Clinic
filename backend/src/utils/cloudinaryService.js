import { v2 as cloudinary } from 'cloudinary';

// Active storage provider for Patient Records (swap back to Google Drive
// later — see googleDriveService.js, kept dormant with the same function
// shapes it was originally built with). Files upload as `type: 'private'` so
// a bare Cloudinary URL can never serve a patient's document — every
// download is a signed, purpose-built private-download URL fetched server
// side, then streamed through our own auth-checked route (see
// routes/patientDocuments.js). Note: 'private' is Cloudinary's own delivery
// type with a dedicated `private_download_url` helper — do not confuse with
// the separate 'authenticated' delivery type, which needs its own auth-token
// mechanism and doesn't work with plain signed URLs.
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const DELIVERY_TYPE = 'private';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!isConfigured()) throw new Error('Cloudinary is not configured on this server yet.');
  cloudinary.config({ cloud_name: CLOUD_NAME, api_key: API_KEY, api_secret: API_SECRET, secure: true });
  configured = true;
}

export function isConfigured() {
  return !!(CLOUD_NAME && API_KEY && API_SECRET);
}

// Cloudinary has no real folder objects — the "folder" is just a path
// prefix baked into each file's public_id. Nothing to create ahead of time.
export async function ensurePatientFolder(patientId, patientName) {
  const safeName = String(patientName || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'patient';
  return `patient-records/${patientId}-${safeName}`;
}

export async function uploadFile(folderPath, filename, mimeType, buffer) {
  ensureConfigured();
  const safeFilename = filename.replace(/\.[^./]+$/, '').replace(/[^a-zA-Z0-9 _-]/g, '');
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: folderPath,
        public_id: `${Date.now()}-${safeFilename}`,
        resource_type: 'auto',
        type: DELIVERY_TYPE,
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

// `format` (the file's extension, e.g. "pdf") matters for resource_type
// 'image' — Cloudinary treats PDFs as images internally, and needs the
// format to resolve the right derived asset. Harmless to pass for 'raw' too.
export async function downloadFile(storageFileId, resourceType, format) {
  ensureConfigured();
  const url = cloudinary.utils.private_download_url(storageFileId, format, {
    resource_type: resourceType || 'raw',
    type: DELIVERY_TYPE,
  });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cloudinary download failed (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mimeType: response.headers.get('content-type') || 'application/octet-stream' };
}

export async function deleteFile(storageFileId, resourceType) {
  ensureConfigured();
  await cloudinary.uploader.destroy(storageFileId, { resource_type: resourceType || 'raw', type: DELIVERY_TYPE });
}
