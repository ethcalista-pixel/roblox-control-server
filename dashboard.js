#!/usr/bin/env node
// Nexus Command — Terminal Dashboard
// Usage: node dashboard.js <api-key>
// or:    API_KEY=yourkey node dashboard.js

const http = require('http');
const API_KEY = process.argv[2] || process.env.API_KEY || '';
const POLL_MS = 3000;

// ── ANSI ──────────────────────────────────────────────────────────────────────
const A = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  // fg
  white:   '\x1b[97m',
  gray:    '\x1b[90m',
  black:   '\x1b[30m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  cyan:    '\x1b[36m',
  red:     '\x1b[31m',
  // bg
  bgWhite: '\x1b[107m',
  bgBlack: '\x1b[40m',
  bgGreen: '\x1b[42m',
  bgBlue:  '\x1b[44m',
  bgGray:  '\x1b[100m',
};

const cols = () => process.stdout.columns || 80;
const clear = () => process.stdout.write('\x1b[2J\x1b[H');
const moveTo = (r, c) => process.stdout.write(`\x1b[${r};${c}H`);
const hideCursor = () => process.stdout.write('\x1b[?25l');
const showCursor = () => process.stdout.write('\x1b[?25h');

function pad(str, len, char = ' ') {
  const s = String(str ?? '');
  if (s.length >= len) return s.substring(0, len);
  return s + char.repeat(len - s.length);
}

function rpad(str, len) {
  const s = String(str ?? '');
  if (s.length >= len) return s.substring(0, len);
  return ' '.repeat(len - s.length) + s;
}

function line(text = '', color = '') {
  const c = cols();
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, c - stripped.length);
  process.stdout.write(color + text + ' '.repeat(padding) + A.reset + '\n');
}

function divider(char = '─') {
  process.stdout.write(A.gray + char.repeat(cols()) + A.reset + '\n');
}

function blank() { line(); }

// ── FETCH ─────────────────────────────────────────────────────────────────────
function fetchData() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 3000, path: '/list-servers', method: 'GET',
      headers: { 'x-api-key': API_KEY }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ data: JSON.parse(body), status: res.statusCode }); }
        catch(e) { reject(new Error('JSON parse failed')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(4000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// ── RENDER ────────────────────────────────────────────────────────────────────
let lastError = null;
let pollCount = 0;
let startTime = Date.now();

function formatUptime() {
  const s = Math.floor((Date.now() - startTime) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2,'0')}m`
    : `${String(m).padStart(2,'0')}m ${String(sec).padStart(2,'0')}s`;
}

function render(data) {
  const now = new Date().toLocaleTimeString();
  const servers  = Object.entries(data.servers  || {});
  const archives = Object.entries(data.archives || {});
  const globals  = data.global || [];
  const totalPlayers = servers.reduce((a, [,s]) => a + (s.playerCount || 0), 0);
  const w = cols();

  clear();

  // ── HEADER ────────────────────────────────────────────────────────────────
  line(
    ` ${A.bold}${A.white}NEXUS COMMAND${A.reset}${A.bgGray}${A.white}  Terminal Dashboard `,
    A.bgGray
  );
  line(
    ` ${A.gray}servers: ${A.bold}${A.white}${servers.length}${A.reset}${A.gray}   players: ${A.bold}${A.white}${totalPlayers}${A.reset}${A.gray}   archives: ${A.bold}${A.white}${archives.length}${A.reset}${A.gray}   uptime: ${formatUptime()}   refreshed: ${now}   poll #${pollCount}`,
    ''
  );
  divider();

  // ── SERVERS ───────────────────────────────────────────────────────────────
  blank();
  process.stdout.write(A.bold + A.white + '  LIVE SERVERS' + A.reset + '\n');
  blank();

  if (!servers.length) {
    process.stdout.write(A.gray + '  No active servers. Waiting for Roblox instances to connect...\n' + A.reset);
  } else {
    servers.forEach(([id, s], i) => {
      const badge  = s.isStudio
        ? `${A.yellow}[STUDIO]${A.reset}`
        : `${A.green}[LIVE]  ${A.reset}`;
      const shortId = id.substring(0, 20) + '…';
      const players = Array.isArray(s.players) ? s.players : [];

      // Card header
      process.stdout.write(
        `  ${badge} ${A.bold}${A.white}${shortId}${A.reset}` +
        `  ${A.bold}${A.cyan}${s.playerCount}${A.reset}${A.gray} player${s.playerCount !== 1 ? 's' : ''}${A.reset}\n`
      );

      // Player list
      if (players.length) {
        players.slice(0, 5).forEach(p => {
          process.stdout.write(`    ${A.green}•${A.reset} ${A.white}${p.name || p}${A.reset}\n`);
        });
        if (players.length > 5) {
          process.stdout.write(`    ${A.gray}+${players.length - 5} more${A.reset}\n`);
        }
      } else if (s.playerCount > 0) {
        process.stdout.write(`    ${A.gray}${s.playerCount} player${s.playerCount !== 1 ? 's' : ''} online${A.reset}\n`);
      } else {
        process.stdout.write(`    ${A.gray}Empty session${A.reset}\n`);
      }

      if (i < servers.length - 1) {
        process.stdout.write(A.gray + '  ' + '·'.repeat(Math.max(0, w - 4)) + A.reset + '\n');
      }
    });
  }

  blank();
  divider();

  // ── GLOBAL FEED ───────────────────────────────────────────────────────────
  blank();
  process.stdout.write(A.bold + A.white + '  RECENT CHAT' + A.reset + '\n');
  blank();

  if (!globals.length) {
    process.stdout.write(A.gray + '  No messages yet.\n' + A.reset);
  } else {
    const recent = [...globals].slice(0, 8);
    recent.forEach(c => {
      const sid = (c.jobId || '').substring(0, 8);
      process.stdout.write(
        `  ${A.gray}[${c.t}]${A.reset} ${A.blue}${sid}${A.reset} ${A.gray}›${A.reset} ${A.white}${c.msg}${A.reset}\n`
      );
    });
  }

  blank();
  divider();

  // ── FOOTER ────────────────────────────────────────────────────────────────
  process.stdout.write(
    A.gray + `  Press ${A.white}Ctrl+C${A.gray} to exit  ·  refreshes every ${POLL_MS/1000}s` + A.reset + '\n'
  );

  if (lastError) {
    process.stdout.write(A.red + `  Last error: ${lastError}` + A.reset + '\n');
  }
}

function renderError(err) {
  clear();
  line(' NEXUS COMMAND  Terminal Dashboard ', A.bgGray);
  blank();
  process.stdout.write(A.red + A.bold + '  Connection failed\n' + A.reset);
  process.stdout.write(A.gray + `  ${err.message}\n` + A.reset);
  process.stdout.write(A.gray + `  Is the server running? Try: pm2 list\n` + A.reset);
  blank();
  process.stdout.write(A.gray + `  Retrying in ${POLL_MS/1000}s...\n` + A.reset);
}

// ── MAIN LOOP ─────────────────────────────────────────────────────────────────
if (!API_KEY) {
  console.error('Usage: node dashboard.js <api-key>');
  console.error('  or:  API_KEY=yourkey node dashboard.js');
  process.exit(1);
}

hideCursor();
process.on('exit',    showCursor);
process.on('SIGINT',  () => { showCursor(); process.exit(); });
process.on('SIGTERM', () => { showCursor(); process.exit(); });

async function tick() {
  pollCount++;
  try {
    const { data, status } = await fetchData();
    if (status === 401) {
      clear();
      process.stdout.write(A.red + '\n  Invalid API key.\n' + A.reset);
      showCursor();
      process.exit(1);
    }
    lastError = null;
    render(data);
  } catch(e) {
    lastError = e.message;
    renderError(e);
  }
}

tick();
setInterval(tick, POLL_MS);
