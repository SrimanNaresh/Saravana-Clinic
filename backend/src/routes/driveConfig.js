import { Router } from 'express';
import multer from 'multer';
import { getPool, sql } from '../db/pool.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { getAuthUrl, driveClientFor, extractFolderId, bufferToStream, isConfigured } from '../utils/googleDrive.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

async function loadConnection(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT * FROM DriveConnection WHERE DriveConnectionId=@id AND IsActive=1');
    if (!result.recordset.length) return res.status(404).json({ error: 'Drive connection not found' });
    const row = result.recordset[0];
    if (!row.FolderId) return res.status(400).json({ error: 'No folder configured for this connection yet' });
    req.driveRow = row;
    req.driveTokens = {
      accessToken: row.AccessTokenEncrypted ? decryptSecret(row.AccessTokenEncrypted) : null,
      refreshToken: row.RefreshTokenEncrypted ? decryptSecret(row.RefreshTokenEncrypted) : null,
      expiryDate: row.TokenExpiry,
    };
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Google may hand back a fresh access token mid-request; persist it so we
// don't have to re-consent next time it expires.
function persistRefresh(id) {
  return (tokens) => {
    if (!tokens.access_token) return;
    getPool().then((pool) => {
      pool.request()
        .input('id', sql.Int, id)
        .input('access', sql.NVarChar(sql.MAX), encryptSecret(tokens.access_token))
        .input('expiry', sql.DateTime, tokens.expiry_date ? new Date(tokens.expiry_date) : null)
        .query('UPDATE DriveConnection SET AccessTokenEncrypted=@access, TokenExpiry=@expiry, UpdatedAt=GETDATE() WHERE DriveConnectionId=@id')
        .catch(() => {});
    }).catch(() => {});
  };
}

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT DriveConnectionId, GoogleEmail, FolderId, FolderName, IsActive, CreatedAt
      FROM DriveConnection
      ORDER BY DriveConnectionId DESC
    `);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/connect', (req, res) => {
  if (!isConfigured()) {
    return res.status(500).json({ error: 'Google Drive is not configured on this server yet. Ask your administrator to set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI.' });
  }
  res.json({ url: getAuthUrl() });
});

router.put('/:id', async (req, res) => {
  try {
    const { folder, isActive } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('folderId', sql.NVarChar, extractFolderId(folder) || null)
      .input('folderName', sql.NVarChar, (folder || '').trim() || null)
      .input('isActive', sql.Bit, isActive === false ? 0 : 1)
      .query(`
        UPDATE DriveConnection SET FolderId=@folderId, FolderName=@folderName, IsActive=@isActive, UpdatedAt=GETDATE()
        OUTPUT INSERTED.DriveConnectionId, INSERTED.GoogleEmail, INSERTED.FolderId, INSERTED.FolderName, INSERTED.IsActive, INSERTED.CreatedAt
        WHERE DriveConnectionId=@id
      `);
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM DriveConnection WHERE DriveConnectionId=@id');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/files', loadConnection, async (req, res) => {
  try {
    const drive = driveClientFor(req.driveTokens, persistRefresh(req.params.id));
    const result = await drive.files.list({
      q: `'${req.driveRow.FolderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
    });
    res.json({ folderName: req.driveRow.FolderName, files: result.data.files || [] });
  } catch (err) {
    res.status(502).json({ error: `Could not read Drive folder: ${err.message}` });
  }
});

router.get('/:id/files/:fileId/download', loadConnection, async (req, res) => {
  try {
    const drive = driveClientFor(req.driveTokens, persistRefresh(req.params.id));
    const meta = await drive.files.get({ fileId: req.params.fileId, fields: 'name, mimeType' });
    const result = await drive.files.get(
      { fileId: req.params.fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    res.set('Content-Type', meta.data.mimeType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.data.name || 'download')}"`);
    res.send(Buffer.from(result.data));
  } catch (err) {
    res.status(502).json({ error: `Could not download file: ${err.message}` });
  }
});

router.post('/:id/files', loadConnection, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A file is required' });
  try {
    const drive = driveClientFor(req.driveTokens, persistRefresh(req.params.id));
    const result = await drive.files.create({
      requestBody: { name: req.file.originalname, parents: [req.driveRow.FolderId] },
      media: { mimeType: req.file.mimetype, body: bufferToStream(req.file.buffer) },
      fields: 'id, name',
    });
    res.status(201).json(result.data);
  } catch (err) {
    res.status(502).json({ error: `Could not upload file: ${err.message}` });
  }
});

export default router;
