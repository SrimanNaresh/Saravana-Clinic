import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

const router = Router();

// List vitals, optionally by patient / search / date (YYYY-MM-DD).
router.get('/', async (req, res) => {
  try {
    const { patientId = '', search = '', date = '' } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('patientId', sql.Int, patientId ? Number(patientId) : null)
      .input('search', sql.NVarChar, `%${search}%`)
      .input('date', sql.Date, date || null)
      .query(`
        SELECT v.*, p.Name AS PatientName, p.MobileNo
        FROM VitalSign v
        INNER JOIN Patient p ON p.PatientId = v.PatientId
        WHERE (@patientId IS NULL OR v.PatientId = @patientId)
          AND (@search = '%%' OR p.Name LIKE @search OR p.MobileNo LIKE @search)
          AND (@date IS NULL OR CAST(v.RecordedAt AS DATE) = @date)
        ORDER BY v.RecordedAt DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT * FROM VitalSign WHERE VitalId = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { patientId, height, weight, bloodPressure, pulseRate, temperature, comments } = req.body;
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('patientId', sql.Int, patientId)
      .input('height', sql.Decimal(6, 2), height || null)
      .input('weight', sql.Decimal(6, 2), weight || null)
      .input('bloodPressure', sql.NVarChar, bloodPressure || null)
      .input('pulseRate', sql.Int, pulseRate || null)
      .input('temperature', sql.Decimal(5, 2), temperature || null)
      .input('comments', sql.NVarChar, comments || null)
      .query(`
        INSERT INTO VitalSign (PatientId, Height, Weight, BloodPressure, PulseRate, Temperature, Comments)
        OUTPUT INSERTED.*
        VALUES (@patientId, @height, @weight, @bloodPressure, @pulseRate, @temperature, @comments)
      `);

    // Auto-advance today's confirmation status to 'Pre-Examine' if still at 'Confirm'.
    // Non-fatal: never let this break the vital save.
    try {
      await pool
        .request()
        .input('patientId', sql.Int, patientId)
        .query(`
          UPDATE PatientConfirmation SET Status = 'Pre-Examine'
          WHERE PatientId = @patientId
            AND CAST(ConfirmedAt AS DATE) = CAST(GETDATE() AS DATE)
            AND Status = 'Confirm'
        `);
    } catch { /* ignore status bump errors */ }

    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { height, weight, bloodPressure, pulseRate, temperature, comments } = req.body;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('height', sql.Decimal(6, 2), height || null)
      .input('weight', sql.Decimal(6, 2), weight || null)
      .input('bloodPressure', sql.NVarChar, bloodPressure || null)
      .input('pulseRate', sql.Int, pulseRate || null)
      .input('temperature', sql.Decimal(5, 2), temperature || null)
      .input('comments', sql.NVarChar, comments || null)
      .query(`
        UPDATE VitalSign
        SET Height=@height, Weight=@weight, BloodPressure=@bloodPressure,
            PulseRate=@pulseRate, Temperature=@temperature, Comments=@comments
        OUTPUT INSERTED.*
        WHERE VitalId=@id
      `);
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
