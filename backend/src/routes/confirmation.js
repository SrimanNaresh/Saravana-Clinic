import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

const router = Router();

// Workflow statuses (advanced automatically by actions, not manually):
// Confirm & Search -> Confirm, Vital -> Pre-Examine, Doctor open -> Examine,
// Doctor save -> Billing, Billing save -> Completed
export const STATUS_FLOW = ['Confirm', 'Pre-Examine', 'Examine', 'Billing', 'Completed'];

// List confirmations for a given date (default: today). date = YYYY-MM-DD
// Optional ?status=Pre Examine to filter by workflow status.
router.get('/', async (req, res) => {
  try {
    const { date, status } = req.query;
    const day = date || new Date().toISOString().slice(0, 10);
    const pool = await getPool();
    const result = await pool
      .request()
      .input('day', sql.Date, day)
      .input('status', sql.NVarChar, status || null)
      .query(`
        SELECT c.ConfirmId, c.PatientId, c.TokenNo, c.Status, c.ConfirmedAt, c.Notes,
               p.Name AS PatientName, p.MobileNo, p.Address
        FROM PatientConfirmation c
        INNER JOIN Patient p ON p.PatientId = c.PatientId
        WHERE CAST(c.ConfirmedAt AS DATE) = @day
          AND (@status IS NULL OR c.Status = @status)
        ORDER BY c.TokenNo ASC, c.ConfirmedAt ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Confirm a patient: status = 'Confirmed'.
// Token rule: patients with the SAME NAME share one token number for the day.
// A new name gets the next token; an existing name (today) reuses its token.
router.post('/', async (req, res) => {
  try {
    const { patientId, notes } = req.body;
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });
    const pool = await getPool();

    // A patient already mid-visit today (anything short of Completed) shouldn't
    // get a second queue entry — only once today's visit is fully Completed
    // (or they haven't been confirmed today at all) can they be confirmed again.
    const existing = await pool
      .request()
      .input('patientId', sql.Int, patientId)
      .query(`
        SELECT TOP 1 c.Status, p.Name
        FROM PatientConfirmation c
        INNER JOIN Patient p ON p.PatientId = c.PatientId
        WHERE c.PatientId = @patientId
          AND CAST(c.ConfirmedAt AS DATE) = CAST(GETDATE() AS DATE)
        ORDER BY c.ConfirmId DESC
      `);
    const latest = existing.recordset[0];
    if (latest && latest.Status !== 'Completed') {
      return res.status(409).json({ error: `${latest.Name} is already in today's queue (${latest.Status})` });
    }

    const result = await pool
      .request()
      .input('patientId', sql.Int, patientId)
      .input('notes', sql.NVarChar, notes || null)
      .query(`
        DECLARE @name NVARCHAR(200) = (SELECT Name FROM Patient WHERE PatientId = @patientId);

        -- Reuse today's token for the same patient name, if one exists.
        DECLARE @token INT =
          (SELECT TOP 1 c.TokenNo
           FROM PatientConfirmation c
           INNER JOIN Patient p ON p.PatientId = c.PatientId
           WHERE CAST(c.ConfirmedAt AS DATE) = CAST(GETDATE() AS DATE)
             AND p.Name = @name
           ORDER BY c.TokenNo ASC);

        -- Otherwise assign the next token for the day.
        IF @token IS NULL
          SET @token = (SELECT ISNULL(MAX(TokenNo), 0) + 1 FROM PatientConfirmation
                        WHERE CAST(ConfirmedAt AS DATE) = CAST(GETDATE() AS DATE));

        INSERT INTO PatientConfirmation (PatientId, TokenNo, Status, Notes)
        OUTPUT INSERTED.*
        VALUES (@patientId, @token, 'Confirm', @notes);
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark today's confirmation as 'Examine' (doctor opened the patient).
// Only advances from 'Pre-Examine' so it never moves a Billing one back.
router.post('/examine', async (req, res) => {
  try {
    const { patientId } = req.body;
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });
    const pool = await getPool();
    await pool
      .request()
      .input('patientId', sql.Int, patientId)
      .query(`
        UPDATE PatientConfirmation SET Status = 'Examine'
        WHERE PatientId = @patientId
          AND CAST(ConfirmedAt AS DATE) = CAST(GETDATE() AS DATE)
          AND Status = 'Pre-Examine'
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM PatientConfirmation WHERE ConfirmId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
