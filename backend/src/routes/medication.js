import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

const router = Router();

// List / search
router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('search', sql.NVarChar, `%${search}%`)
      .query(`
        SELECT MedicationId, MedicineName, GenericName, Category, CreatedAt
        FROM Medication
        WHERE IsActive = 1
          AND (@search = '%%' OR MedicineName LIKE @search OR GenericName LIKE @search OR Category LIKE @search)
        ORDER BY MedicationId DESC
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
      .query('SELECT * FROM Medication WHERE MedicationId = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { medicineName, genericName, category } = req.body;
    if (!medicineName) return res.status(400).json({ error: 'MedicineName is required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('medicineName', sql.NVarChar, medicineName)
      .input('genericName', sql.NVarChar, genericName || null)
      .input('category', sql.NVarChar, category || null)
      .query(`
        INSERT INTO Medication (MedicineName, GenericName, Category)
        OUTPUT INSERTED.*
        VALUES (@medicineName, @genericName, @category)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { medicineName, genericName, category } = req.body;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('medicineName', sql.NVarChar, medicineName)
      .input('genericName', sql.NVarChar, genericName || null)
      .input('category', sql.NVarChar, category || null)
      .query(`
        UPDATE Medication
        SET MedicineName = @medicineName, GenericName = @genericName, Category = @category
        OUTPUT INSERTED.*
        WHERE MedicationId = @id
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
      .query('UPDATE Medication SET IsActive = 0 WHERE MedicationId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk insert / update. Rows with a numeric MedicationId are updated, others inserted.
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
    const medicineName = (r.medicineName ?? r.MedicineName ?? '').toString().trim();
    const genericName = (r.genericName ?? r.GenericName ?? '').toString().trim() || null;
    const category = (r.category ?? r.Category ?? '').toString().trim() || null;
    const id = Number(r.medicationId ?? r.MedicationId);
    if (!medicineName) {
      errors.push({ row: i + 1, error: 'MedicineName is required' });
      continue;
    }
    try {
      if (Number.isInteger(id) && id > 0) {
        const upd = await pool
          .request()
          .input('id', sql.Int, id)
          .input('medicineName', sql.NVarChar, medicineName)
          .input('genericName', sql.NVarChar, genericName)
          .input('category', sql.NVarChar, category)
          .query(`
            UPDATE Medication SET MedicineName=@medicineName, GenericName=@genericName, Category=@category
            WHERE MedicationId=@id;
            SELECT @@ROWCOUNT AS affected;
          `);
        if (upd.recordset[0].affected > 0) updated++;
        else errors.push({ row: i + 1, error: `MedicationId ${id} not found` });
      } else {
        await pool
          .request()
          .input('medicineName', sql.NVarChar, medicineName)
          .input('genericName', sql.NVarChar, genericName)
          .input('category', sql.NVarChar, category)
          .query('INSERT INTO Medication (MedicineName, GenericName, Category) VALUES (@medicineName, @genericName, @category)');
        inserted++;
      }
    } catch (err) {
      errors.push({ row: i + 1, error: err.message });
    }
  }
  res.json({ inserted, updated, failed: errors.length, errors });
});

export default router;
