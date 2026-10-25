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