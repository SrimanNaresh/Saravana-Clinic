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
        SELECT SupplierId, Name, ContactNo, Address, GSTNo, CreatedAt
        FROM Supplier
        WHERE IsActive = 1
          AND (@search = '%%' OR Name LIKE @search OR ContactNo LIKE @search OR GSTNo LIKE @search)
        ORDER BY SupplierId DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, contactNo, address, gstNo } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Supplier name is required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('name', sql.NVarChar, name.trim())
      .input('contactNo', sql.NVarChar, contactNo?.trim() || null)
      .input('address', sql.NVarChar, address?.trim() || null)
      .input('gstNo', sql.NVarChar, gstNo?.trim() || null)
      .query(`
        INSERT INTO Supplier (Name, ContactNo, Address, GSTNo)
        OUTPUT INSERTED.*
        VALUES (@name, @contactNo, @address, @gstNo)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, contactNo, address, gstNo } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Supplier name is required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar, name.trim())
      .input('contactNo', sql.NVarChar, contactNo?.trim() || null)
      .input('address', sql.NVarChar, address?.trim() || null)
      .input('gstNo', sql.NVarChar, gstNo?.trim() || null)
      .query(`
        UPDATE Supplier
        SET Name = @name, ContactNo = @contactNo, Address = @address, GSTNo = @gstNo
        OUTPUT INSERTED.*
        WHERE SupplierId = @id
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
      .query('UPDATE Supplier SET IsActive = 0 WHERE SupplierId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
