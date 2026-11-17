// Dev helper: call one API route handler directly (no HTTP, no login) and
// print its JSON. Uses the database in backend/.env.
//   node scripts/callRoute.js <routes file> <METHOD> <path> [jsonBody] [role]
// e.g. node scripts/callRoute.js pharmacyReport.js GET "/expiry?category="
import 'dotenv/config';

const [file, method = 'GET', url = '/', body = '{}', role = 'Admin'] = process.argv.slice(2);
const { default: router } = await import(`../src/routes/${file}`);
const [path, qs = ''] = url.split('?');
const req = {
  method, url, path, originalUrl: url, baseUrl: '',
  query: Object.fromEntries(new URLSearchParams(qs)),
  body: JSON.parse(body), params: {}, headers: {},
  user: { username: 'claude-check', role },
  get: () => undefined,
};
const res = {
  statusCode: 200,
  status(c) { this.statusCode = c; return this; },
  json(d) { console.log(JSON.stringify({ status: this.statusCode, data: d }, null, 1)); process.exit(0); },
  send(d) { this.json(d); },
  setHeader() {}, set() { return this; },
};
router.handle(req, res, (err) => { console.log('NEXT', err?.message || 'no route matched'); process.exit(1); });
