import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

const router = Router();

const SELECT = `
  SELECT pm.PurchaseMasterId, pm.ItemId, i.Name AS ItemName, pm.VendorId, v.VendorName,
         pm.Quantity, pm.UnitId, u.Name AS UnitName, pm.CreatedAt
  FROM PurchaseMaster pm
  JOIN PharmacyItem i ON i.ItemId = pm.ItemId
  JOIN Vendor v ON v.VendorId = pm.VendorId
  LEFT JOIN UnitMaster u ON u.UnitId = pm.UnitId
`;

// Returns an error message for a bad body, or null when it's valid.
function validate({ itemId, vendorId, quantity }) {
  if (!itemId) return 'Item is required';
  if (!vendorId) return 'Vendor is required';
  if (quantity === '' || quantity == null || !(Number(quantity) > 0)) return 'Qty must be a number greater than 0';
  return null;
}

function bindFields(request, { itemId, vendorId, quantity, unitId }) {
  return request
    .input('itemId', sql.Int, itemId)
    .input('vendorId', sql.Int, vendorId)
    .input('quantity', sql.Decimal(10, 2), Number(quantity))
    .input('unitId', sql.Int, unitId || null);
}

router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('search', sql.NVarChar, `%${search}%`)
      .query(`
        ${SELECT}
        WHERE pm.IsActive = 1
          AND (@search = '%%' OR i.Name LIKE @search OR v.VendorName LIKE @search OR u.Name LIKE @search)
        ORDER BY pm.PurchaseMasterId DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const error = validate(req.body);
    if (error) return res.status(400).json({ error });
    const pool = await getPool();
    const result = await bindFields(pool.request(), req.body).query(`
      INSERT INTO PurchaseMaster (ItemId, VendorId, Quantity, UnitId)
      OUTPUT INSERTED.*
      VALUES (@itemId, @vendorId, @quantity, @unitId)
    `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const error = validate(req.body);
    if (error) return res.status(400).json({ error });
    const pool = await getPool();
    const result = await bindFields(pool.request(), req.body)
      .input('id', sql.Int, req.params.id)
      .query(`
        UPDATE PurchaseMaster
        SET ItemId = @itemId, VendorId = @vendorId, Quantity = @quantity, UnitId = @unitId
        OUTPUT INSERTED.*
        WHERE PurchaseMasterId = @id AND IsActive = 1
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
      .query('UPDATE PurchaseMaster SET IsActive = 0 WHERE PurchaseMasterId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
