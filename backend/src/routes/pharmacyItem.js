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
  i.PurchaseRate, i.GSTPercent, i.MRP, i.SellPrice, i.DiscountPercent, i.Rack, i.BoxNo, i.EditedAt, i.CreatedAt
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
    .input('discountPercent', sql.Decimal(5, 2), num(body.discountPercent))
    .input('rack', sql.NVarChar, body.rack?.toString().trim() || null)
    .input('boxNo', sql.NVarChar, body.boxNo?.toString().trim() || null);
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

// Bulk-import template column -> PharmacyItem column / bound parameter.
const BULK_COLUMNS = [
  ['ItemType', 'ItemTypeId', 'itemTypeId'], ['Unit', 'UnitId', 'unitId'],
  ['GenericName', 'GenericNameId', 'genericNameId'], ['Manufacturer', 'ManufacturerId', 'manufacturerId'],
  ['Supplier', 'SupplierId', 'supplierId'], ['Category', 'Category', 'category'],
  ['HSNCode', 'HSNCode', 'hsnCode'], ['TabletName', 'TabletName', 'tabletName'],
  ['PurchaseRate', 'PurchaseRate', 'purchaseRate'], ['GSTPercent', 'GSTPercent', 'gstPercent'],
  ['MRP', 'MRP', 'mrp'], ['SellPrice', 'SellPrice', 'sellPrice'],
  ['DiscountPercent', 'DiscountPercent', 'discountPercent'],
  ['ScheduleH', 'ScheduleH', 'scheduleH'], ['ScheduleH1', 'ScheduleH1', 'scheduleH1'],
  ['Rack', 'Rack', 'rack'], ['BoxNo', 'BoxNo', 'boxNo'],
];

const hasKey = (r, key) => Object.prototype.hasOwnProperty.call(r, key);

// Turns a template-keyed row into bindItemFields' body, resolving master names
// to IDs — only for the master columns the row actually has.
async function templateRowToBody(pool, r, name) {
  const resolve = (key, table, idCol) => (hasKey(r, key) ? resolveMasterId(pool, table, idCol, r[key]) : null);
  return {
    name,
    itemTypeId: await resolve('ItemType', 'ItemTypeMaster', 'ItemTypeId'),
    unitId: await resolve('Unit', 'UnitMaster', 'UnitId'),
    genericNameId: await resolve('GenericName', 'GenericNameMaster', 'GenericNameId'),
    manufacturerId: await resolve('Manufacturer', 'ManufacturerMaster', 'ManufacturerId'),
    supplierId: await resolve('Supplier', 'Supplier', 'SupplierId'),
    category: r.Category, hsnCode: r.HSNCode, tabletName: r.TabletName,
    purchaseRate: r.PurchaseRate, gstPercent: r.GSTPercent, mrp: r.MRP,
    sellPrice: r.SellPrice, discountPercent: r.DiscountPercent,
    scheduleH: toBool(r.ScheduleH), scheduleH1: toBool(r.ScheduleH1),
    rack: r.Rack, boxNo: r.BoxNo,
  };
}

// SET assignments for just the template columns present in the row.
const presentColumnSets = (r) => BULK_COLUMNS.filter(([key]) => hasKey(r, key)).map(([, col, param]) => `${col} = @${param}`);

// Partial update from ItemList new's fill-in cells: only the fields sent
// (template-keyed, e.g. { GenericName, Rack }) change; everything else stays.
router.patch('/:id', async (req, res) => {
  try {
    const r = req.body || {};
    const sets = presentColumnSets(r);
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    const pool = await getPool();
    const body = await templateRowToBody(pool, r, null);
    const upd = await bindItemFields(pool.request(), body)
      .input('id', sql.Int, req.params.id)
      .query(`
        UPDATE PharmacyItem SET ${sets.join(', ')}, EditedAt = GETDATE()
        WHERE ItemId = @id AND IsActive = 1;
        SELECT @@ROWCOUNT AS affected;
      `);
    if (upd.recordset[0].affected === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Free-text fields ItemList new's dropdowns list by value (they have no
// master table), with the column and SQL type each one is stored as.
const VALUE_FIELDS = {
  HSNCode: ['HSNCode', sql.NVarChar(20)],
  GSTPercent: ['GSTPercent', sql.Decimal(5, 2)],
  Rack: ['Rack', sql.NVarChar(50)],
  BoxNo: ['BoxNo', sql.NVarChar(50)],
};

// Renames one of those values on every item using it ({ field, from, to }),
// or clears it when `to` is blank — ItemList new's dropdown Edit / Delete.
router.post('/replace-value', async (req, res) => {
  try {
    const { field, from, to } = req.body || {};
    const spec = VALUE_FIELDS[field];
    if (!spec) return res.status(400).json({ error: 'Unknown field' });
    const blank = (v) => v === undefined || v === null || String(v).trim() === '';
    if (blank(from)) return res.status(400).json({ error: 'Value to change is required' });
    const [col, type] = spec;
    const numeric = field === 'GSTPercent';
    if (numeric && (Number.isNaN(Number(from)) || (!blank(to) && Number.isNaN(Number(to))))) {
      return res.status(400).json({ error: 'GST must be a number' });
    }
    const value = (v) => (blank(v) ? null : numeric ? Number(v) : String(v).trim());
    const pool = await getPool();
    const upd = await pool.request()
      .input('from', type, value(from))
      .input('to', type, value(to))
      .query(`
        UPDATE PharmacyItem SET ${col} = @to
        WHERE IsActive = 1 AND ${numeric ? col : `LTRIM(RTRIM(${col}))`} = @from;
        SELECT @@ROWCOUNT AS affected;
      `);
    res.json({ affected: upd.recordset[0].affected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk insert / update. Rows identifying an existing item (a numeric ItemId,
// or an ItemCode like "ITM000042") are updated, others inserted. Item Type /
// Unit / Generic Name / Manufacturer / Supplier are given as plain names
// (matching the Excel template's dropdown columns) and resolved to their
// master-table IDs, creating a new master row for any name not already on
// file. An update only touches the columns the uploaded sheet actually has,
// so a shorter template (e.g. ItemList new's) never blanks the rest.
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
    let id = Number(r.ItemId ?? r.itemId);
    if (!name) {
      errors.push({ row: i + 1, error: 'ItemName is required' });
      continue;
    }
    const code = (r.ItemCode ?? '').toString().trim();
    if (code) {
      const match = /^ITM0*(\d+)$/i.exec(code);
      if (!match) {
        errors.push({ row: i + 1, error: `Item Code "${code}" not recognised — leave it blank for a new item` });
        continue;
      }
      id = Number(match[1]);
    }
    try {
      const body = await templateRowToBody(pool, r, name);

      if (Number.isInteger(id) && id > 0) {
        const sets = ['Name = @name', ...presentColumnSets(r)];
        const upd = await bindItemFields(pool.request(), body)
          .input('id', sql.Int, id)
          .input('name', sql.NVarChar, name)
          .query(`
            UPDATE PharmacyItem SET ${sets.join(', ')}
            WHERE ItemId = @id;
            SELECT @@ROWCOUNT AS affected;
          `);
        if (upd.recordset[0].affected > 0) updated++;
        else errors.push({ row: i + 1, error: `${code ? `Item Code ${code}` : `ItemId ${id}`} not found` });
      } else {
        await bindItemFields(pool.request(), body)
          .input('name', sql.NVarChar, name)
          .query(`
            INSERT INTO PharmacyItem (
              Name, ${BULK_COLUMNS.map(([, col]) => col).join(', ')}
            )
            VALUES (
              @name, ${BULK_COLUMNS.map(([, , param]) => `@${param}`).join(', ')}
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
