import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

const router = Router();

// List / search (with shifts)
router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const pool = await getPool();
    const emps = await pool
      .request()
      .input('search', sql.NVarChar, `%${search}%`)
      .query(`
        SELECT EmployeeId, Name, MobileNo, Address, EmpType, DoctorFee, CreatedAt
        FROM Employee
        WHERE IsActive = 1
          AND (@search = '%%' OR Name LIKE @search OR MobileNo LIKE @search OR EmpType LIKE @search)
        ORDER BY EmployeeId DESC
      `);
    const shifts = await pool.request().query('SELECT * FROM EmployeeShift');
    const byEmp = {};
    for (const s of shifts.recordset) {
      (byEmp[s.EmployeeId] ||= []).push({ shiftId: s.ShiftId, dayOfWeek: s.DayOfWeek, fromTime: s.FromTime, toTime: s.ToTime });
    }
    res.json(emps.recordset.map((e) => ({ ...e, shifts: byEmp[e.EmployeeId] || [] })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const emp = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT * FROM Employee WHERE EmployeeId = @id');
    if (!emp.recordset.length) return res.status(404).json({ error: 'Not found' });
    const shifts = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT ShiftId, DayOfWeek AS dayOfWeek, FromTime AS fromTime, ToTime AS toTime FROM EmployeeShift WHERE EmployeeId = @id');
    res.json({ ...emp.recordset[0], shifts: shifts.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    const { name, mobileNo, address, empType, doctorFee, shifts = [] } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    await tx.begin();
    const inserted = await new sql.Request(tx)
      .input('name', sql.NVarChar, name)
      .input('mobileNo', sql.NVarChar, mobileNo || null)
      .input('address', sql.NVarChar, address || null)
      .input('empType', sql.NVarChar, empType || null)
      .input('doctorFee', sql.Decimal(10, 2), empType === 'Doctor' ? (doctorFee || 0) : null)
      .query(`
        INSERT INTO Employee (Name, MobileNo, Address, EmpType, DoctorFee)
        OUTPUT INSERTED.EmployeeId
        VALUES (@name, @mobileNo, @address, @empType, @doctorFee)
      `);
    const employeeId = inserted.recordset[0].EmployeeId;
    for (const s of shifts) {
      await new sql.Request(tx)
        .input('employeeId', sql.Int, employeeId)
        .input('dayOfWeek', sql.NVarChar, s.dayOfWeek || null)
        .input('fromTime', sql.NVarChar, s.fromTime || null)
        .input('toTime', sql.NVarChar, s.toTime || null)
        .query('INSERT INTO EmployeeShift (EmployeeId, DayOfWeek, FromTime, ToTime) VALUES (@employeeId, @dayOfWeek, @fromTime, @toTime)');
    }
    await tx.commit();
    res.status(201).json({ employeeId });
  } catch (err) {
    await tx.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    const { name, mobileNo, address, empType, doctorFee, shifts = [] } = req.body;
    const id = Number(req.params.id);
    await tx.begin();
    await new sql.Request(tx)
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, name)
      .input('mobileNo', sql.NVarChar, mobileNo || null)
      .input('address', sql.NVarChar, address || null)
      .input('empType', sql.NVarChar, empType || null)
      .input('doctorFee', sql.Decimal(10, 2), empType === 'Doctor' ? (doctorFee || 0) : null)
      .query(`
        UPDATE Employee SET Name=@name, MobileNo=@mobileNo, Address=@address, EmpType=@empType, DoctorFee=@doctorFee
        WHERE EmployeeId=@id
      `);
    await new sql.Request(tx).input('id', sql.Int, id).query('DELETE FROM EmployeeShift WHERE EmployeeId=@id');
    for (const s of shifts) {
      await new sql.Request(tx)
        .input('employeeId', sql.Int, id)
        .input('dayOfWeek', sql.NVarChar, s.dayOfWeek || null)
        .input('fromTime', sql.NVarChar, s.fromTime || null)
        .input('toTime', sql.NVarChar, s.toTime || null)
        .query('INSERT INTO EmployeeShift (EmployeeId, DayOfWeek, FromTime, ToTime) VALUES (@employeeId, @dayOfWeek, @fromTime, @toTime)');
    }
    await tx.commit();
    res.json({ success: true });
  } catch (err) {
    await tx.rollback().catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE Employee SET IsActive = 0 WHERE EmployeeId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Parse day-based shifts. Each shift is "Day|from-to", multiple separated by ';'.
// Example: "Monday|09:00 AM-01:00 PM;Tuesday|05:00 PM-08:00 PM".
// Backwards compatible: a chunk without "Day|" is treated as a shift with no day.
function parseShifts(raw) {
  if (!raw) return [];
  return String(raw)
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      let dayOfWeek = null;
      let times = chunk;
      const pipe = chunk.indexOf('|');
      if (pipe !== -1) {
        dayOfWeek = chunk.slice(0, pipe).trim() || null;
        times = chunk.slice(pipe + 1).trim();
      }
      const [fromTime, toTime] = times.split('-').map((t) => (t || '').trim());
      return { dayOfWeek, fromTime: fromTime || null, toTime: toTime || null };
    })
    .filter((s) => s.fromTime || s.toTime || s.dayOfWeek);
}

// Bulk insert / update employees (with shifts). Rows with numeric EmployeeId are updated.
router.post('/bulk', async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required' });
  }
  const pool = await getPool();
  let inserted = 0;
  let updated = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = (r.name ?? r.Name ?? '').toString().trim();
    const mobileNo = (r.mobileNo ?? r.MobileNo ?? '').toString().trim() || null;
    const address = (r.address ?? r.Address ?? '').toString().trim() || null;
    const empType = (r.empType ?? r.EmpType ?? r.Type ?? '').toString().trim() || null;
    const doctorFeeRaw = r.doctorFee ?? r.DoctorFee;
    const doctorFee = empType === 'Doctor' ? (Number(doctorFeeRaw) || 0) : null;
    const shifts = parseShifts(r.shifts ?? r.Shifts);
    const id = Number(r.employeeId ?? r.EmployeeId);
    if (!name) {
      errors.push({ row: i + 1, error: 'Name is required' });
      continue;
    }

    const tx = new sql.Transaction(pool);
    try {
      await tx.begin();
      let employeeId = id;
      if (Number.isInteger(id) && id > 0) {
        const upd = await new sql.Request(tx)
          .input('id', sql.Int, id)
          .input('name', sql.NVarChar, name)
          .input('mobileNo', sql.NVarChar, mobileNo)
          .input('address', sql.NVarChar, address)
          .input('empType', sql.NVarChar, empType)
          .input('doctorFee', sql.Decimal(10, 2), doctorFee)
          .query(`
            UPDATE Employee SET Name=@name, MobileNo=@mobileNo, Address=@address, EmpType=@empType, DoctorFee=@doctorFee WHERE EmployeeId=@id;
            SELECT @@ROWCOUNT AS affected;
          `);
        if (upd.recordset[0].affected === 0) {
          await tx.rollback();
          errors.push({ row: i + 1, error: `EmployeeId ${id} not found` });
          continue;
        }
        await new sql.Request(tx).input('id', sql.Int, id).query('DELETE FROM EmployeeShift WHERE EmployeeId=@id');
        updated++;
      } else {
        const ins = await new sql.Request(tx)
          .input('name', sql.NVarChar, name)
          .input('mobileNo', sql.NVarChar, mobileNo)
          .input('address', sql.NVarChar, address)
          .input('empType', sql.NVarChar, empType)
          .input('doctorFee', sql.Decimal(10, 2), doctorFee)
          .query(`
            INSERT INTO Employee (Name, MobileNo, Address, EmpType, DoctorFee)
            OUTPUT INSERTED.EmployeeId VALUES (@name, @mobileNo, @address, @empType, @doctorFee)
          `);
        employeeId = ins.recordset[0].EmployeeId;
        inserted++;
      }
      for (const s of shifts) {
        await new sql.Request(tx)
          .input('employeeId', sql.Int, employeeId)
          .input('dayOfWeek', sql.NVarChar, s.dayOfWeek || null)
          .input('fromTime', sql.NVarChar, s.fromTime)
          .input('toTime', sql.NVarChar, s.toTime)
          .query('INSERT INTO EmployeeShift (EmployeeId, DayOfWeek, FromTime, ToTime) VALUES (@employeeId, @dayOfWeek, @fromTime, @toTime)');
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      errors.push({ row: i + 1, error: err.message });
    }
  }
  res.json({ inserted, updated, failed: errors.length, errors });
});

export default router;
