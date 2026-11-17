import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT TOP 1 * FROM ClinicDetails WHERE ClinicId = 1');
    res.json(result.recordset[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { name, address, doctorName, logo, email, contactNo, pageHeight, pageWidth, appName } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Clinic name is required' });
    const pool = await getPool();
    const result = await pool.request()
      .input('name', sql.NVarChar, name.trim())
      .input('address', sql.NVarChar, address?.trim() || null)
      .input('doctorName', sql.NVarChar, doctorName?.trim() || null)
      .input('logo', sql.NVarChar(sql.MAX), logo || null)
      .input('email', sql.NVarChar, email?.trim() || null)
      .input('contactNo', sql.NVarChar, contactNo?.trim() || null)
      .input('pageHeight', sql.Decimal(6, 2), pageHeight || null)
      .input('pageWidth', sql.Decimal(6, 2), pageWidth || null)
      .input('appName', sql.NVarChar, appName?.trim() || null)
      .query(`
        MERGE ClinicDetails AS target
        USING (SELECT 1 AS ClinicId) AS source ON target.ClinicId = source.ClinicId
        WHEN MATCHED THEN UPDATE SET Name=@name, Address=@address,
          DoctorName=@doctorName, Logo=@logo, Email=@email, ContactNo=@contactNo,
          PageHeight=@pageHeight, PageWidth=@pageWidth, AppName=@appName, UpdatedAt=GETDATE()
        WHEN NOT MATCHED THEN INSERT (ClinicId, Name, Address, DoctorName, Logo, Email, ContactNo, PageHeight, PageWidth, AppName)
          VALUES (1, @name, @address, @doctorName, @logo, @email, @contactNo, @pageHeight, @pageWidth, @appName)
        OUTPUT INSERTED.*;
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pharmacy GST invoice details: GSTIN, Drug Licence No and State. Its own
// partial update (like the letter pad) so it never touches the other fields.
const GSTIN = /^[0-9]{2}[A-Z0-9]{13}$/;
router.put('/gst', async (req, res) => {
  try {
    const gstin = String(req.body?.gstin ?? '').trim().toUpperCase();
    const dl = String(req.body?.drugLicenceNo ?? '').trim();
    const state = String(req.body?.stateName ?? '').trim();
    if (gstin && !GSTIN.test(gstin)) return res.status(400).json({ error: 'GSTIN must be 15 characters: 2 digits, then letters / digits' });
    if (dl.length > 100) return res.status(400).json({ error: 'Drug Licence No must be at most 100 characters' });
    if (state.length > 60) return res.status(400).json({ error: 'State must be at most 60 characters' });
    const pool = await getPool();
    const r = await pool.request()
      .input('gstin', sql.NVarChar(15), gstin || null)
      .input('dl', sql.NVarChar(100), dl || null)
      .input('state', sql.NVarChar(60), state || null)
      .query(`UPDATE ClinicDetails SET GSTIN = @gstin, DrugLicenceNo = @dl, StateName = @state, UpdatedAt = GETDATE()
              OUTPUT INSERTED.GSTIN, INSERTED.DrugLicenceNo, INSERTED.StateName WHERE ClinicId = 1`);
    if (!r.recordset.length) return res.status(400).json({ error: 'Save the Clinic Master first' });
    res.json(r.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Letter-pad template: the uploaded letterhead image + its print size + the
// saved drag-and-drop parameter positions. A dedicated partial-update route
// (unlike PUT /) so saving the template never requires resending the whole
// clinic form, and never risks blanking out Name or other clinic fields.
router.put('/letter-pad', async (req, res) => {
  try {
    const { prescriptionAttachment, attachmentHeight, attachmentWidth, letterPadFields } = req.body;
    const pool = await getPool();
    const result = await pool.request()
      .input('attachment', sql.NVarChar(sql.MAX), prescriptionAttachment ?? null)
      .input('height', sql.Decimal(6, 2), attachmentHeight || null)
      .input('width', sql.Decimal(6, 2), attachmentWidth || null)
      .input('fields', sql.NVarChar(sql.MAX), letterPadFields ? JSON.stringify(letterPadFields) : null)
      .query(`
        MERGE ClinicDetails AS target
        USING (SELECT 1 AS ClinicId) AS source ON target.ClinicId = source.ClinicId
        WHEN MATCHED THEN UPDATE SET
          PrescriptionAttachment=@attachment, AttachmentHeight=@height,
          AttachmentWidth=@width, LetterPadFields=@fields, UpdatedAt=GETDATE()
        WHEN NOT MATCHED THEN INSERT (ClinicId, Name, PrescriptionAttachment, AttachmentHeight, AttachmentWidth, LetterPadFields)
          VALUES (1, '', @attachment, @height, @width, @fields)
        OUTPUT INSERTED.*;
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().query('DELETE FROM ClinicDetails WHERE ClinicId = 1');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;