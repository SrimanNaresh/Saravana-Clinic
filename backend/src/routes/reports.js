import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

const router = Router();

// Patient list report
router.get('/patients', async (req, res) => {
  try {
    const { from, to } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let dateFilter = '';
    if (from && to) {
      request.input('from', sql.Date, from).input('to', sql.Date, to);
      dateFilter = 'AND CAST(p.CreatedAt AS DATE) BETWEEN @from AND @to';
    }
    const result = await request.query(`
      SELECT p.PatientId, p.Name, p.MobileNo, p.Address, p.CreatedAt,
             (SELECT COUNT(*) FROM VitalSign v WHERE v.PatientId = p.PatientId) AS VitalCount,
             (SELECT COUNT(*) FROM Prescription pr WHERE pr.PatientId = p.PatientId) AS PrescriptionCount
      FROM Patient p
      WHERE p.IsActive = 1 ${dateFilter}
      ORDER BY p.Name
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Date-wise visit list report. Each row is one PatientConfirmation ("visit"),
// with the vitals count recorded for that patient on that same visit date.
router.get('/visits', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('from', sql.Date, from)
      .input('to', sql.Date, to)
      .query(`
        SELECT c.ConfirmId, c.PatientId, c.TokenNo, c.ConfirmedAt AS VisitDate,
               p.Name, p.MobileNo, p.Address,
               (SELECT COUNT(*) FROM VitalSign v
                WHERE v.PatientId = c.PatientId
                  AND CAST(v.RecordedAt AS DATE) = CAST(c.ConfirmedAt AS DATE)) AS VitalCount
        FROM PatientConfirmation c
        INNER JOIN Patient p ON p.PatientId = c.PatientId
        WHERE CAST(c.ConfirmedAt AS DATE) BETWEEN @from AND @to
        ORDER BY c.ConfirmedAt ASC, c.TokenNo ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Medical history report for one patient (reuses prescription history structure)
router.get('/medical-history/:patientId', async (req, res) => {
  try {
    const pool = await getPool();
    const pid = Number(req.params.patientId);
    const patient = await pool.request().input('id', sql.Int, pid).query('SELECT * FROM Patient WHERE PatientId=@id');
    const vitals = await pool
      .request()
      .input('id', sql.Int, pid)
      .query('SELECT * FROM VitalSign WHERE PatientId=@id ORDER BY RecordedAt DESC');
    const prescriptions = await pool
      .request()
      .input('id', sql.Int, pid)
      .query('SELECT * FROM Prescription WHERE PatientId=@id ORDER BY CreatedAt DESC');
    const items = await pool
      .request()
      .input('id', sql.Int, pid)
      .query(`
        SELECT pi.* FROM PrescriptionItem pi
        INNER JOIN Prescription pr ON pr.PrescriptionId = pi.PrescriptionId
        WHERE pr.PatientId = @id
      `);
    const byPresc = {};
    for (const it of items.recordset) (byPresc[it.PrescriptionId] ||= []).push(it);
    res.json({
      patient: patient.recordset[0] || null,
      vitals: vitals.recordset,
      prescriptions: prescriptions.recordset.map((p) => ({ ...p, items: byPresc[p.PrescriptionId] || [] })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
