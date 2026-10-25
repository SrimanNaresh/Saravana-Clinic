import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('search', sql.NVarChar, `%${search}%`)
      .query(`
        SELECT PharmacyId, Name, Address, ContactNo, CreatedAt
        FROM Pharmacy
        WHERE (@search = '%%' OR Name LIKE @search OR Address LIKE @search OR ContactNo LIKE @search)
        ORDER BY PharmacyId DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, address, contactNo } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Pharmacy name is required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('name', sql.NVarChar, name.trim())
      .input('address', sql.NVarChar, address?.trim() || null)
      .input('contactNo', sql.NVarChar, contactNo?.trim() || null)
      .query(`
        INSERT INTO Pharmacy (Name, Address, ContactNo)
        OUTPUT INSERTED.*
        VALUES (@name, @address, @contactNo)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, address, contactNo } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Pharmacy name is required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar, name.trim())
      .input('address', sql.NVarChar, address?.trim() || null)
      .input('contactNo', sql.NVarChar, contactNo?.trim() || null)
      .query(`
        UPDATE Pharmacy
        SET Name = @name, Address = @address, ContactNo = @contactNo
        OUTPUT INSERTED.*
        WHERE PharmacyId = @id
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
      .query('DELETE FROM Pharmacy WHERE PharmacyId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
