import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

const router = Router();

// List prescriptions (optionally by patient)
router.get('/', async (req, res) => {
  try {
    const { patientId = '' } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('patientId', sql.Int, patientId ? Number(patientId) : null)
      .query(`
        SELECT pr.*, p.Name AS PatientName, p.MobileNo
        FROM Prescription pr
        INNER JOIN Patient p ON p.PatientId = pr.PatientId
        WHERE (@patientId IS NULL OR pr.PatientId = @patientId)
        ORDER BY pr.CreatedAt DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Follow-up patients: one row per patient, taken from their most recent
// prescription that has a NextVisitDate set (an older, already-superseded
// follow-up date is ignored once a newer prescription is written).
// Optional ?date=YYYY-MM-DD filters to a single next-visit date;
// ?search= matches patient name or mobile.
router.get('/follow-up', async (req, res) => {
  try {
    const { date, search } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('date', sql.Date, date || null)
      .input('search', sql.NVarChar, search ? `%${search}%` : null)
      .query(`
        WITH ranked AS (
          SELECT pr.PrescriptionId, pr.PatientId, pr.CreatedAt AS LastVisitDate, pr.NextVisitDate,
                 p.Name, p.MobileNo,
                 ROW_NUMBER() OVER (PARTITION BY pr.PatientId ORDER BY pr.CreatedAt DESC) AS rn
          FROM Prescription pr
          INNER JOIN Patient p ON p.PatientId = pr.PatientId
          WHERE pr.NextVisitDate IS NOT NULL
        )
        SELECT PrescriptionId, PatientId, Name, MobileNo, LastVisitDate, NextVisitDate
        FROM ranked
        WHERE rn = 1
          AND (@date IS NULL OR NextVisitDate = @date)
          AND (@search IS NULL OR Name LIKE @search OR MobileNo LIKE @search)
        ORDER BY NextVisitDate ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update just the NextVisitDate on a prescription — used by the Follow Up
// Patients report's inline edit, which doesn't have the prescription's
// notes/items loaded and shouldn't need them to reschedule a follow-up.
router.put('/:id/next-visit-date', async (req, res) => {
  try {
    const { nextVisitDate } = req.body;
    const id = Number(req.params.id);
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .input('nextVisitDate', sql.Date, nextVisitDate || null)
      .query('UPDATE Prescription SET NextVisitDate=@nextVisitDate WHERE PrescriptionId=@id');
    if (!result.rowsAffected[0]) return res.status(404).json({ error: 'Prescription not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full patient history: prescriptions + items + vitals
router.get('/history/:patientId', async (req, res) => {
  try {
    const pool = await getPool();
    const pid = Number(req.params.patientId);
    const patient = await pool.request().input('id', sql.Int, pid).query('SELECT * FROM Patient WHERE PatientId=@id');
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
    const labTests = await pool
      .request()
      .input('id', sql.Int, pid)
      .query(`
        SELECT plt.* FROM PrescriptionLabTest plt
        INNER JOIN Prescription pr ON pr.PrescriptionId = plt.PrescriptionId
        WHERE pr.PatientId = @id
      `);
    const vitals = await pool
      .request()
      .input('id', sql.Int, pid)
      .query('SELECT * FROM VitalSign WHERE PatientId=@id ORDER BY RecordedAt DESC');
    const byPresc = {};
    for (const it of items.recordset) (byPresc[it.PrescriptionId] ||= []).push(it);
    const byPrescLabTests = {};
    for (const lt of labTests.recordset) (byPrescLabTests[lt.PrescriptionId] ||= []).push(lt);
    res.json({
      patient: patient.recordset[0] || null,
      prescriptions: prescriptions.recordset.map((p) => ({
        ...p,
        items: byPresc[p.PrescriptionId] || [],
        labTests: byPrescLabTests[p.PrescriptionId] || [],
      })),
      vitals: vitals.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    const { notes, diagnosis, items = [], complete = false, nextVisitDate, labTestIds = [] } = req.body;
    const id = Number(req.params.id);
    await tx.begin();
    const updated = await new sql.Request(tx)
      .input('id', sql.Int, id)
      .input('notes', sql.NVarChar, notes || null)
      .input('diagnosis', sql.NVarChar, diagnosis || null)
      .input('nextVisitDate', sql.Date, nextVisitDate || null)
      .query('UPDATE Prescription SET Notes=@notes, Diagnosis=@diagnosis, NextVisitDate=@nextVisitDate WHERE PrescriptionId=@id');
    if (!updated.rowsAffected[0]) {
      await tx.rollback();
      return res.status(404).json({ error: 'Prescription not found' });
    }
    await new sql.Request(tx).input('id', sql.Int, id).query('DELETE FROM PrescriptionItem WHERE PrescriptionId=@id');
    for (const it of items) {
      await new sql.Request(tx)
        .input('prescriptionId', sql.Int, id)
        .input('medicationId', sql.Int, it.medicationId || null)
        .input('medicineName', sql.NVarChar, it.medicineName || null)
        .input('dosage', sql.NVarChar, it.dosage || null)
        .input('frequency', sql.NVarChar, it.frequency || null)
        .input('duration', sql.NVarChar, it.duration || null)
        .input('instructions', sql.NVarChar, it.instructions || null)
        .query('INSERT INTO PrescriptionItem (PrescriptionId, MedicationId, MedicineName, Dosage, Frequency, Duration, Instructions) VALUES (@prescriptionId, @medicationId, @medicineName, @dosage, @frequency, @duration, @instructions)');
    }
    await new sql.Request(tx).input('id', sql.Int, id).query('DELETE FROM PrescriptionLabTest WHERE PrescriptionId=@id');
    for (const testId of labTestIds) {
      await new sql.Request(tx)
        .input('prescriptionId', sql.Int, id)
        .input('testId', sql.Int, testId)
        .query(`
          INSERT INTO PrescriptionLabTest (PrescriptionId, TestId, TestName)
          SELECT @prescriptionId, TestId, TestName FROM LabTest WHERE TestId = @testId
        `);
    }
    await tx.commit();
    if (complete) {
      await pool.request().input('id', sql.Int, id).query(`
        UPDATE PatientConfirmation SET Status='Billing'
        WHERE PatientId=(SELECT PatientId FROM Prescription WHERE PrescriptionId=@id)
          AND CAST(ConfirmedAt AS DATE)=CAST(GETDATE() AS DATE)
          AND Status IN ('Pre-Examine', 'Examine', 'Confirm')
      `);
    }
    res.json({ success: true });
  } catch (err) {
    await tx.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM Prescription WHERE PrescriptionId=@id');
    if (!result.rowsAffected[0]) return res.status(404).json({ error: 'Prescription not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    const { patientId, doctorId, diagnosis, notes, items = [], complete = false, nextVisitDate, labTestIds = [] } = req.body;
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });
    await tx.begin();
    const inserted = await new sql.Request(tx)
      .input('patientId', sql.Int, patientId)
      .input('doctorId', sql.Int, doctorId || null)
      .input('diagnosis', sql.NVarChar, diagnosis || null)
      .input('notes', sql.NVarChar, notes || null)
      .input('nextVisitDate', sql.Date, nextVisitDate || null)
      .query(`
        INSERT INTO Prescription (PatientId, DoctorId, Diagnosis, Notes, NextVisitDate)
        OUTPUT INSERTED.PrescriptionId
        VALUES (@patientId, @doctorId, @diagnosis, @notes, @nextVisitDate)
      `);
    const prescriptionId = inserted.recordset[0].PrescriptionId;
    for (const it of items) {
      await new sql.Request(tx)
        .input('prescriptionId', sql.Int, prescriptionId)
        .input('medicationId', sql.Int, it.medicationId || null)
        .input('medicineName', sql.NVarChar, it.medicineName || null)
        .input('dosage', sql.NVarChar, it.dosage || null)
        .input('frequency', sql.NVarChar, it.frequency || null)
        .input('duration', sql.NVarChar, it.duration || null)
        .input('instructions', sql.NVarChar, it.instructions || null)
        .query(`
          INSERT INTO PrescriptionItem (PrescriptionId, MedicationId, MedicineName, Dosage, Frequency, Duration, Instructions)
          VALUES (@prescriptionId, @medicationId, @medicineName, @dosage, @frequency, @duration, @instructions)
        `);
    }
    for (const testId of labTestIds) {
      await new sql.Request(tx)
        .input('prescriptionId', sql.Int, prescriptionId)
        .input('testId', sql.Int, testId)
        .query(`
          INSERT INTO PrescriptionLabTest (PrescriptionId, TestId, TestName)
          SELECT @prescriptionId, TestId, TestName FROM LabTest WHERE TestId = @testId
        `);
    }
    await tx.commit();

    if (complete) {
      // Completing the prescription advances the patient's confirmation status.
      // Non-fatal: never let this break the prescription save.
      try {
        await pool
          .request()
          .input('patientId', sql.Int, patientId)
          .query(`
            UPDATE PatientConfirmation SET Status = 'Billing'
            WHERE PatientId = @patientId
              AND CAST(ConfirmedAt AS DATE) = CAST(GETDATE() AS DATE)
              AND Status IN ('Pre-Examine', 'Examine', 'Confirm')
          `);
      } catch { /* ignore status bump errors */ }
    }

    res.status(201).json({ prescriptionId });
  } catch (err) {
    await tx.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

export default router;
