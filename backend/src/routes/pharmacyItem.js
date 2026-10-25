import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';

const router = Router();

// ItemCode is derived from ItemId, not stored — e.g. ItemId 42 -> "ITM000042".
const ITEM_CODE_EXPR = `'ITM' + RIGHT('000000' + CAST(i.ItemId AS VARCHAR(10)), 6)`;

const JOINS = `
  LEFT JOIN Supplier s ON s.SupplierId = i.SupplierId
  LEFT JOIN GenericNameMaster g ON g.GenericNameId = i.GenericNameId
  LEFT JOIN ManufacturerMaster m ON m.ManufacturerId = i.ManufacturerId
  LEFT JOIN ItemTypeMaster it ON it.ItemTypeId = i.ItemTypeId
  LEFT JOIN UnitMaster u ON u.UnitId = i.UnitId
`;

const SELECT_COLUMNS = `
  i.ItemId, ${ITEM_CODE_EXPR} AS ItemCode, i.Name, i.Category, i.HSNCode,
  i.ItemTypeId, it.Name AS ItemTypeName, i.UnitId, u.Name AS UnitName,
  i.ManufacturerId, m.Name AS ManufacturerName,
  i.SupplierId, s.Name AS SupplierName,
  i.ScheduleH, i.ScheduleH1, i.GenericNameId, g.Name AS GenericNameName, i.TabletName,
  i.PurchaseRate, i.GSTPercent, i.MRP, i.SellPrice, i.DiscountPercent, i.CreatedAt
`;

function bindItemFields(request, body) {
  const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
  return request
    .input('unitId', sql.Int, body.unitId || null)
    .input('category', sql.NVarChar, body.category?.trim() || null)
    .input('hsnCode', sql.NVarChar, body.hsnCode?.trim() || null)
    .input('itemTypeId', sql.Int, body.itemTypeId || null)
    .input('manufacturerId', sql.Int, body.manufacturerId || null)
    .input('supplierId', sql.Int, body.supplierId || null)
    .input('scheduleH', sql.Bit, !!body.scheduleH)
    .input('scheduleH1', sql.Bit, !!body.scheduleH1)
    .input('genericNameId', sql.Int, body.genericNameId || null)
    .input('tabletName', sql.NVarChar, body.tabletName?.trim() || null)
    .input('purchaseRate', sql.Decimal(10, 2), num(body.purchaseRate))
    .input('gstPercent', sql.Decimal(5, 2), num(body.gstPercent))
    .input('mrp', sql.Decimal(10, 2), num(body.mrp))
    .input('sellPrice', sql.Decimal(10, 2), num(body.sellPrice))
    .input('discountPercent', sql.Decimal(5, 2), num(body.discountPercent));
}

router.get('/', async (req, res) => {
  try {
    const { search = '' } = req.query;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('search', sql.NVarChar, `%${search}%`)
      .query(`
        SELECT ${SELECT_COLUMNS}
        FROM PharmacyItem i
        ${JOINS}
        WHERE i.IsActive = 1
          AND (@search = '%%' OR i.Name LIKE @search OR i.Category LIKE @search OR i.HSNCode LIKE @search
               OR g.Name LIKE @search OR i.TabletName LIKE @search OR m.Name LIKE @search
               OR it.Name LIKE @search OR u.Name LIKE @search)
        ORDER BY i.ItemId DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Item name is required' });
    const pool = await getPool();
    const inserted = await bindItemFields(pool.request(), req.body)
      .input('name', sql.NVarChar, name.trim())
      .query(`
        INSERT INTO PharmacyItem (
          Name, UnitId, Category, HSNCode, ItemTypeId, ManufacturerId, SupplierId,
          ScheduleH, ScheduleH1, GenericNameId, TabletName,
          PurchaseRate, GSTPercent, MRP, SellPrice, DiscountPercent
        )
        OUTPUT INSERTED.ItemId
        VALUES (
          @name, @unitId, @category, @hsnCode, @itemTypeId, @manufacturerId, @supplierId,
          @scheduleH, @scheduleH1, @genericNameId, @tabletName,
          @purchaseRate, @gstPercent, @mrp, @sellPrice, @discountPercent
        )
      `);
    const newId = inserted.recordset[0].ItemId;
    const row = await pool
      .request()
      .input('id', sql.Int, newId)
      .query(`SELECT ${SELECT_COLUMNS} FROM PharmacyItem i ${JOINS} WHERE i.ItemId = @id`);
    res.status(201).json(row.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Item name is required' });
    const pool = await getPool();
    await bindItemFields(pool.request(), req.body)
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar, name.trim())
      .query(`
        UPDATE PharmacyItem
        SET Name = @name, UnitId = @unitId, Category = @category, HSNCode = @hsnCode,
            ItemTypeId = @itemTypeId, ManufacturerId = @manufacturerId, SupplierId = @supplierId,
            ScheduleH = @scheduleH, ScheduleH1 = @scheduleH1,
            GenericNameId = @genericNameId, TabletName = @tabletName,
            PurchaseRate = @purchaseRate, GSTPercent = @gstPercent, MRP = @mrp,
            SellPrice = @sellPrice, DiscountPercent = @discountPercent
        WHERE ItemId = @id
      `);
    const row = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query(`SELECT ${SELECT_COLUMNS} FROM PharmacyItem i ${JOINS} WHERE i.ItemId = @id`);
    if (!row.recordset.length) return res.status(404).json({ error: 'Not found' });
    res.json(row.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resolves a master-table row by Name (case-insensitive), creating it if it
// doesn't exist yet — the bulk-import equivalent of the "type a new value to
// add it" pickers in the Item form, so a template filled with new types/
// units/etc. works exactly like typing them in one at a time would.
async function resolveMasterId(pool, table, idCol, name) {
  const trimmed = name?.toString().trim();
  if (!trimmed) return null;
  const existing = await pool
    .request()
    .input('name', sql.NVarChar, trimmed)
    .query(`SELECT ${idCol} AS id FROM ${table} WHERE LOWER(Name) = LOWER(@name) AND IsActive = 1`);
  if (existing.recordset.length) return existing.recordset[0].id;
  const inserted = await pool
    .request()
    .input('name', sql.NVarChar, trimmed)
    .query(`INSERT INTO ${table} (Name) OUTPUT INSERTED.${idCol} AS id VALUES (@name)`);
  return inserted.recordset[0].id;
}

const toBool = (v) => ['yes', 'true', '1'].includes(String(v ?? '').trim().toLowerCase());

// Bulk insert / update. Rows with a numeric ItemId are updated, others
// inserted. Item Type / Unit / Generic Name / Manufacturer / Supplier are
// given as plain names (matching the Excel template's dropdown columns) and
// resolved to their master-table IDs, creating a new master row for any
// name not already on file.
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
    const name = (r.ItemName ?? r.itemName ?? '').toString().trim();
    const id = Number(r.ItemId ?? r.itemId);
    if (!name) {
      errors.push({ row: i + 1, error: 'ItemName is required' });
      continue;
    }
    try {
      const itemTypeId = await resolveMasterId(pool, 'ItemTypeMaster', 'ItemTypeId', r.ItemType);
      const unitId = await resolveMasterId(pool, 'UnitMaster', 'UnitId', r.Unit);
      const genericNameId = await resolveMasterId(pool, 'GenericNameMaster', 'GenericNameId', r.GenericName);
      const manufacturerId = await resolveMasterId(pool, 'ManufacturerMaster', 'ManufacturerId', r.Manufacturer);
      const supplierId = await resolveMasterId(pool, 'Supplier', 'SupplierId', r.Supplier);

      const body = {
        name, itemTypeId, unitId, genericNameId, manufacturerId, supplierId,
        category: r.Category, hsnCode: r.HSNCode, tabletName: r.TabletName,
        purchaseRate: r.PurchaseRate, gstPercent: r.GSTPercent, mrp: r.MRP,
        sellPrice: r.SellPrice, discountPercent: r.DiscountPercent,
        scheduleH: toBool(r.ScheduleH), scheduleH1: toBool(r.ScheduleH1),
      };

      if (Number.isInteger(id) && id > 0) {
        const upd = await bindItemFields(pool.request(), body)
          .input('id', sql.Int, id)
          .input('name', sql.NVarChar, name)
          .query(`
            UPDATE PharmacyItem
            SET Name = @name, UnitId = @unitId, Category = @category, HSNCode = @hsnCode,
                ItemTypeId = @itemTypeId, ManufacturerId = @manufacturerId, SupplierId = @supplierId,
                ScheduleH = @scheduleH, ScheduleH1 = @scheduleH1,
                GenericNameId = @genericNameId, TabletName = @tabletName,
                PurchaseRate = @purchaseRate, GSTPercent = @gstPercent, MRP = @mrp,
                SellPrice = @sellPrice, DiscountPercent = @discountPercent
            WHERE ItemId = @id;
            SELECT @@ROWCOUNT AS affected;
          `);
        if (upd.recordset[0].affected > 0) updated++;
        else errors.push({ row: i + 1, error: `ItemId ${id} not found` });
      } else {
        await bindItemFields(pool.request(), body)
          .input('name', sql.NVarChar, name)
          .query(`
            INSERT INTO PharmacyItem (
              Name, UnitId, Category, HSNCode, ItemTypeId, ManufacturerId, SupplierId,
              ScheduleH, ScheduleH1, GenericNameId, TabletName,
              PurchaseRate, GSTPercent, MRP, SellPrice, DiscountPercent
            )
            VALUES (
              @name, @unitId, @category, @hsnCode, @itemTypeId, @manufacturerId, @supplierId,
              @scheduleH, @scheduleH1, @genericNameId, @tabletName,
              @purchaseRate, @gstPercent, @mrp, @sellPrice, @discountPercent
            )
          `);
        inserted++;
      }
    } catch (err) {
      errors.push({ row: i + 1, error: err.message });
    }
  }
  res.json({ inserted, updated, failed: errors.length, errors });
});

router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('UPDATE PharmacyItem SET IsActive = 0 WHERE ItemId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
