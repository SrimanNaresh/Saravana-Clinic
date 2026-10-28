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

// Net Price = Qty x Current Price, less Discount %, plus GST % on the
// discounted amount (same as the Purchase Master form). Null without a price.
function netPriceOf({ quantity, currentPrice, gstPercent, discountPercent }) {
  const qty = Number(quantity);
  const price = num(currentPrice);
  if (!(qty > 0) || price === null || Number.isNaN(price)) return null;
  const afterDiscount = qty * price * (1 - (Number(discountPercent) || 0) / 100);
  return Number((afterDiscount * (1 + (Number(gstPercent) || 0) / 100)).toFixed(2));
}

const text = (v) => (v ?? '').toString().trim();
const blank = (v) => text(v) === '';

// Looks up an active row by name (case-insensitive); null when there's none.
async function findByName(pool, table, idCol, nameCol, name) {
  const result = await pool
    .request()
    .input('name', sql.NVarChar, name)
    .query(`SELECT TOP 1 * FROM ${table} WHERE LOWER(${nameCol}) = LOWER(@name) AND IsActive = 1 ORDER BY ${idCol}`);
  return result.recordset[0] || null;
}

// Like findByName, but adds the name to the master when it's new — the same
// as typing a new manufacturer / unit into the form's dropdown.
async function resolveMasterId(pool, table, idCol, name) {
  if (!name) return null;
  const existing = await findByName(pool, table, idCol, 'Name', name);
  if (existing) return existing[idCol];
  const inserted = await pool
    .request()
    .input('name', sql.NVarChar, name)
    .query(`INSERT INTO ${table} (Name) OUTPUT INSERTED.${idCol} AS id VALUES (@name)`);
  return inserted.recordset[0].id;
}

// Adds an item that isn't in Item Master yet, from what the purchase row says
// about it (Current Price becomes its purchase rate).
async function createItem(pool, name, r, manufacturerId, unitId) {
  const result = await pool
    .request()
    .input('name', sql.NVarChar, name)
    .input('hsnCode', sql.NVarChar(20), text(r.HSN) || null)
    .input('manufacturerId', sql.Int, manufacturerId)
    .input('unitId', sql.Int, unitId)
    .input('gstPercent', sql.Decimal(5, 2), num(r.GST))
    .input('discountPercent', sql.Decimal(5, 2), num(r.Discount))
    .input('purchaseRate', sql.Decimal(10, 2), num(r.CurrentPrice))
    .query(`
      INSERT INTO PharmacyItem (Name, HSNCode, ManufacturerId, UnitId, GSTPercent, DiscountPercent, PurchaseRate)
      OUTPUT INSERTED.*
      VALUES (@name, @hsnCode, @manufacturerId, @unitId, @gstPercent, @discountPercent, @purchaseRate)
    `);
  return result.recordset[0];
}

// Excel import: rows keyed ItemName, HSN, Manufacturer, Vendor, Qty, Unit,
// OldPrice, CurrentPrice, GST, Discount, NetPrice. Every row is a new purchase
// entry. An item, vendor, manufacturer or unit not on file yet is added
// (names match ignoring case). Blank HSN / Manufacturer / Unit / GST /
// Discount / Old Price are filled from the item, as picking it in the form does.
router.post('/bulk', async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required' });
  }
  const pool = await getPool();
  let inserted = 0;
  const newItems = [];
  const newVendors = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const itemName = text(r.ItemName);
      const vendorName = text(r.Vendor);
      if (!itemName) throw new Error('Item Name is required');
      if (!vendorName) throw new Error('Vendor is required');
      if (!(Number(r.Qty) > 0)) throw new Error('Qty must be a number greater than 0');
      const rowManufacturerId = blank(r.Manufacturer)
        ? null : await resolveMasterId(pool, 'ManufacturerMaster', 'ManufacturerId', text(r.Manufacturer));
      const rowUnitId = blank(r.Unit) ? null : await resolveMasterId(pool, 'UnitMaster', 'UnitId', text(r.Unit));

      let item = await findByName(pool, 'PharmacyItem', 'ItemId', 'Name', itemName);
      if (!item) {
        item = await createItem(pool, itemName, r, rowManufacturerId, rowUnitId);
        newItems.push(itemName);
      }
      let vendor = await findByName(pool, 'Vendor', 'VendorId', 'VendorName', vendorName);
      if (!vendor) {
        vendor = (await pool.request().input('name', sql.NVarChar(200), vendorName)
          .query('INSERT INTO Vendor (VendorName) OUTPUT INSERTED.* VALUES (@name)')).recordset[0];
        newVendors.push(vendorName);
      }

      let oldPrice = r.OldPrice;
      if (blank(oldPrice)) {
        const last = await pool
          .request()
          .input('itemId', sql.Int, item.ItemId)
          .query(`SELECT TOP 1 CurrentPrice FROM PurchaseMaster
                  WHERE ItemId = @itemId AND IsActive = 1 AND CurrentPrice IS NOT NULL
                  ORDER BY PurchaseMasterId DESC`);
        oldPrice = last.recordset[0]?.CurrentPrice ?? item.PurchaseRate;
      }
      const body = {
        itemId: item.ItemId,
        hsnCode: blank(r.HSN) ? item.HSNCode : text(r.HSN),
        manufacturerId: rowManufacturerId ?? item.ManufacturerId,
        vendorId: vendor.VendorId,
        quantity: r.Qty,
        unitId: rowUnitId ?? item.UnitId,
        oldPrice,
        currentPrice: r.CurrentPrice,
        gstPercent: blank(r.GST) ? item.GSTPercent : r.GST,
        discountPercent: blank(r.Discount) ? item.DiscountPercent : r.Discount,
      };
      body.netPrice = netPriceOf(body) ?? r.NetPrice;
      const error = validate(body);
      if (error) throw new Error(error);
      await bindFields(pool.request(), body).query(`
        INSERT INTO PurchaseMaster (ItemId, HSNCode, ManufacturerId, VendorId, Quantity, UnitId,
                                    OldPrice, CurrentPrice, GSTPercent, DiscountPercent, NetPrice)
        VALUES (@itemId, @hsnCode, @manufacturerId, @vendorId, @quantity, @unitId,
                @oldPrice, @currentPrice, @gstPercent, @discountPercent, @netPrice)
      `);
      inserted++;
    } catch (err) {
      errors.push({ row: i + 1, error: err.message });
    }
  }
  const added = [
    newItems.length && `${newItems.length} new item${newItems.length === 1 ? '' : 's'} (${newItems.join(', ')})`,
    newVendors.length && `${newVendors.length} new vendor${newVendors.length === 1 ? '' : 's'} (${newVendors.join(', ')})`,
  ].filter(Boolean);
  const note = added.length ? `Also added ${added.join(' and ')}.` : undefined;
  res.json({ inserted, updated: 0, failed: errors.length, errors, note });
});

// Fields the form's dropdowns list by value (no master table), with the SQL
// type each one is stored as. Only HSN is text.
const VALUE_FIELDS = {
  HSNCode: sql.NVarChar(20),
  Quantity: sql.Decimal(10, 2),
  OldPrice: sql.Decimal(10, 2),
  CurrentPrice: sql.Decimal(10, 2),
  GSTPercent: sql.Decimal(5, 2),
  DiscountPercent: sql.Decimal(5, 2),
  NetPrice: sql.Decimal(12, 2),
};

// Renames one of those values on every purchase entry using it ({ field, from,
// to }), or clears it when `to` is blank — the dropdowns' Edit / Delete.
router.post('/replace-value', async (req, res) => {
  try {
    const { field, from, to } = req.body || {};
    const type = VALUE_FIELDS[field];
    if (!type) return res.status(400).json({ error: 'Unknown field' });
    if (blank(from)) return res.status(400).json({ error: 'Value to change is required' });
    if (field === 'Quantity' && blank(to)) return res.status(400).json({ error: 'Qty is required on every entry, so it can only be renamed' });
    const numeric = field !== 'HSNCode';
    if (numeric && (Number.isNaN(Number(from)) || (!blank(to) && Number.isNaN(Number(to))))) {
      return res.status(400).json({ error: 'Value must be a number' });
    }
    const value = (v) => (blank(v) ? null : numeric ? Number(v) : text(v));
    const pool = await getPool();
    const upd = await pool.request()
      .input('from', type, value(from))
      .input('to', type, value(to))
      .query(`
        UPDATE PurchaseMaster SET ${field} = @to
        WHERE IsActive = 1 AND ${numeric ? field : `LTRIM(RTRIM(${field}))`} = @from;
        SELECT @@ROWCOUNT AS affected;
      `);
    res.json({ affected: upd.recordset[0].affected });
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
