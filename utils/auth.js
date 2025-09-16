const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Path for auth users file
const AUTH_FILE = path.join(process.cwd(), 'utils/auth-users.json');

// In-memory cache
let usersCache = null;
let lastLoaded = 0;
const LOAD_INTERVAL_MS = 30 * 1000; // reload at most every 30s

function ensureAuthFile() {
  if (fs.existsSync(AUTH_FILE)) return;
  const defaultPassword = 'change-me';
  const { hash } = hashPassword(defaultPassword);
  const data = {
    info: 'Initial default credentials. CHANGE THE PASSWORD IMMEDIATELY using /auth/change-password after logging in.',
    users: [ { username: 'admin', hash } ]
  };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
  console.warn('[auth] Created default auth-users.json with username "admin" and password "change-me". CHANGE IT NOW.');
}

function loadUsers(force=false){
  if (!force && usersCache && (Date.now() - lastLoaded) < LOAD_INTERVAL_MS) return usersCache;
  ensureAuthFile();
  try {
    const raw = fs.readFileSync(AUTH_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    usersCache = Array.isArray(parsed.users) ? parsed.users : [];
    lastLoaded = Date.now();
  } catch (e) {
    console.error('[auth] Failed loading users file:', e.message);
    usersCache = [];
  }
  return usersCache;
}

function hashPassword(password, salt){
  salt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash: `${salt}:${derived}`, salt };
}

function verifyPassword(password, stored){
  if (!stored || !stored.includes(':')) return false;
  const [salt, derived] = stored.split(':');
  const test = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived,'hex'), Buffer.from(test,'hex'));
}

function findUser(username){
  return loadUsers().find(u => u.username === username);
}

function updatePassword(username, newPassword){
  const users = loadUsers(true);
  const u = users.find(x => x.username === username);
  if (!u) return false;
  u.hash = hashPassword(newPassword).hash;
  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ users }, null, 2));
    usersCache = users;
    lastLoaded = Date.now();
    return true;
  } catch (e) {
    console.error('[auth] Failed writing updated password:', e.message);
    return false;
  }
}

// Session issuance & validation
const SESSION_SECRET = crypto.randomBytes(32); // ephemeral; restart invalidates sessions
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function base64url(input){
  return Buffer.from(input).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

function sign(payloadB64){
  return base64url(crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest());
}

function issueSession(username){
  const payload = { u: username, exp: Date.now() + SESSION_TTL_MS };
  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

function parseCookies(req){
  const h = req.headers.cookie; if (!h) return {};
  return h.split(';').map(v=>v.trim()).reduce((acc, part)=>{ const eq = part.indexOf('='); if(eq>0){ acc[part.slice(0,eq)] = decodeURIComponent(part.slice(eq+1)); } return acc; },{});
}

function validateSessionToken(token){
  if (!token || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  if (sign(payloadB64) !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function authenticate(username, password){
  const user = findUser(username);
  if (!user) return false;
  return verifyPassword(password, user.hash);
}

function getSession(req){
  const cookies = parseCookies(req);
  if (!cookies.session) return null;
  return validateSessionToken(cookies.session);
}

function requireAuth(req, res, next){
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ success:false, error:'AUTH_REQUIRED' });
  req.session = sess;
  next();
}

module.exports = {
  loadUsers,
  authenticate,
  issueSession,
  requireAuth,
  getSession,
  updatePassword,
  AUTH_FILE
};
