import { google } from 'googleapis';
import { Readable } from 'stream';

// Set on the server after you create these in Google Cloud Console — see
// Settings > Google Drive for the exact setup steps. Nothing here works
// until real values are configured.
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

// Full Drive access (not the narrower drive.file scope) is required because
// we need to browse an existing folder's pre-existing files, not just files
// this app itself created.
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function isConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

export function getOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl() {
  return getOAuthClient().generateAuthUrl({
    access_type: 'offline', // required to receive a refresh_token
    prompt: 'consent', // force the consent screen so a refresh_token is issued every time
    scope: SCOPES,
  });
}

export async function exchangeCode(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  return { tokens, email: data.email };
}

// Builds a Drive API client from stored tokens. If Google issues a fresh
// access token during a call, onRefresh(tokens) fires so the caller can
// persist it back to the DB.
export function driveClientFor({ accessToken, refreshToken, expiryDate }, onRefresh) {
  const client = getOAuthClient();
  client.setCredentials({
    access_token: accessToken || undefined,
    refresh_token: refreshToken,
    expiry_date: expiryDate ? new Date(expiryDate).getTime() : undefined,
  });
  if (onRefresh) client.on('tokens', onRefresh);
  return google.drive({ version: 'v3', auth: client });
}

// Accepts either a raw folder ID or a full "https://drive.google.com/drive/folders/<id>..." link.
export function extractFolderId(input) {
  if (!input) return null;
  const match = String(input).match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : String(input).trim();
}

export function bufferToStream(buffer) {
  return Readable.from(buffer);
}
