import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';
import { rateForCount } from '../utils/billingRate.js';

const router = Router();

// Date-wise patient visit billing report. A "visit" is any PatientConfirmation
// row whose status is one of the workflow stages (i.e. not some future/cancelled
// state) — counted once per distinct patient per day.
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('from', sql.Date, from)
      .input('to', sql.Date, to)
      .query(`
        SELECT CAST(ConfirmedAt AS DATE) AS VisitDate, COUNT(DISTINCT PatientId) AS PatientCount
        FROM PatientConfirmation
        WHERE CAST(ConfirmedAt AS DATE) BETWEEN @from AND @to
          AND Status IN ('Confirm', 'Pre-Examine', 'Examine', 'Billing', 'Completed')
        GROUP BY CAST(ConfirmedAt AS DATE)
        ORDER BY VisitDate ASC
      `);

    const rows = result.recordset.map((r) => {
      const patientCount = r.PatientCount;
      const rate = rateForCount(patientCount);
      return {
        date: r.VisitDate,
        patientCount,
        rate,
        amount: Number((patientCount * rate).toFixed(2)),
      };
    });
    const totalPatients = rows.reduce((sum, r) => sum + r.patientCount, 0);
    const totalAmount = Number(rows.reduce((sum, r) => sum + r.amount, 0).toFixed(2));

    res.json({ from, to, rows, totalPatients, totalAmount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Per-patient bill for a single date — one row per patient who visited, with
// whatever Doctor Fees / Extra Fees are already saved against them for that
// date (0 if never entered). No visit-count rate here — the bill is just
// Doctor Fees + Extra Fees, entered per patient.
router.get('/patients', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date is required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('date', sql.Date, date)
      .query(`
        WITH ranked AS (
          SELECT c.PatientId, c.TokenNo, c.Status, c.ConfirmedAt,
                 p.Name, p.MobileNo, p.Age,
                 ROW_NUMBER() OVER (PARTITION BY c.PatientId ORDER BY c.ConfirmedAt DESC) AS rn
          FROM PatientConfirmation c
          INNER JOIN Patient p ON p.PatientId = c.PatientId
          WHERE CAST(c.ConfirmedAt AS DATE) = @date
            AND c.Status IN ('Confirm', 'Pre-Examine', 'Examine', 'Billing', 'Completed')
        )
        SELECT r.PatientId, r.TokenNo, r.Status, r.ConfirmedAt, r.Name, r.MobileNo, r.Age,
               b.BillId, b.DoctorFees, b.ExtraFees, b.Notes AS BillNotes
        FROM ranked r
        LEFT JOIN PatientBill b ON b.PatientId = r.PatientId AND b.BillDate = @date
        WHERE r.rn = 1
        ORDER BY r.TokenNo ASC, r.ConfirmedAt ASC
      `);

    const rows = result.recordset.map((r) => {
      const doctorFees = Number(r.DoctorFees ?? 0);
      const extraFees = Number(r.ExtraFees ?? 0);
      return {
        billId: r.BillId ?? null,
        patientId: r.PatientId,
        tokenNo: r.TokenNo,
        status: r.Status,
        confirmedAt: r.ConfirmedAt,
        name: r.Name,
        mobileNo: r.MobileNo,
        age: r.Age,
        doctorFees,
        extraFees,
        notes: r.BillNotes || '',
        totalAmount: Number((doctorFees + extraFees).toFixed(2)),
      };
    });

    const totalDoctorFees = Number(rows.reduce((sum, r) => sum + r.doctorFees, 0).toFixed(2));
    const totalExtraFees = Number(rows.reduce((sum, r) => sum + r.extraFees, 0).toFixed(2));
    const totalAmount = Number(rows.reduce((sum, r) => sum + r.totalAmount, 0).toFixed(2));

    res.json({ date, patientCount: rows.length, totalDoctorFees, totalExtraFees, totalAmount, rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save (upsert) Doctor Fees / Extra Fees for one patient on one date.
router.put('/patients/:patientId', async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    const { date, doctorFees, extraFees, notes } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('patientId', sql.Int, patientId)
      .input('date', sql.Date, date)
      .input('doctorFees', sql.Decimal(10, 2), doctorFees || 0)
      .input('extraFees', sql.Decimal(10, 2), extraFees || 0)
      .input('notes', sql.NVarChar, notes || null)
      .query(`
        MERGE PatientBill AS target
        USING (SELECT @patientId AS PatientId, @date AS BillDate) AS src
          ON target.PatientId = src.PatientId AND target.BillDate = src.BillDate
        WHEN MATCHED THEN UPDATE SET DoctorFees = @doctorFees, ExtraFees = @extraFees, Notes = @notes, UpdatedAt = GETDATE()
        WHEN NOT MATCHED THEN INSERT (PatientId, BillDate, DoctorFees, ExtraFees, Notes)
          VALUES (@patientId, @date, @doctorFees, @extraFees, @notes)
        OUTPUT INSERTED.*;
      `);

    // Saving the bill is the final step of today's visit — advance the patient
    // past Billing into Completed. Only moves from 'Billing' so it never
    // jumps an earlier stage (e.g. Examine) straight to Completed.
    await pool
      .request()
      .input('patientId', sql.Int, patientId)
      .input('date', sql.Date, date)
      .query(`
        UPDATE PatientConfirmation SET Status = 'Completed'
        WHERE PatientId = @patientId
          AND CAST(ConfirmedAt AS DATE) = @date
          AND Status = 'Billing'
      `);

    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
