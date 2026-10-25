import { Router } from 'express';
import { getPool, sql } from '../db/pool.js';
import { exchangeCode, isConfigured } from '../utils/googleDrive.js';
import { encryptSecret } from '../utils/crypto.js';

const router = Router();

// Google redirects the browser here after the user approves access — this
// request carries no login session of ours, so it must stay public. Mounted
// before requireAuth in server.js; everything else under /api/drive-config
// is mounted again afterward, protected.
router.get('/oauth/callback', async (req, res) => {
  if (!isConfigured()) return res.status(500).send('Google Drive is not configured on this server yet.');
  const { code, error } = req.query;
  if (error) return res.redirect(`/master/drive-config?error=${encodeURIComponent(error)}`);
  if (!code) return res.status(400).send('Missing authorization code.');

  try {
    const { tokens, email } = await exchangeCode(code);
    const pool = await getPool();
    const accessEnc = encryptSecret(tokens.access_token || '');
    const refreshEnc = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null;
    const expiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    const existing = await pool.request().input('email', sql.NVarChar, email)
      .query('SELECT DriveConnectionId FROM DriveConnection WHERE GoogleEmail = @email');

    if (existing.recordset.length) {
      const id = existing.recordset[0].DriveConnectionId;
      const reqDb = pool.request()
        .input('id', sql.Int, id)
        .input('access', sql.NVarChar(sql.MAX), accessEnc)
        .input('expiry', sql.DateTime, expiry);
      let setClause = 'AccessTokenEncrypted=@access, TokenExpiry=@expiry, IsActive=1, UpdatedAt=GETDATE()';
      if (refreshEnc) {
        reqDb.input('refresh', sql.NVarChar(sql.MAX), refreshEnc);
        setClause += ', RefreshTokenEncrypted=@refresh';
      }
      await reqDb.query(`UPDATE DriveConnection SET ${setClause} WHERE DriveConnectionId=@id`);
    } else {
      await pool.request()
        .input('email', sql.NVarChar, email)
        .input('access', sql.NVarChar(sql.MAX), accessEnc)
        .input('refresh', sql.NVarChar(sql.MAX), refreshEnc)
        .input('expiry', sql.DateTime, expiry)
        .query(`
          INSERT INTO DriveConnection (GoogleEmail, AccessTokenEncrypted, RefreshTokenEncrypted, TokenExpiry)
          VALUES (@email, @access, @refresh, @expiry)
        `);
    }
    res.redirect('/master/drive-config?connected=1');
  } catch (err) {
    res.redirect(`/master/drive-config?error=${encodeURIComponent(err.message)}`);
  }
});

export default router;
