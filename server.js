const express    = require('express');
const path       = require('path');
const crypto     = require('crypto');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── ENVIRONMENT VALIDATION ────────────────────────────────────────────────────
const API_KEY = process.env.API_KEY;
if (!API_KEY || API_KEY.length < 8) {
    console.error('[FATAL] API_KEY env var is missing or too short (min 8 chars). Exiting.');
    process.exit(1);
}

// Pre-hash the API key so it is never compared in plaintext at runtime.
// All incoming keys are hashed then compared with timingSafeEqual — prevents
// timing-based side-channel attacks.
const API_KEY_HASH = crypto.createHash('sha256').update(API_KEY).digest();

function verifyKey(incoming) {
    if (!incoming || typeof incoming !== 'string') return false;
    try {
        const h = crypto.createHash('sha256').update(incoming).digest();
        return crypto.timingSafeEqual(API_KEY_HASH, h);
    } catch {
        return false;
    }
}

// ── INPUT SANITISATION ────────────────────────────────────────────────────────
function sanitize(value, maxLen = 256) {
    if (typeof value !== 'string') return '';
    return value
        .slice(0, maxLen)
        .replace(/[<>"'`]/g, '')   // strip HTML/JS injection chars
        .replace(/[\x00-\x1F\x7F]/g, '') // strip control characters
        .trim();
}

function sanitizeMsg(value, maxLen = 512) {
    if (typeof value !== 'string') return '';
    return value
        .slice(0, maxLen)
        .replace(/[<>]/g, '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .trim();
}

// ── HELMET — HTTP SECURITY HEADERS ───────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:     ["'self'"],
            scriptSrc:      ["'self'", "'unsafe-inline'"],   // inline scripts in index.html
            styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc:        ["'self'", "https://fonts.gstatic.com"],
            connectSrc:     ["'self'"],
            imgSrc:         ["'self'", "data:"],
            objectSrc:      ["'none'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    crossOriginEmbedderPolicy: false, // allow fonts
}));

// ── BODY LIMITS ───────────────────────────────────────────────────────────────
// Cap request bodies at 16 KB — prevents memory exhaustion / large-payload attacks
app.use(express.json({ limit: '16kb' }));

// ── RATE LIMITERS ─────────────────────────────────────────────────────────────
// General dashboard endpoints (list-servers): 60 req / min per IP
const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Slow down.' },
    skip: (req) => false,
});

// Mutating admin actions (kick, archive, delete): 20 req / 15 min per IP
const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many action requests. Try again later.' },
});

// Roblox poll endpoint: 120 req / min per IP (servers poll every ~5s; headroom for many servers)
const pollLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: JSON.stringify({ error: 'Rate limited' }),
});

// ── IN-MEMORY STATE ───────────────────────────────────────────────────────────
let activeServers   = {};
let globalChat      = [];
let archivedSessions = {};

// ── 24-HOUR CHAT CLEAR ────────────────────────────────────────────────────────
setInterval(() => {
    globalChat = [];
    for (const id in activeServers) activeServers[id].chats = [];
    console.log(`[${new Date().toISOString()}] 24h chat clear executed.`);
}, 24 * 60 * 60 * 1000);

// ── STATIC ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── 1. ROBLOX POLL ────────────────────────────────────────────────────────────
// Keyed by API_KEY in URL to avoid putting the secret in a header for game clients.
app.post(`/poll/${API_KEY}`, pollLimiter, (req, res) => {
    const { jobId, playerCount, isStudio, packets, players } = req.body || {};

    const cleanId = sanitize(jobId, 64);
    if (!cleanId) return res.status(400).json({ error: 'Missing jobId' });

    // Validate playerCount is a non-negative integer
    const count = Math.max(0, Math.min(500, parseInt(playerCount) || 0));

    if (!activeServers[cleanId]) {
        activeServers[cleanId] = {
            shouldKick: false,
            chats:      [],
            players:    [],
            isStudio:   Boolean(isStudio),
            startTime:  new Date().toISOString(),
        };
    }

    activeServers[cleanId].lastSeen    = Date.now();
    activeServers[cleanId].playerCount = count;

    // Sanitize player list
    if (Array.isArray(players)) {
        activeServers[cleanId].players = players
            .slice(0, 100)
            .map(p => ({ name: sanitize(typeof p === 'object' ? p.name : p, 64) }))
            .filter(p => p.name);
    }

    // Sanitize and store chat packets
    if (Array.isArray(packets) && packets.length > 0) {
        packets.slice(0, 50).forEach(msg => {
            const clean = sanitizeMsg(msg, 512);
            if (!clean) return;
            const entry = { t: new Date().toLocaleTimeString(), msg: clean };
            activeServers[cleanId].chats.push(entry);
            globalChat.unshift({ jobId: cleanId, ...entry });
        });
        if (activeServers[cleanId].chats.length > 200) activeServers[cleanId].chats.splice(0, activeServers[cleanId].chats.length - 200);
        if (globalChat.length > 200) globalChat.splice(200);
    }

    res.json({ kick: activeServers[cleanId].shouldKick });
});

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function auth(req, res, next) {
    const key = req.headers['x-api-key'];
    if (!verifyKey(key)) {
        // Uniform delay to slow brute-force even if rate limiter is bypassed
        setTimeout(() => res.status(401).json({ error: 'Unauthorised' }), 200);
        return;
    }
    next();
}

// ── 2. LIST SERVERS ───────────────────────────────────────────────────────────
app.get('/list-servers', generalLimiter, auth, (req, res) => {
    const now = Date.now();
    for (const id in activeServers) {
        if (now - activeServers[id].lastSeen > 20000) delete activeServers[id];
    }
    res.json({ servers: activeServers, global: globalChat, archives: archivedSessions });
});

// ── 3. ARCHIVE ────────────────────────────────────────────────────────────────
app.post('/archive-session', strictLimiter, auth, (req, res) => {
    const jobId      = sanitize(req.body?.jobId, 64);
    const customName = sanitize(req.body?.customName, 80) || 'Unnamed Archive';

    if (!jobId || !activeServers[jobId]) return res.status(404).json({ error: 'Server not found' });

    const id = 'ARC-' + Date.now();
    archivedSessions[id] = {
        name:   customName,
        jobId:  jobId,
        chats:  [...activeServers[jobId].chats],
        date:   new Date().toISOString(),
    };
    res.json({ ok: true, archiveId: id });
});

// ── 4. DELETE ARCHIVE ─────────────────────────────────────────────────────────
app.post('/delete-archive', strictLimiter, auth, (req, res) => {
    const archiveId = sanitize(req.body?.archiveId, 64);
    if (!archiveId || !archivedSessions[archiveId]) return res.status(404).json({ error: 'Archive not found' });
    delete archivedSessions[archiveId];
    res.json({ ok: true });
});

// ── 5. KICK SERVER ────────────────────────────────────────────────────────────
app.post('/kick-server', strictLimiter, auth, (req, res) => {
    const jobId = sanitize(req.body?.jobId, 64);
    if (!jobId) return res.status(400).json({ error: 'Missing jobId' });
    if (activeServers[jobId]) activeServers[jobId].shouldKick = true;
    res.json({ ok: true });
});

// ── CATCH-ALL 404 ─────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ── GLOBAL ERROR HANDLER (no stack traces to client) ─────────────────────────
app.use((err, req, res, next) => {
    console.error(`[ERROR] ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
});

// ── LISTEN ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`[${new Date().toISOString()}] Nexus online :${PORT}`));
