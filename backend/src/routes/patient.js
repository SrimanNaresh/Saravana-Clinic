import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

const router = Router();

// List / search by name or mobile
router.get('/', async (req, res) => {
  try {
    const { search = '', mobile = '' } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('search', sql.NVarChar, `%${search}%`)
      .input('mobile', sql.NVarChar, `%${mobile}%`)
      .query(`
        SELECT PatientId, Name, MobileNo, Address, Age, CreatedAt
        FROM Patient
        WHERE IsActive = 1
          AND (@search = '%%' OR Name LIKE @search)
          AND (@mobile = '%%' OR MobileNo LIKE @mobile)
        ORDER BY PatientId DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Next PatientId that will be assigned on insert (identity seed-aware).
// Defined before '/:id' so it isn't captured as an id param.
router.get('/next-id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT CAST(ISNULL(IDENT_CURRENT('Patient'), 0)
        + CASE WHEN (SELECT COUNT(*) FROM Patient) = 0 THEN 0 ELSE IDENT_INCR('Patient') END AS INT) AS nextId
    `);
    res.json({ nextId: result.recordset[0].nextId || 1 });
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
      .query('SELECT * FROM Patient WHERE PatientId = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, mobileNo, address, age } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('name', sql.NVarChar, name)
      .input('mobileNo', sql.NVarChar, mobileNo || null)
      .input('address', sql.NVarChar, address || null)
      .input('age', sql.Int, age || null)
      .query(`
        INSERT INTO Patient (Name, MobileNo, Address, Age)
        OUTPUT INSERTED.*
        VALUES (@name, @mobileNo, @address, @age)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, mobileNo, address, age } = req.body;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar, name)
      .input('mobileNo', sql.NVarChar, mobileNo || null)
      .input('address', sql.NVarChar, address || null)
      .input('age', sql.Int, age || null)
      .query(`
        UPDATE Patient SET Name=@name, MobileNo=@mobileNo, Address=@address, Age=@age
        OUTPUT INSERTED.*
        WHERE PatientId=@id
      `);
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
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
      .query('UPDATE Patient SET IsActive = 0 WHERE PatientId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk insert / update. Rows with a numeric PatientId are updated, others inserted.
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
    const id = Number(r.patientId ?? r.PatientId);
    if (!name) {
      errors.push({ row: i + 1, error: 'Name is required' });
      continue;
    }
    try {
      if (Number.isInteger(id) && id > 0) {
        const upd = await pool
          .request()
          .input('id', sql.Int, id)
          .input('name', sql.NVarChar, name)
          .input('mobileNo', sql.NVarChar, mobileNo)
          .input('address', sql.NVarChar, address)
          .query(`
            UPDATE Patient SET Name=@name, MobileNo=@mobileNo, Address=@address WHERE PatientId=@id;
            SELECT @@ROWCOUNT AS affected;
          `);
        if (upd.recordset[0].affected > 0) updated++;
        else errors.push({ row: i + 1, error: `PatientId ${id} not found` });
      } else {
        await pool
          .request()
          .input('name', sql.NVarChar, name)
          .input('mobileNo', sql.NVarChar, mobileNo)
          .input('address', sql.NVarChar, address)
          .query('INSERT INTO Patient (Name, MobileNo, Address) VALUES (@name, @mobileNo, @address)');
        inserted++;
      }
    } catch (err) {
      errors.push({ row: i + 1, error: err.message });
    }
  }
  res.json({ inserted, updated, failed: errors.length, errors });
});

export default router;
