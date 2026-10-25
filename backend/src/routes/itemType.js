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
        SELECT ItemTypeId, Name, CreatedAt
        FROM ItemTypeMaster
        WHERE IsActive = 1 AND (@search = '%%' OR Name LIKE @search)
        ORDER BY Name
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Item type is required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('name', sql.NVarChar, name.trim())
      .query(`
        INSERT INTO ItemTypeMaster (Name)
        OUTPUT INSERTED.*
        VALUES (@name)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Item type is required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar, name.trim())
      .query(`
        UPDATE ItemTypeMaster
        SET Name = @name
        OUTPUT INSERTED.*
        WHERE ItemTypeId = @id
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
      .query('UPDATE ItemTypeMaster SET IsActive = 0 WHERE ItemTypeId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
