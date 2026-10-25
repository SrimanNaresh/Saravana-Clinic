import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

const router = Router();

// Body field -> [column, max length]; every field but vendorName is optional.
const FIELDS = {
  vendorName: ['VendorName', 200],
  companyName: ['CompanyName', 200],
  contactPerson: ['ContactPerson', 150],
  contactNo: ['ContactNo', 20],
  alternateNo: ['AlternateNo', 20],
  address: ['Address', 500],
  gstNo: ['GSTNo', 30],
  dlNo: ['DLNo', 50],
  email: ['Email', 150],
};

function bindFields(request, body) {
  for (const [key, [, len]] of Object.entries(FIELDS)) {
    request.input(key, sql.NVarChar(len), body[key]?.trim() || null);
  }
  return request;
}

router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('search', sql.NVarChar, `%${search}%`)
      .query(`
        SELECT VendorId, VendorName, CompanyName, ContactPerson, ContactNo, AlternateNo,
               Address, GSTNo, DLNo, Email, CreatedAt
        FROM Vendor
        WHERE IsActive = 1
          AND (@search = '%%' OR VendorName LIKE @search OR CompanyName LIKE @search
               OR ContactPerson LIKE @search OR ContactNo LIKE @search OR GSTNo LIKE @search)
        ORDER BY VendorId DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!req.body.vendorName?.trim()) return res.status(400).json({ error: 'Vendor name is required' });
    const pool = await getPool();
    const cols = Object.values(FIELDS).map(([c]) => c).join(', ');
    const params = Object.keys(FIELDS).map((k) => `@${k}`).join(', ');
    const result = await bindFields(pool.request(), req.body).query(`
      INSERT INTO Vendor (${cols})
      OUTPUT INSERTED.*
      VALUES (${params})
    `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!req.body.vendorName?.trim()) return res.status(400).json({ error: 'Vendor name is required' });
    const pool = await getPool();
    const sets = Object.entries(FIELDS).map(([k, [c]]) => `${c} = @${k}`).join(', ');
    const result = await bindFields(pool.request(), req.body)
      .input('id', sql.Int, req.params.id)
      .query(`
        UPDATE Vendor
        SET ${sets}
        OUTPUT INSERTED.*
        WHERE VendorId = @id AND IsActive = 1
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
      .query('UPDATE Vendor SET IsActive = 0 WHERE VendorId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
