import { Router } from 'express';
import multer from 'multer';
import { getPool, sql } from '../db/pool.js';
// Cloudinary for now — swap this one import to googleDriveService.js later
// (same function shapes) when Google Drive support comes back.
import { isConfigured, ensurePatientFolder, uploadFile, downloadFile, deleteFile } from '../utils/cloudinaryService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Admin/Doctor have full access (including delete). Reception can upload and
// view — they're the ones handling lab reports/scans a patient brings in at
// intake on the Vital Sign screen — but can't delete a medical record.
const STAFF_ROLES = ['Admin', 'Doctor'];
const UPLOAD_ROLES = ['Admin', 'Doctor', 'Reception'];

// List a patient's documents. Staff/Reception may request any patientId; a
// Patient-role login is always forced to its own LinkedPatientId, regardless
// of what (if anything) is passed in the query string.
router.get('/', async (req, res) => {
  try {
    const { role, linkedPatientId } = req.user;
    let patientId;
    if (role === 'Patient') {
      if (!linkedPatientId) return res.status(403).json({ error: 'This account is not linked to a patient record' });
      patientId = linkedPatientId;
    } else if (UPLOAD_ROLES.includes(role)) {
      patientId = Number(req.query.patientId);
      if (!patientId) return res.status(400).json({ error: 'patientId is required' });
    } else {
      return res.status(403).json({ error: 'Not authorized to view patient documents' });
    }

    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, patientId).query(`
      SELECT DocumentId, PatientId, FileName, Category, DocumentDate, UploadedBy, CreatedAt
      FROM PatientDocument
      WHERE PatientId = @id
      ORDER BY DocumentDate DESC, CreatedAt DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!UPLOAD_ROLES.includes(req.user.role)) return res.status(403).json({ error: 'Not authorized' });
    if (!isConfigured()) return res.status(500).json({ error: 'Cloudinary is not configured on this server yet.' });
    if (!req.file) return res.status(400).json({ error: 'A file is required' });
    const { patientId, category, documentDate } = req.body;
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });

    const pool = await getPool();
    const patientRow = await pool.request().input('id', sql.Int, patientId).query('SELECT Name FROM Patient WHERE PatientId = @id');
    if (!patientRow.recordset.length) return res.status(404).json({ error: 'Patient not found' });

    const folderId = await ensurePatientFolder(patientId, patientRow.recordset[0].Name);
    const uploaded = await uploadFile(folderId, req.file.originalname, req.file.mimetype, req.file.buffer);

    const inserted = await pool.request()
      .input('patientId', sql.Int, patientId)
      .input('fileName', sql.NVarChar, req.file.originalname)
      .input('storageProvider', sql.NVarChar, 'cloudinary')
      .input('storageFileId', sql.NVarChar, uploaded.public_id)
      .input('storageResourceType', sql.NVarChar, uploaded.resource_type)
      .input('category', sql.NVarChar, category || null)
      .input('documentDate', sql.Date, documentDate || new Date())
      .input('uploadedBy', sql.NVarChar, req.user.username)
      .query(`
        INSERT INTO PatientDocument (PatientId, FileName, StorageProvider, StorageFileId, StorageResourceType, Category, DocumentDate, UploadedBy)
        OUTPUT INSERTED.DocumentId, INSERTED.PatientId, INSERTED.FileName, INSERTED.Category, INSERTED.DocumentDate, INSERTED.UploadedBy, INSERTED.CreatedAt
        VALUES (@patientId, @fileName, @storageProvider, @storageFileId, @storageResourceType, @category, @documentDate, @uploadedBy)
      `);
    res.status(201).json(inserted.recordset[0]);
  } catch (err) {
    res.status(502).json({ error: `Could not upload file: ${err.message}` });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const pool = await getPool();
    const row = await pool.request().input('id', sql.Int, req.params.id).query('SELECT * FROM PatientDocument WHERE DocumentId = @id');
    if (!row.recordset.length) return res.status(404).json({ error: 'Not found' });
    const doc = row.recordset[0];

    const { role, linkedPatientId } = req.user;
    const allowed = UPLOAD_ROLES.includes(role) || (role === 'Patient' && doc.PatientId === linkedPatientId);
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });

    const extMatch = /\.([^.]+)$/.exec(doc.FileName || '');
    const file = await downloadFile(doc.StorageFileId, doc.StorageResourceType, extMatch?.[1]);
    res.set('Content-Type', file.mimeType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.FileName)}"`);
    res.send(file.buffer);
  } catch (err) {
    res.status(502).json({ error: `Could not download file: ${err.message}` });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!STAFF_ROLES.includes(req.user.role)) return res.status(403).json({ error: 'Not authorized' });
    const pool = await getPool();
    const row = await pool.request().input('id', sql.Int, req.params.id).query('SELECT * FROM PatientDocument WHERE DocumentId = @id');
    if (!row.recordset.length) return res.status(404).json({ error: 'Not found' });

    await deleteFile(row.recordset[0].StorageFileId, row.recordset[0].StorageResourceType).catch(() => {});
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM PatientDocument WHERE DocumentId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
