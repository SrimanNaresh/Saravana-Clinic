import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

const router = Router();

const SELECT = `
  SELECT pm.PurchaseMasterId, pm.ItemId, i.Name AS ItemName, pm.HSNCode,
         pm.ManufacturerId, m.Name AS ManufacturerName, pm.VendorId, v.VendorName,
         pm.Quantity, pm.UnitId, u.Name AS UnitName, pm.OldPrice, pm.CurrentPrice,
         pm.GSTPercent, pm.DiscountPercent, pm.NetPrice, pm.CreatedAt
  FROM PurchaseMaster pm
  JOIN PharmacyItem i ON i.ItemId = pm.ItemId
  JOIN Vendor v ON v.VendorId = pm.VendorId
  LEFT JOIN UnitMaster u ON u.UnitId = pm.UnitId
  LEFT JOIN ManufacturerMaster m ON m.ManufacturerId = pm.ManufacturerId
`;

// Returns an error message for a bad body, or null when it's valid.
function validate({ itemId, vendorId, quantity }) {
  if (!itemId) return 'Item is required';
  if (!vendorId) return 'Vendor is required';
  if (quantity === '' || quantity == null || !(Number(quantity) > 0)) return 'Qty must be a number greater than 0';
  return null;
}

const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));

function bindFields(request, body) {
  return request
    .input('itemId', sql.Int, body.itemId)
    .input('hsnCode', sql.NVarChar(20), body.hsnCode?.trim() || null)
    .input('manufacturerId', sql.Int, body.manufacturerId || null)
    .input('vendorId', sql.Int, body.vendorId)
    .input('quantity', sql.Decimal(10, 2), Number(body.quantity))
    .input('unitId', sql.Int, body.unitId || null)
    .input('oldPrice', sql.Decimal(10, 2), num(body.oldPrice))
    .input('currentPrice', sql.Decimal(10, 2), num(body.currentPrice))
    .input('gstPercent', sql.Decimal(5, 2), num(body.gstPercent))
    .input('discountPercent', sql.Decimal(5, 2), num(body.discountPercent))
    .input('netPrice', sql.Decimal(12, 2), num(body.netPrice));
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
          AND (@search = '%%' OR i.Name LIKE @search OR v.VendorName LIKE @search OR u.Name LIKE @search
               OR m.Name LIKE @search OR pm.HSNCode LIKE @search)
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
      INSERT INTO PurchaseMaster (ItemId, HSNCode, ManufacturerId, VendorId, Quantity, UnitId,
                                  OldPrice, CurrentPrice, GSTPercent, DiscountPercent, NetPrice)
      OUTPUT INSERTED.*
      VALUES (@itemId, @hsnCode, @manufacturerId, @vendorId, @quantity, @unitId,
              @oldPrice, @currentPrice, @gstPercent, @discountPercent, @netPrice)
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
        SET ItemId = @itemId, HSNCode = @hsnCode, ManufacturerId = @manufacturerId, VendorId = @vendorId,
            Quantity = @quantity, UnitId = @unitId, OldPrice = @oldPrice, CurrentPrice = @currentPrice,
            GSTPercent = @gstPercent, DiscountPercent = @discountPercent, NetPrice = @netPrice
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
