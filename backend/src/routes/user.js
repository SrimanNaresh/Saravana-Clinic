import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';
import { hashPassword } from '../utils/password.js';

const router = Router();

// List users (never expose password hash). Optional ?search=
router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('search', sql.NVarChar, `%${search}%`)
      .query(`
        SELECT u.UserId, u.Username, u.IsActive, u.CreatedAt, u.Role, u.LinkedPatientId, p.Name AS LinkedPatientName
        FROM AppUser u
        LEFT JOIN Patient p ON p.PatientId = u.LinkedPatientId
        WHERE (@search = '%%' OR u.Username LIKE @search)
        ORDER BY u.UserId DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a user
const ROLES = ['Staff', 'Admin', 'Doctor', 'Reception', 'Patient'];

router.post('/', async (req, res) => {
  try {
    const { username, password, isActive = true, role = 'Staff', linkedPatientId } = req.body;
    if (!username || !username.trim()) return res.status(400).json({ error: 'Username is required' });
    if (!password) return res.status(400).json({ error: 'Password is required' });
    const effectiveRole = ROLES.includes(role) ? role : 'Staff';
    if (effectiveRole === 'Patient' && !linkedPatientId) {
      return res.status(400).json({ error: 'A linked patient is required for the Patient role' });
    }
    const pool = await getPool();
    const dupe = await pool
      .request()
      .input('u', sql.NVarChar, username.trim())
      .query('SELECT COUNT(*) AS n FROM AppUser WHERE Username = @u');
    if (dupe.recordset[0].n > 0) return res.status(409).json({ error: 'Username already exists' });

    const result = await pool
      .request()
      .input('u', sql.NVarChar, username.trim())
      .input('p', sql.NVarChar, hashPassword(password))
      .input('active', sql.Bit, isActive ? 1 : 0)
      .input('role', sql.NVarChar, effectiveRole)
      .input('patientId', sql.Int, effectiveRole === 'Patient' ? Number(linkedPatientId) : null)
      .query(`
        INSERT INTO AppUser (Username, PasswordHash, IsActive, Role, LinkedPatientId)
        OUTPUT INSERTED.UserId, INSERTED.Username, INSERTED.IsActive, INSERTED.CreatedAt, INSERTED.Role, INSERTED.LinkedPatientId
        VALUES (@u, @p, @active, @role, @patientId)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a user. Password optional (only changed if provided & non-empty).
router.put('/:id', async (req, res) => {
  try {
    const { username, password, isActive, role = 'Staff', linkedPatientId } = req.body;
    if (!username || !username.trim()) return res.status(400).json({ error: 'Username is required' });
    const effectiveRole = ROLES.includes(role) ? role : 'Staff';
    if (effectiveRole === 'Patient' && !linkedPatientId) {
      return res.status(400).json({ error: 'A linked patient is required for the Patient role' });
    }
    const pool = await getPool();
    const dupe = await pool
      .request()
      .input('u', sql.NVarChar, username.trim())
      .input('id', sql.Int, req.params.id)
      .query('SELECT COUNT(*) AS n FROM AppUser WHERE Username = @u AND UserId <> @id');
    if (dupe.recordset[0].n > 0) return res.status(409).json({ error: 'Username already exists' });

    const reqDb = pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('u', sql.NVarChar, username.trim())
      .input('active', sql.Bit, isActive ? 1 : 0)
      .input('role', sql.NVarChar, effectiveRole)
      .input('patientId', sql.Int, effectiveRole === 'Patient' ? Number(linkedPatientId) : null);

    let query = 'UPDATE AppUser SET Username=@u, IsActive=@active, Role=@role, LinkedPatientId=@patientId';
    if (password && password.trim()) {
      reqDb.input('p', sql.NVarChar, hashPassword(password));
      query += ', PasswordHash=@p';
    }
    query += ' OUTPUT INSERTED.UserId, INSERTED.Username, INSERTED.IsActive, INSERTED.CreatedAt, INSERTED.Role, INSERTED.LinkedPatientId WHERE UserId=@id';

    const result = await reqDb.query(query);
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
      .query('DELETE FROM AppUser WHERE UserId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
