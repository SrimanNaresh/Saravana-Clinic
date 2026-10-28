import { sql } from '../db/pool.js';

// Shared by Purchase Master and Stock Inward: both record an item bought from
// a vendor with the same pricing fields, and both import the same Excel rows.

export const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
export const text = (v) => (v ?? '').toString().trim();
export const blank = (v) => text(v) === '';

// Net Price = Qty x Current Price, less Discount %, plus GST % on the
// discounted amount (same as the forms). Null without a price.
export function netPriceOf({ quantity, currentPrice, gstPercent, discountPercent }) {
  const qty = Number(quantity);
  const price = num(currentPrice);
  if (!(qty > 0) || price === null || Number.isNaN(price)) return null;
  const afterDiscount = qty * price * (1 - (Number(discountPercent) || 0) / 100);
  return Number((afterDiscount * (1 + (Number(gstPercent) || 0) / 100)).toFixed(2));
}

// Looks up an active row by name (case-insensitive); null when there's none.
export async function findByName(pool, table, idCol, nameCol, name) {
  const result = await pool
    .request()
    .input('name', sql.NVarChar, name)
    .query(`SELECT TOP 1 * FROM ${table} WHERE LOWER(${nameCol}) = LOWER(@name) AND IsActive = 1 ORDER BY ${idCol}`);
  return result.recordset[0] || null;
}

// Like findByName, but adds the name to the master when it's new — the same
// as typing a new manufacturer / unit into the form's dropdown.
export async function resolveMasterId(pool, table, idCol, name) {
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

// Turns an imported row (keyed ItemName, HSN, Manufacturer, Vendor, Qty, Unit,
// OldPrice, CurrentPrice, GST, Discount, NetPrice) into a form body. An item,
// vendor, manufacturer or unit not on file yet is added (names match ignoring
// case), and its name noted in `added` ({ items: [], vendors: [] }). Blank HSN /
// Manufacturer / Unit / GST / Discount / Old Price are filled from the item, as
// picking it in a form does; Old Price is the item's last Current Price in
// `priceTable` (ordered by `priceIdCol`), else its purchase rate.
export async function importRowBody(pool, r, { priceTable, priceIdCol }, added) {
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
    added.items.push(itemName);
  }
  let vendor = await findByName(pool, 'Vendor', 'VendorId', 'VendorName', vendorName);
  if (!vendor) {
    vendor = (await pool.request().input('name', sql.NVarChar(200), vendorName)
      .query('INSERT INTO Vendor (VendorName) OUTPUT INSERTED.* VALUES (@name)')).recordset[0];
    added.vendors.push(vendorName);
  }

  let oldPrice = r.OldPrice;
  if (blank(oldPrice)) {
    const last = await pool
      .request()
      .input('itemId', sql.Int, item.ItemId)
      .query(`SELECT TOP 1 CurrentPrice FROM ${priceTable}
              WHERE ItemId = @itemId AND IsActive = 1 AND CurrentPrice IS NOT NULL
              ORDER BY ${priceIdCol} DESC`);
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
  return body;
}

// The import result's "Also added …" line, or undefined when nothing was added.
export function addedNote({ items, vendors }) {
  const parts = [
    items.length && `${items.length} new item${items.length === 1 ? '' : 's'} (${items.join(', ')})`,
    vendors.length && `${vendors.length} new vendor${vendors.length === 1 ? '' : 's'} (${vendors.join(', ')})`,
  ].filter(Boolean);
  return parts.length ? `Also added ${parts.join(' and ')}.` : undefined;
}
