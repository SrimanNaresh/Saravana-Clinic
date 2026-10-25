import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

const router = Router();

// Preview the next auto-generated Test Id, shown read-only on the Add form
// (same pattern as Patient ID).
router.get('/next-id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT CAST(ISNULL(IDENT_CURRENT('LabTest'), 0)
        + CASE WHEN (SELECT COUNT(*) FROM LabTest) = 0 THEN 0 ELSE IDENT_INCR('LabTest') END AS INT) AS nextId
    `);
    res.json({ nextId: result.recordset[0].nextId || 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List / search — includes both Active and Inactive (soft-deleted) tests so
// staff can see and reactivate ones they didn't mean to deactivate.
router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('search', sql.NVarChar, `%${search}%`)
      .query(`
        SELECT TestId, TestName, IsActive, CreatedAt
        FROM LabTest
        WHERE (@search = '%%' OR TestName LIKE @search)
        ORDER BY TestId DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { testName, isActive = true } = req.body;
    if (!testName) return res.status(400).json({ error: 'TestName is required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('testName', sql.NVarChar, testName)
      .input('isActive', sql.Bit, isActive)
      .query(`
        INSERT INTO LabTest (TestName, IsActive)
        OUTPUT INSERTED.*
        VALUES (@testName, @isActive)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { testName, isActive } = req.body;
    if (!testName) return res.status(400).json({ error: 'TestName is required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('testName', sql.NVarChar, testName)
      .input('isActive', sql.Bit, isActive)
      .query(`
        UPDATE LabTest
        SET TestName = @testName, IsActive = @isActive
        OUTPUT INSERTED.*
        WHERE TestId = @id
      `);
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Soft delete — marks Inactive rather than removing the row.
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE LabTest SET IsActive = 0 WHERE TestId = @id');
    if (!result.rowsAffected[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
