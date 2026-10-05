'use strict';
// ===================== We Create ERP · utilities =====================

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const r2 = n => Math.round((Number(n) || 0) * 100 + Number.EPSILON * 100) / 100;
const num = n => r2(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr = n => (r2(n) < 0 ? '−₹' : '₹') + num(Math.abs(n));
const inr0 = n => (n < 0 ? '−₹' : '₹') + Math.round(Math.abs(n)).toLocaleString('en-IN');
const uid = p => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const sum = (list, f) => r2(list.reduce((s, x) => s + (typeof f === 'function' ? f(x) : x[f]) || 0, 0));

// ---------- dates (ISO yyyy-mm-dd, local time) ----------
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayISO = () => iso(new Date());
function parseISO(s) {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function fmtDate(s) {
    if (!s) return '';
    const [y, m, d] = s.split('-');
    return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
}
const ddmmyyyy = (s, sep = '-') => s ? s.split('-').reverse().join(sep) : '';
function addDays(s, n) {
    const d = parseISO(s);
    d.setDate(d.getDate() + n);
    return iso(d);
}
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
const ymOf = s => s.slice(0, 7);
const ymLabel = ym => `${MONTHS_LONG[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
function addMonths(ym, n) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const lastDay = ym => iso(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0));
// Indian financial year: 1 April to 31 March. fyOf returns the starting calendar year.
const fyOf = s => { const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7)); return m >= 4 ? y : y - 1; };
const fyLabel = y => `${y}-${String(y + 1).slice(2)}`;
const fyShort = y => `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
const fyStart = y => `${y}-04-01`;
const fyEnd = y => `${y + 1}-03-31`;
const fyMonths = y => Array.from({ length: 12 }, (_, i) => addMonths(`${y}-04`, i));

// ---------- Indian number to words (rupees and paise) ----------
function inWords(amount) {
    const n = Math.floor(Math.abs(amount));
    const paise = Math.round((Math.abs(amount) - n) * 100);
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = x => x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '');
    const three = x => x >= 100 ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x);
    const words = x => {
        if (x === 0) return 'Zero';
        const parts = [];
        const crore = Math.floor(x / 1e7); x %= 1e7;
        const lakh = Math.floor(x / 1e5); x %= 1e5;
        const th = Math.floor(x / 1000); x %= 1000;
        if (crore) parts.push(words(crore) + ' Crore');
        if (lakh) parts.push(two(lakh) + ' Lakh');
        if (th) parts.push(two(th) + ' Thousand');
        if (x) parts.push(three(x));
        return parts.join(' ');
    };
    return `Rupees ${words(n)}${paise ? ' and ' + two(paise) + ' Paise' : ''} Only`;
}

// ---------- GST state codes ----------
const STATES = {
    '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
    '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland',
    '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
    '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu',
    '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
    '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '96': 'Foreign Country'
};
const stateName = c => STATES[c] ? `${STATES[c]} (${c})` : '';

// ---------- identity number checks ----------
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function gstinChecksum(first14) {
    let total = 0;
    for (let i = 0; i < 14; i++) {
        const v = GSTIN_CHARS.indexOf(first14[i]) * (i % 2 ? 2 : 1);
        total += Math.floor(v / 36) + (v % 36);
    }
    return GSTIN_CHARS[(36 - (total % 36)) % 36];
}
function gstinValid(g) {
    g = String(g || '').toUpperCase();
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
    if (!STATES[g.slice(0, 2)] || g.slice(0, 2) === '96') return false;
    return gstinChecksum(g.slice(0, 14)) === g[14];
}
const makeGstin = (state, pan, entity = '1') => { const b = `${state}${pan}${entity}Z`; return b + gstinChecksum(b); };
const panValid = p => /^[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]$/.test(String(p || '').toUpperCase());
const pinValid = p => /^[1-9]\d{5}$/.test(String(p || ''));
const hsnValid = h => /^\d{4}(\d{2})?(\d{2})?$/.test(String(h || ''));

// ---------- SHA-256 (pure JS, synchronous: works from a local file and keeps audit hashing in order) ----------
function sha256(message) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const bytes = new TextEncoder().encode(String(message));
    const len = bytes.length;
    const words = new Uint32Array(((len + 9 + 63) >> 6) << 4);
    for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
    words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
    words[words.length - 1] = len * 8;
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const W = new Uint32Array(64);
    const rot = (x, n) => (x >>> n) | (x << (32 - n));
    for (let b = 0; b < words.length; b += 16) {
        for (let t = 0; t < 64; t++) {
            if (t < 16) W[t] = words[b + t];
            else {
                const s0 = rot(W[t - 15], 7) ^ rot(W[t - 15], 18) ^ (W[t - 15] >>> 3);
                const s1 = rot(W[t - 2], 17) ^ rot(W[t - 2], 19) ^ (W[t - 2] >>> 10);
                W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
            }
        }
        let [a, bb, c, d, e, f, g, h] = H;
        for (let t = 0; t < 64; t++) {
            const S1 = rot(e, 6) ^ rot(e, 11) ^ rot(e, 25);
            const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[t] + W[t]) | 0;
            const S0 = rot(a, 2) ^ rot(a, 13) ^ rot(a, 22);
            const t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
        }
        H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
        H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

// Shortest password allowed (owner's choice: 4). Longer passwords are always allowed.
const MIN_PASSWORD = 4;

// Password hash: salted, stretched SHA-256. (The server version will use bcrypt / Argon2.)
function hashPassword(password, salt) {
    let h = sha256(`${salt}:${password}`);
    for (let i = 0; i < 4000; i++) h = sha256(h + salt);
    return h;
}
const randomHex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');

// ---------- CSV ----------
function csvParse(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') q = false;
            else cell += ch;
        } else if (ch === '"') q = true;
        else if (ch === ',') { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(cell); rows.push(row); row = []; cell = '';
        } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ''));
}
const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCSV = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n');

function download(name, text, type = 'text/plain') {
    const blob = text instanceof Blob ? text : new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
}

// Accepts dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd and dd-Mon-yyyy
function anyDateToISO(s) {
    s = String(s || '').trim();
    let m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if ((m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{4})$/))) {
        const mi = MONTHS.findIndex(x => x.toLowerCase() === m[2].toLowerCase());
        if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    return '';
}
const normInv = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
