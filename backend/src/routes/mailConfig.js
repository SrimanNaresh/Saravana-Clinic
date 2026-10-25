import { Router } from 'express';
import multer from 'multer';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { getPool, sql } from '../db/pool.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const IMAP_HOST = 'imap.gmail.com';
const IMAP_PORT = 993;
const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 465;

// Loads the config row and decrypts its password onto req.mailConfig for the
// IMAP/SMTP routes below. Never exposes the encrypted/decrypted value in a response.
async function loadConfig(req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT * FROM MailConfig WHERE MailConfigId = @id AND IsActive = 1');
    if (!result.recordset.length) return res.status(404).json({ error: 'Mail configuration not found' });
    const row = result.recordset[0];
    req.mailConfig = { gmailId: row.GmailId, password: decryptSecret(row.PasswordEncrypted), folderName: row.FolderName };
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function imapClient({ gmailId, password }) {
  return new ImapFlow({ host: IMAP_HOST, port: IMAP_PORT, secure: true, auth: { user: gmailId, pass: password }, logger: false });
}

// Walk an IMAP BODYSTRUCTURE tree collecting parts that have a filename (attachments).
function collectAttachments(node, list = []) {
  if (!node) return list;
  const filename = node.dispositionParameters?.filename || node.parameters?.name;
  if (filename && node.part) list.push({ part: node.part, filename, size: node.size || 0, type: `${node.type}/${node.subtype}` });
  if (node.childNodes) for (const child of node.childNodes) collectAttachments(child, list);
  return list;
}

// ---- CRUD (list never returns the password) ----

router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT MailConfigId, GmailId, FolderName, IsActive, CreatedAt
      FROM MailConfig
      ORDER BY MailConfigId DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { gmailId, password, folderName } = req.body;
    if (!gmailId?.trim()) return res.status(400).json({ error: 'Gmail ID is required' });
    if (!password) return res.status(400).json({ error: 'Password (Gmail App Password) is required' });
    const pool = await getPool();
    const result = await pool
      .request()
      .input('gmailId', sql.NVarChar, gmailId.trim())
      .input('password', sql.NVarChar(sql.MAX), encryptSecret(password))
      .input('folderName', sql.NVarChar, folderName?.trim() || 'INBOX')
      .query(`
        INSERT INTO MailConfig (GmailId, PasswordEncrypted, FolderName)
        OUTPUT INSERTED.MailConfigId, INSERTED.GmailId, INSERTED.FolderName, INSERTED.IsActive, INSERTED.CreatedAt
        VALUES (@gmailId, @password, @folderName)
      `);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { gmailId, password, folderName, isActive } = req.body;
    if (!gmailId?.trim()) return res.status(400).json({ error: 'Gmail ID is required' });
    const pool = await getPool();
    const reqDb = pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('gmailId', sql.NVarChar, gmailId.trim())
      .input('folderName', sql.NVarChar, folderName?.trim() || 'INBOX')
      .input('isActive', sql.Bit, isActive === false ? 0 : 1);
    let setClause = 'GmailId=@gmailId, FolderName=@folderName, IsActive=@isActive, UpdatedAt=GETDATE()';
    if (password) {
      reqDb.input('password', sql.NVarChar(sql.MAX), encryptSecret(password));
      setClause += ', PasswordEncrypted=@password';
    }
    const result = await reqDb.query(`
      UPDATE MailConfig SET ${setClause}
      OUTPUT INSERTED.MailConfigId, INSERTED.GmailId, INSERTED.FolderName, INSERTED.IsActive, INSERTED.CreatedAt
      WHERE MailConfigId=@id
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
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM MailConfig WHERE MailConfigId = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Folder access: list messages + attachments in the configured folder ----

router.get('/:id/messages', loadConfig, async (req, res) => {
  const client = imapClient(req.mailConfig);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(req.mailConfig.folderName);
    const messages = [];
    try {
      const status = await client.status(req.mailConfig.folderName, { messages: true });
      const total = status.messages || 0;
      if (total > 0) {
        const start = Math.max(1, total - 49); // most recent 50 messages
        for await (const msg of client.fetch(`${start}:*`, { envelope: true, uid: true, bodyStructure: true, size: true })) {
          messages.push({
            uid: msg.uid,
            subject: msg.envelope?.subject || '(no subject)',
            from: msg.envelope?.from?.[0]?.address || '',
            date: msg.envelope?.date || null,
            size: msg.size || 0,
            attachments: collectAttachments(msg.bodyStructure),
          });
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
    messages.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ folderName: req.mailConfig.folderName, messages });
  } catch (err) {
    try { await client.logout(); } catch { /* already closed */ }
    res.status(502).json({ error: `Could not read Gmail folder: ${err.message}` });
  }
});

router.get('/:id/messages/:uid/attachments/:part', loadConfig, async (req, res) => {
  const client = imapClient(req.mailConfig);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(req.mailConfig.folderName);
    let meta;
    let content;
    try {
      const result = await client.download(req.params.uid, req.params.part, { uid: true });
      meta = result.meta;
      const chunks = [];
      for await (const chunk of result.content) chunks.push(chunk);
      content = Buffer.concat(chunks);
    } finally {
      lock.release();
    }
    await client.logout();
    res.set('Content-Type', meta.contentType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.filename || 'download')}"`);
    res.send(content);
  } catch (err) {
    try { await client.logout(); } catch { /* already closed */ }
    res.status(502).json({ error: `Could not download attachment: ${err.message}` });
  }
});

// ---- Upload: send a new email with an attached file via this Gmail account ----

router.post('/:id/send', loadConfig, upload.single('file'), async (req, res) => {
  const { to, subject, body } = req.body;
  if (!to?.trim()) return res.status(400).json({ error: 'Recipient email is required' });
  if (!req.file) return res.status(400).json({ error: 'A file is required' });
  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: true,
      auth: { user: req.mailConfig.gmailId, pass: req.mailConfig.password },
    });
    await transporter.sendMail({
      from: req.mailConfig.gmailId,
      to: to.trim(),
      subject: subject?.trim() || '(no subject)',
      text: body || '',
      attachments: [{ filename: req.file.originalname, content: req.file.buffer }],
    });
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: `Could not send email: ${err.message}` });
  }
});

export default router;
