'use strict';
// ===================== We Create ERP · data, accounting engine, audit trail =====================
// Every report is derived from vouchers + opening balances, so one entry flows to ledgers, GST, TDS,
// outstanding bills, stock and all three financial statements with no second entry.

const META_KEY = 'wcerp.meta.v1';
const coKey = id => `wcerp.co.${id}`;
const APP_VERSION = '0.9 (test build)';

let meta = null;      // { users:[], companies:[{id,name,gstin}], audit:[] }
let co = null;        // the open company's whole data set
let me = null;        // signed-in user
let ver = 0;          // bumps on every change; caches key off it

// ---------- groups: nature, Schedule III line, cash-flow section ----------
// nature A/L/I/E · s3 = Schedule III (Division I) line · cf = cash-flow bucket
const GROUPS = {
    capital: { name: 'Capital Account', nature: 'L', s3: 'equity_capital', cf: 'fin' },
    reserves: { name: 'Reserves & Surplus', nature: 'L', s3: 'equity_reserves', cf: 'fin' },
    loans: { name: 'Long-term Borrowings', nature: 'L', s3: 'ncl_borrow', cf: 'fin' },
    stloans: { name: 'Short-term Borrowings', nature: 'L', s3: 'cl_borrow', cf: 'fin' },
    creditors: { name: 'Sundry Creditors', nature: 'L', s3: 'cl_payables', cf: 'wc' },
    duties: { name: 'Duties & Taxes', nature: 'L', s3: 'cl_other', cf: 'wc' },
    curliab: { name: 'Current Liabilities', nature: 'L', s3: 'cl_other', cf: 'wc' },
    provisions: { name: 'Provisions', nature: 'L', s3: 'cl_prov', cf: 'wc' },
    fixed: { name: 'Fixed Assets', nature: 'A', s3: 'nca_ppe', cf: 'inv' },
    invest: { name: 'Investments', nature: 'A', s3: 'nca_invest', cf: 'inv' },
    loansadv: { name: 'Loans & Advances (Asset)', nature: 'A', s3: 'ca_loans', cf: 'wc' },
    debtors: { name: 'Sundry Debtors', nature: 'A', s3: 'ca_receivables', cf: 'wc' },
    curassets: { name: 'Current Assets', nature: 'A', s3: 'ca_other', cf: 'wc' },
    bank: { name: 'Bank Accounts', nature: 'A', s3: 'ca_cash', cf: 'cash' },
    cash: { name: 'Cash-in-Hand', nature: 'A', s3: 'ca_cash', cf: 'cash' },
    sales: { name: 'Sales Accounts', nature: 'I', s3: 'rev_ops' },
    dirinc: { name: 'Direct Incomes', nature: 'I', s3: 'rev_ops' },
    indinc: { name: 'Indirect Incomes', nature: 'I', s3: 'other_income' },
    purchase: { name: 'Purchase Accounts', nature: 'E', s3: 'exp_purchase' },
    direxp: { name: 'Direct Expenses', nature: 'E', s3: 'exp_other' },
    empexp: { name: 'Employee Benefit Expenses', nature: 'E', s3: 'exp_employee' },
    fincost: { name: 'Finance Costs', nature: 'E', s3: 'exp_finance' },
    deprec: { name: 'Depreciation & Amortisation', nature: 'E', s3: 'exp_dep' },
    indexp: { name: 'Indirect Expenses', nature: 'E', s3: 'exp_other' },
    taxexp: { name: 'Income Tax Expense', nature: 'E', s3: 'exp_tax' }
};

const SYS_ACCOUNTS = [
    ['cash', 'Cash', 'cash'], ['sales', 'Sales', 'sales'], ['salesSvc', 'Service Income', 'sales'], ['purchase', 'Purchases', 'purchase'],
    ['outCgst', 'Output CGST', 'duties'], ['outSgst', 'Output SGST', 'duties'], ['outIgst', 'Output IGST', 'duties'],
    ['inCgst', 'Input CGST', 'duties'], ['inSgst', 'Input SGST', 'duties'], ['inIgst', 'Input IGST', 'duties'],
    ['rcmPay', 'GST Payable on Reverse Charge', 'duties'], ['tdsPay', 'TDS Payable', 'duties'], ['tdsRec', 'TDS Receivable', 'loansadv'], ['tcsPay', 'TCS Payable', 'duties'],
    ['roundOff', 'Round Off', 'indexp'], ['capital', "Owner's Capital", 'capital'], ['salary', 'Salaries & Wages', 'empexp'],
    ['rent', 'Rent', 'indexp'], ['freight', 'Freight Inward', 'direxp'], ['professional', 'Legal & Professional Fees', 'indexp'],
    ['depreciation', 'Depreciation', 'deprec'], ['interest', 'Interest on Loans', 'fincost'], ['bankCharges', 'Bank Charges', 'fincost'],
    ['discountAllowed', 'Discount Allowed', 'indexp'], ['misc', 'Miscellaneous Expenses', 'indexp'], ['otherIncome', 'Interest Received', 'indinc'],
    ['erPf', "Employer's Contribution to PF", 'empexp'], ['erEsi', "Employer's Contribution to ESI", 'empexp'],
    ['salPay', 'Salary Payable', 'curliab'], ['pfPay', 'PF Payable', 'duties'], ['esiPay', 'ESI Payable', 'duties'], ['ptPay', 'Professional Tax Payable', 'duties'],
    ['tdsSalPay', 'TDS on Salary Payable', 'duties'], ['salAdv', 'Salary Advances to Staff', 'loansadv'], ['repairs', 'Repairs & Maintenance – Machinery', 'direxp'],
    ['itcRev', 'Input Tax Credit Reversed (Rule 42)', 'indexp'], ['compTax', 'Composition Tax (GST)', 'indexp'], ['compPay', 'GST Payable – Composition', 'duties']
];

const VTYPES = {
    SI: { name: 'Sales Invoice', short: 'Sales', prefix: 'INV', key: 'F8' },
    PB: { name: 'Purchase Bill', short: 'Purchase', prefix: 'PB', key: 'F9' },
    CN: { name: 'Credit Note', short: 'Credit Note', prefix: 'CN', key: 'Ctrl+F8' },
    DN: { name: 'Debit Note', short: 'Debit Note', prefix: 'DN', key: 'Ctrl+F9' },
    RC: { name: 'Receipt', short: 'Receipt', prefix: 'RCT', key: 'F6' },
    PY: { name: 'Payment', short: 'Payment', prefix: 'PMT', key: 'F5' },
    JV: { name: 'Journal', short: 'Journal', prefix: 'JV', key: 'F7' },
    CT: { name: 'Contra', short: 'Contra', prefix: 'CTR', key: 'F4' },
    SJ: { name: 'Production (stock journal)', short: 'Production', prefix: 'PRD', key: 'Alt+F7' }
};
const ITEM_TYPES = ['SI', 'PB', 'CN', 'DN'];
const GST_RATES = [0, 0.25, 3, 5, 18, 40];   // GST 2.0 slabs from 22 Sep 2025 (+ 3% gold, 0.25% rough diamonds)
const UNITS = ['NOS', 'PCS', 'KGS', 'GMS', 'LTR', 'MTR', 'BOX', 'BAG', 'SET', 'PAC', 'HRS', 'OTH'];

// TDS under the Income-tax Act, 2025. Section 393 replaced the old sections with 4-digit payment codes; the return
// (Form 140) reports the payment code. Old 1961 section numbers are kept alongside because everyone still knows them.
// Rates and thresholds as notified for Tax Year 2026-27 — verify against the latest CBDT notification before filing.
const TDS_SECTIONS = {
    '194C-I': { code: '1023', sec: '393(1)', old: '194C', label: 'Contract work – individual / HUF', rate: 1, single: 30000, annual: 100000 },
    '194C-O': { code: '1024', sec: '393(1)', old: '194C', label: 'Contract work – company / firm / LLP', rate: 2, single: 30000, annual: 100000 },
    '194J-P': { code: '1027', sec: '393(1)', old: '194J(b)', label: 'Professional fees', rate: 10, annual: 50000 },
    '194J-T': { code: '1026', sec: '393(1)', old: '194J(a)', label: 'Technical services fees', rate: 2, annual: 50000 },
    '194J-D': { code: '1028', sec: '393(1)', old: '194J', label: 'Director sitting fees / commission', rate: 10, annual: 0 },
    '194I-B': { code: '1009', sec: '393(1)', old: '194I(b)', label: 'Rent – land, building, furniture', rate: 10, single: 50000, annual: 600000 },
    '194I-M': { code: '1008', sec: '393(1)', old: '194I(a)', label: 'Rent – plant, machinery, equipment', rate: 2, single: 50000, annual: 600000 },
    '194H': { code: '1006', sec: '393(1)', old: '194H', label: 'Commission / brokerage', rate: 2, annual: 20000 },
    '194A': { code: '1022', sec: '393(1)', old: '194A', label: 'Interest (other than bank)', rate: 10, annual: 10000 },
    '194R': { code: '1033', sec: '393(1)', old: '194R', label: 'Business perquisite / benefit', rate: 10, annual: 20000 },
    '194T': { code: '1067', sec: '393(3)', old: '194T', label: 'Partner salary / commission / interest', rate: 10, annual: 20000 },
    '194Q': { code: '1031', sec: '393(1)', old: '194Q', label: 'Purchase of goods (above ₹50 lakh)', rate: 0.1, annual: 5000000, excess: true }
};
// TCS under section 394 (old 206C), collected on the sale value including GST.
const TCS_SECTIONS = {
    'scrap': { code: '1073', old: '206C(1)', label: 'Scrap', rate: 1 },
    'minerals': { code: '1074', old: '206C(1)', label: 'Minerals – coal, lignite, iron ore', rate: 1 },
    'liquor': { code: '1068', old: '206C(1)', label: 'Alcoholic liquor for human consumption', rate: 1 },
    'timber': { code: '1071', old: '206C(1)', label: 'Timber (other than forest lease)', rate: 2 },
    'forest': { code: '1072', old: '206C(1)', label: 'Other forest produce', rate: 2 },
    'tendu': { code: '1069', old: '206C(1)', label: 'Tendu leaves', rate: 5 },
    'vehicle': { code: '1075', old: '206C(1F)', label: 'Motor vehicle above ₹10 lakh', rate: 1, single: 1000000 },
    'parking': { code: '1090', old: '206C(1C)', label: 'Parking lot lease / licence', rate: 2 },
    'toll': { code: '1091', old: '206C(1C)', label: 'Toll plaza lease / licence', rate: 2 },
    'mining': { code: '1092', old: '206C(1C)', label: 'Mining / quarrying lease / licence', rate: 2 }
};
const tdsName = (k, short) => { const s = TDS_SECTIONS[k]; return !s ? '' : short ? `${s.code} (${s.old})` : `${s.code} · ${s.old} · ${s.label} · ${s.rate}%`; };
const tcsName = (k, short) => { const s = TCS_SECTIONS[k]; return !s ? '' : short ? `${s.code} (${s.old})` : `${s.code} · ${s.old} · ${s.label} · ${s.rate}%`; };

// ---------- storage ----------
function loadMeta() {
    try { meta = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) { meta = null; }
    meta ||= { users: [], companies: [], audit: [] };
    meta.audit ||= [];
    return meta;
}
function saveMeta() { safeSet(META_KEY, JSON.stringify(meta)); }
function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) {
        console.error(e);
        const bar = document.getElementById('saveWarn');
        if (bar) bar.hidden = false;
        return false;
    }
}
// Company books live in IndexedDB (hundreds of MB) instead of localStorage (5 MB, shared with the STAY BAY and
// Eco Pack dashboards on the same site). Everything is held in memory and written behind, so the code stays simple.
const store = (() => {
    const cache = {};
    let db = null, timer = null;
    const dirty = new Set();
    const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    async function init() {
        try {
            db = await new Promise((res, rej) => { const r = indexedDB.open('wcerp-books', 1); r.onupgradeneeded = () => r.result.createObjectStore('co'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
            const os = db.transaction('co', 'readonly').objectStore('co');
            const [keys, vals] = await Promise.all([req(os.getAllKeys()), req(os.getAll())]);
            keys.forEach((k, i) => { cache[k] = vals[i]; });
        } catch (e) { console.warn('IndexedDB unavailable, using localStorage', e); db = null; }
        // Move books saved by earlier versions out of localStorage
        Object.keys(localStorage).filter(k => k.startsWith('wcerp.co.')).forEach(k => {
            const id = k.slice(9);
            if (!cache[id]) { cache[id] = localStorage.getItem(k); dirty.add(id); }
            if (db) localStorage.removeItem(k);
        });
        await flush();
    }
    async function flush() {
        clearTimeout(timer); timer = null;
        if (!dirty.size) return;
        const ids = [...dirty]; dirty.clear();
        if (!db) { ids.forEach(id => cache[id] == null ? localStorage.removeItem(coKey(id)) : safeSet(coKey(id), cache[id])); return; }
        try {
            const tx = db.transaction('co', 'readwrite'), os = tx.objectStore('co');
            ids.forEach(id => cache[id] == null ? os.delete(id) : os.put(cache[id], id));
            await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
        } catch (e) {
            console.error(e); ids.forEach(id => dirty.add(id));
            const bar = document.getElementById('saveWarn'); if (bar) bar.hidden = false;
        }
    }
    return {
        init, flush,
        get: id => cache[id] ?? (db ? null : localStorage.getItem(coKey(id))),
        put(id, text) { cache[id] = text; dirty.add(id); if (!timer) timer = setTimeout(flush, 250); },
        del(id) { cache[id] = null; dirty.add(id); flush(); },
        ids: () => Object.keys(cache).filter(k => cache[k] != null),
        size: () => Object.values(cache).reduce((n, t) => n + (t ? t.length : 0), 0)
    };
})();
addEventListener('pagehide', () => store.flush());
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.flush(); });

// Bulk mode: imports post hundreds of vouchers; save once at the end instead of after each one.
let bulkDepth = 0;
function inBulk(fn) {
    bulkDepth++;
    try { return fn(); } finally { bulkDepth--; if (!bulkDepth) saveCo(); }
}
function saveCo() {
    if (!co) return;
    ver++;
    if (bulkDepth) return;
    store.put(co.id, JSON.stringify(co));
    const entry = meta.companies.find(c => c.id === co.id);
    if (entry) { entry.name = co.profile.name; entry.gstin = co.profile.gstin; entry.updated = new Date().toISOString(); saveMeta(); }
}
function loadCo(id) {
    try { return JSON.parse(store.get(id) || 'null'); } catch (e) { return null; }
}
function openCompany(id) {
    const data = loadCo(id);
    if (!data) return false;
    co = upgradeCo(data);
    ver++;
    meta.lastCompany = id;
    saveMeta();
    return true;
}

function newCompanyData(profile) {
    const c = {
        id: uid('co'), created: new Date().toISOString(),
        profile: {
            name: '', legalName: '', entity: 'Proprietorship', gstin: '', pan: '', tan: '', state: '33', address: '', city: '', pincode: '',
            phone: '', email: '', booksFrom: `${fyOf(todayISO())}-04-01`, aato: 0, lut: true, bankName: '', bankAcc: '', bankIfsc: '', terms: 'Goods once sold will not be taken back. Interest @18% p.a. on overdue bills.', roundOff: true,
            ...profile
        },
        settings: { lockDate: '', prefixes: Object.fromEntries(Object.entries(VTYPES).map(([k, v]) => [k, v.prefix])) },
        accounts: [], contacts: [], items: [], vouchers: [], series: {}, bankLines: [], gstr2b: [], filings: [], rules: [], audit: []
    };
    SYS_ACCOUNTS.forEach(([sys, name, group]) => c.accounts.push({ id: uid('acc'), sys, name, group, openDr: 0, openCr: 0 }));
    return c;
}
function upgradeCo(c) {
    ['accounts', 'contacts', 'items', 'vouchers', 'bankLines', 'gstr2b', 'filings', 'rules', 'audit', 'employees'].forEach(k => { c[k] ||= []; });
    c.payroll ||= {}; c.links ||= {};
    c.series ||= {};
    c.vouchers.forEach(v => { if (v.tdsMonth && !v.taxMonth) { v.taxMonth = v.tdsMonth; delete v.tdsMonth; } });
    c.settings ||= { lockDate: '', prefixes: {} };
    SYS_ACCOUNTS.forEach(([sys, name, group]) => { if (!c.accounts.some(a => a.sys === sys)) c.accounts.push({ id: uid('acc'), sys, name, group, openDr: 0, openCr: 0 }); });
    // The sample trading company is never connected to STAY BAY / Eco Pack; they have their own companies
    if ((c.profile.sample || c.audit.some(a => a.action === 'Sample data loaded')) && Object.keys(c.links).length) c.links = {};
    return c;
}

// ---------- lookups ----------
const sysAcc = key => co.accounts.find(a => a.sys === key);
const sysId = key => sysAcc(key)?.id;
const accById = id => co.accounts.find(a => a.id === id);
const contactById = id => co.contacts.find(c => c.id === id);
const itemById = id => co.items.find(i => i.id === id);
const vById = id => co.vouchers.find(v => v.id === id);
// A "ledger" is an account or a contact (each customer / vendor is its own ledger)
function ledgerOf(id) {
    const a = accById(id);
    if (a) return { id, name: a.name, group: a.group, openDr: a.openDr || 0, openCr: a.openCr || 0, kind: 'account', ref: a };
    const c = contactById(id);
    if (c) return { id, name: c.name, group: c.type === 'vendor' ? 'creditors' : 'debtors', openDr: c.openDr || 0, openCr: c.openCr || 0, kind: 'contact', ref: c };
    return null;
}
const allLedgers = () => [...co.accounts.map(a => ledgerOf(a.id)), ...co.contacts.map(c => ledgerOf(c.id))];
const cashBankAccounts = () => co.accounts.filter(a => a.group === 'bank' || a.group === 'cash');
const isRegistered = c => Boolean(c && c.gstin && gstinValid(c.gstin));
const companyState = () => co.profile.state || (co.profile.gstin || '').slice(0, 2);

// ---------- roles ----------
const ROLES = { admin: 'Owner / Admin', accountant: 'Accountant', auditor: 'Auditor (read-only)' };
const canEdit = () => me && me.role !== 'auditor';
const isAdmin = () => me && me.role === 'admin';
function assertEdit() { if (!canEdit()) throw new Error('Your role is read-only. Auditors can view everything and raise queries, but cannot change entries.'); }

// ---------- audit trail: append-only, hash-chained, cannot be switched off ----------
// Companies (Accounts) Rules 2014, Rule 3(1): every change is logged with date, user, old and new values.
function auditPush(chain, action, o = {}) {
    const prev = chain.length ? chain[chain.length - 1].hash : 'GENESIS';
    const e = {
        seq: chain.length + 1, at: new Date().toISOString(), user: me ? me.name : 'System', role: me ? me.role : '',
        action, entity: o.entity || '', ref: o.ref || '', before: o.before ?? '', after: o.after ?? '', reason: o.reason || ''
    };
    e.prev = prev;
    e.hash = sha256(prev + JSON.stringify([e.seq, e.at, e.user, e.role, e.action, e.entity, e.ref, e.before, e.after, e.reason]));
    chain.push(e);
    return e;
}
function audit(action, o) { const e = auditPush(co.audit, action, o); return e; }
function auditMeta(action, o) { auditPush(meta.audit, action, o); saveMeta(); }
function verifyChain(chain) {
    let prev = 'GENESIS';
    for (let i = 0; i < chain.length; i++) {
        const e = chain[i];
        const h = sha256(prev + JSON.stringify([e.seq, e.at, e.user, e.role, e.action, e.entity, e.ref, e.before, e.after, e.reason]));
        if (e.prev !== prev || e.hash !== h || e.seq !== i + 1) return { ok: false, at: i + 1 };
        prev = e.hash;
    }
    return { ok: true, count: chain.length };
}
const summarize = v => v ? `${v.date} · ${ledgerOf(v.partyId || v.ledgerId || v.accountId)?.name || ''} · ${num(v.totals?.total ?? v.amount ?? 0)}${v.status === 'cancelled' ? ' · CANCELLED' : ''}` : '';
function diffFields(a, b, keys) {
    return keys.filter(k => JSON.stringify(a[k] ?? '') !== JSON.stringify(b[k] ?? '')).map(k => {
        const show = x => typeof x === 'object' ? (Array.isArray(x) ? `${x.length} line(s)` : JSON.stringify(x)) : String(x ?? '');
        return `${k}: ${show(a[k])} → ${show(b[k])}`;
    }).join('; ');
}

// ---------- GST calculation ----------
// Decides intra-state (CGST+SGST) vs inter-state (IGST) and zero-rating, then fills every line and the totals.
function supplyKind(v) {
    const party = contactById(v.partyId);
    if (!party) return 'B2C';
    if (party.state === '96') return 'EXP';
    if (party.sez) return 'SEZ';
    return isRegistered(party) ? 'B2B' : 'B2C';
}
function computeVoucher(v) {
    if (!ITEM_TYPES.includes(v.type)) {
        if (v.type === 'SJ') { v.totals = { total: 0 }; return v; }
        if (v.type === 'JV') v.totals = { total: sum(v.jlines || [], 'dr') };
        else v.totals = { total: r2(v.amount) + r2(v.tds?.amount || 0) };
        return v;
    }
    const party = contactById(v.partyId);
    const purchaseSide = v.type === 'PB' || v.type === 'DN';
    const kind = supplyKind(v);
    const cs = companyState();
    const zeroRated = !purchaseSide && (kind === 'EXP' || kind === 'SEZ');
    const withPay = zeroRated && v.zeroWithPay;
    let pos = v.pos || (purchaseSide ? cs : (kind === 'EXP' ? '96' : party?.state || cs));
    v.pos = pos;
    v.kind = kind;
    const supplierState = purchaseSide ? (party?.state || cs) : cs;
    const inter = zeroRated || supplierState !== pos;
    // An unregistered supplier cannot charge GST; only notified reverse-charge supplies carry tax (paid by us).
    const composition = co.profile.gstType === 'composition';
    const noTax = (purchaseSide && !isRegistered(party) && !v.rcm) || (!purchaseSide && composition);
    // Composition dealers and businesses whose supplies carry no input credit (e.g. hotel rooms up to ₹7,500, restaurants)
    if (purchaseSide && (composition || (co.profile.itcPolicy === 'none' && v.date >= (co.profile.itcPolicyFrom || '')))) v.itc = false;
    const t = { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, qty: 0 };
    (v.lines || []).forEach(l => {
        const gross = r2((Number(l.qty) || 0) * (Number(l.rate) || 0));
        l.discAmt = r2(gross * (Number(l.disc) || 0) / 100);
        l.taxable = r2(gross - l.discAmt);
        // Food-app orders (the app pays GST, s.9(5)) and services where the customer pays under reverse charge carry no tax on our bill
        const it = !purchaseSide && itemById(l.itemId);
        l.eco95 = Boolean(it?.eco95) || undefined;
        l.rcmOut = Boolean(it?.rcmOut && isRegistered(party)) || undefined;
        const rate = noTax || (zeroRated && !withPay) || l.eco95 || l.rcmOut ? 0 : Number(l.gstRate) || 0;
        l.cgst = l.sgst = l.igst = 0;
        if (inter) l.igst = r2(l.taxable * rate / 100);
        else { l.cgst = r2(l.taxable * rate / 200); l.sgst = l.cgst; }
        l.effRate = rate;
        l.amount = r2(l.taxable + (v.rcm ? 0 : l.cgst + l.sgst + l.igst));
        t.taxable += l.taxable; t.cgst += l.cgst; t.sgst += l.sgst; t.igst += l.igst; t.qty += Number(l.qty) || 0;
    });
    Object.keys(t).forEach(k => { t[k] = r2(t[k]); });
    t.tax = r2(t.cgst + t.sgst + t.igst);
    const raw = r2(t.taxable + (v.rcm ? 0 : t.tax));
    t.total = co.profile.roundOff ? Math.round(raw) : raw;
    t.roundOff = r2(t.total - raw);
    t.inter = inter;
    // TDS is deducted on the value excluding GST (CBDT Circular 23/2017).
    if (v.type === 'PB' && v.tds?.section) {
        const s = TDS_SECTIONS[v.tds.section];
        const pan = party?.pan;
        v.tds.rate = !pan ? (v.tds.section === '194Q' ? 5 : 20) : s.rate;
        let base = t.taxable;
        if (s.excess) {
            const before = tdsAggregate(v.partyId, v.tds.section, fyOf(v.date), v.id);
            base = Math.max(0, Math.min(t.taxable, before + t.taxable - s.annual));
        }
        v.tds.base = r2(base);
        v.tds.amount = Math.round(base * v.tds.rate / 100);
    } else if (v.type === 'PB') v.tds = null;
    t.payable = r2(t.total - (v.tds?.amount || 0));
    // TCS is collected on the whole sale value including GST (section 394, old 206C)
    if (v.type === 'SI' && v.tcs?.section && TCS_SECTIONS[v.tcs.section]) {
        const s = TCS_SECTIONS[v.tcs.section];
        v.tcs.rate = party?.pan ? s.rate : Math.max(5, s.rate * 2);   // no PAN: twice the rate or 5%, whichever is higher
        v.tcs.base = s.single && t.total <= s.single ? 0 : t.total;
        v.tcs.amount = Math.round(v.tcs.base * v.tcs.rate / 100);
        if (!v.tcs.amount) v.tcs = null;
    } else if (v.type === 'SI') v.tcs = null;
    t.receivable = r2(t.total + (v.tcs?.amount || 0));
    v.totals = t;
    return v;
}
function tdsAggregate(partyId, section, fy, excludeId) {
    return sum(co.vouchers.filter(x => x.type === 'PB' && x.status !== 'cancelled' && x.partyId === partyId && x.tds?.section === section && fyOf(x.date) === fy && x.id !== excludeId), x => x.totals.taxable);
}
// Should TDS apply to this bill? (single-bill limit or the year's total crosses the threshold)
function tdsSuggested(v) {
    const party = contactById(v.partyId);
    const sec = party?.tdsSection;
    if (!sec || !TDS_SECTIONS[sec]) return null;
    const s = TDS_SECTIONS[sec];
    const prior = tdsAggregate(v.partyId, sec, fyOf(v.date || todayISO()), v.id);
    const amt = v.totals?.taxable || 0;
    return (s.single && amt > s.single) || prior + amt > s.annual ? sec : null;
}

// ---------- postings (double entry) ----------
function postingsOf(v) {
    if (v.status === 'cancelled') return [];
    const P = [];
    const add = (acc, dr, cr) => { dr = r2(dr); cr = r2(cr); if (acc && (dr || cr)) P.push({ acc, dr, cr }); };
    const t = v.totals || {};
    const byAcc = side => {
        const m = {};
        (v.lines || []).forEach(l => {
            const it = itemById(l.itemId);
            const acc = l.accId || (side === 'sale' ? (it?.salesAcc || (it?.type === 'service' ? sysId('salesSvc') : sysId('sales'))) : (it?.purchaseAcc || sysId('purchase')));
            m[acc] = (m[acc] || 0) + l.taxable + (side === 'buy' && v.itc === false ? l.cgst + l.sgst + l.igst : 0);
        });
        return m;
    };
    switch (v.type) {
        case 'SI': case 'CN': {
            const s = v.type === 'SI' ? 1 : -1;
            const leg = (acc, amt) => s > 0 ? add(acc, 0, amt) : add(acc, amt, 0);
            s > 0 ? add(v.partyId, t.total + (v.tcs?.amount || 0), 0) : add(v.partyId, 0, t.total);
            if (s > 0 && v.tcs?.amount) add(sysId('tcsPay'), 0, v.tcs.amount);
            Object.entries(byAcc('sale')).forEach(([acc, amt]) => leg(acc, amt));
            leg(sysId('outCgst'), t.cgst); leg(sysId('outSgst'), t.sgst); leg(sysId('outIgst'), t.igst);
            // Round-off: rounding up is extra income (credit), rounding down an expense (debit); reversed on a credit note
            if (t.roundOff) { const amt = t.roundOff * s; amt > 0 ? add(sysId('roundOff'), 0, amt) : add(sysId('roundOff'), -amt, 0); }
            break;
        }
        case 'PB': case 'DN': {
            const s = v.type === 'PB' ? 1 : -1;
            const dr = (acc, amt) => s > 0 ? add(acc, amt, 0) : add(acc, 0, amt);
            const cr = (acc, amt) => s > 0 ? add(acc, 0, amt) : add(acc, amt, 0);
            Object.entries(byAcc('buy')).forEach(([acc, amt]) => dr(acc, amt));
            if (v.itc !== false) { dr(sysId('inCgst'), t.cgst); dr(sysId('inSgst'), t.sgst); dr(sysId('inIgst'), t.igst); }
            if (v.rcm) cr(sysId('rcmPay'), t.tax);
            cr(v.partyId, t.total - (v.tds?.amount || 0));
            if (v.tds?.amount) cr(sysId('tdsPay'), v.tds.amount);
            if (t.roundOff > 0) dr(sysId('roundOff'), t.roundOff);
            if (t.roundOff < 0) cr(sysId('roundOff'), -t.roundOff);
            break;
        }
        case 'RC':
            add(v.accountId, v.amount, 0);
            if (v.tds?.amount) add(sysId('tdsRec'), v.tds.amount, 0);
            add(v.partyId || v.ledgerId, 0, r2(v.amount + (v.tds?.amount || 0)));
            break;
        case 'PY':
            add(v.partyId || v.ledgerId, v.amount, 0);
            add(v.accountId, 0, v.amount);
            break;
        case 'CT':
            add(v.toId, v.amount, 0);
            add(v.accountId, 0, v.amount);
            break;
        case 'JV':
            (v.jlines || []).forEach(l => add(l.acc, l.dr, l.cr));
            break;
    }
    return P;
}

// Ledger book: every posting by ledger, cached until data changes.
let bookCache = { ver: -1 };
function book() {
    if (bookCache.ver === ver && bookCache.co === co.id) return bookCache;
    const entries = new Map();
    const sorted = [...co.vouchers].sort((a, b) => a.date.localeCompare(b.date) || (a.created || '').localeCompare(b.created || ''));
    sorted.forEach(v => postingsOf(v).forEach(p => {
        if (!entries.has(p.acc)) entries.set(p.acc, []);
        entries.get(p.acc).push({ date: v.date, vid: v.id, dr: p.dr, cr: p.cr });
    }));
    bookCache = { ver, co: co.id, entries, sorted };
    return bookCache;
}
// Balance as Dr-positive number, for postings dated from..to (inclusive). Opening balances count when from is empty.
function balance(id, to = '9999-12-31', from = '') {
    const L = ledgerOf(id);
    if (!L) return 0;
    let b = from ? 0 : (L.openDr - L.openCr);
    (book().entries.get(id) || []).forEach(e => { if (e.date <= to && (!from || e.date >= from)) b += e.dr - e.cr; });
    return r2(b);
}
const balanceBefore = (id, date) => balance(id, addDays(date, -1));
const groupBalance = (groups, to, from) => sum(allLedgers().filter(l => groups.includes(l.group)), l => balance(l.id, to, from));

// ---------- bills outstanding ----------
function billDue(v) { return v.type === 'PB' ? v.totals.payable : v.type === 'SI' ? (v.totals.receivable ?? v.totals.total) : v.totals.total; }
function settledAgainst(billId, excludeVid) {
    let s = 0;
    co.vouchers.forEach(x => {
        if (x.status === 'cancelled' || x.id === excludeVid) return;
        (x.alloc || []).forEach(a => { if (a.vid === billId) s += Number(a.amt) || 0; });
        if ((x.type === 'CN' || x.type === 'DN') && x.origId === billId) s += x.totals.total;
    });
    return r2(s);
}
const outstanding = (v, excludeVid) => r2(billDue(v) - settledAgainst(v.id, excludeVid));
function openBills(partyId, type, excludeVid) {
    return co.vouchers.filter(v => v.partyId === partyId && v.type === type && v.status !== 'cancelled')
        .map(v => ({ v, due: outstanding(v, excludeVid) })).filter(x => x.due > 0.009).sort((a, b) => a.v.date.localeCompare(b.v.date));
}
const dueDate = v => addDays(v.date, Number(contactById(v.partyId)?.creditDays) || 0);

// ---------- stock (moving weighted average cost, AS 2) ----------
// Events are applied in date order. Purchases set the average; sales and consumption take stock out at the average;
// a production entry (SJ) moves the cost of what was consumed into what was produced.
const stockCache = new Map();
function stockAt(date) {
    const key = `${ver}|${co.id}|${date}`;
    if (stockCache.has(key)) return stockCache.get(key);
    if (stockCache.size > 60) stockCache.clear();
    const res = {};
    co.items.filter(i => i.type === 'goods' && i.trackStock !== false).forEach(i => {
        const q = Number(i.openQty) || 0, val = Number(i.openValue) || 0;
        res[i.id] = { qty: q, val, avg: q > 0 ? val / q : 0, kind: i.kind || 'trading' };
    });
    const out = (r, q) => { const a = r.avg; r.qty -= q; r.val = r.qty > 0 ? r.val - q * a : 0; if (r.qty <= 0) r.val = 0; return q * a; };
    const inn = (r, q, val) => { r.qty += q; r.val += val; r.avg = r.qty > 0 ? r.val / r.qty : r.avg; };
    co.vouchers.filter(v => v.status !== 'cancelled' && v.date <= date && (ITEM_TYPES.includes(v.type) || v.type === 'SJ'))
        .sort((a, b) => a.date.localeCompare(b.date) || (a.created || '').localeCompare(b.created || ''))
        .forEach(v => {
            if (v.type === 'SJ') {
                let cost = sum(v.costs || [], c => Number(c.amt) || 0);
                (v.consume || []).forEach(l => { const r = res[l.itemId]; if (r) cost += out(r, Number(l.qty) || 0); });
                const outs = (v.produce || []).filter(l => res[l.itemId]);
                const w = outs.reduce((s2, l) => s2 + (Number(l.qty) || 0) * (Number(l.weight) || 1), 0);
                outs.forEach(l => inn(res[l.itemId], Number(l.qty) || 0, w ? cost * (Number(l.qty) || 0) * (Number(l.weight) || 1) / w : 0));
                return;
            }
            (v.lines || []).forEach(l => {
                const r = res[l.itemId];
                if (!r) return;
                const q = Number(l.qty) || 0;
                if (v.type === 'PB') inn(r, q, l.taxable + (v.itc === false ? l.cgst + l.sgst + l.igst : 0));
                if (v.type === 'DN') { r.qty -= q; r.val = Math.max(0, r.val - l.taxable); r.avg = r.qty > 0 ? r.val / r.qty : r.avg; }
                if (v.type === 'SI') out(r, q);
                if (v.type === 'CN') inn(r, q, q * r.avg);
            });
        });
    let value = 0;
    const byKind = { raw: 0, finished: 0, trading: 0 };
    Object.values(res).forEach(r => { r.value = r2(Math.max(0, r.val)); value += r.value; byKind[r.kind] = (byKind[r.kind] || 0) + r.value; });
    const result = { items: res, value: r2(value), byKind };
    stockCache.set(key, result);
    return result;
}
const openingStockValue = () => sum(co.items.filter(i => i.type === 'goods'), i => Number(i.openValue) || 0);
function stockValueAt(date, kind) {
    if (date < co.profile.booksFrom) return kind ? sum(co.items.filter(i => i.type === 'goods' && (i.kind || 'trading') === kind), i => Number(i.openValue) || 0) : openingStockValue();
    return kind ? r2(stockAt(date).byKind[kind] || 0) : stockAt(date).value;
}
const isManufacturer = () => co.items.some(i => i.kind === 'raw');

// ---------- financial statements (Schedule III, Division I – Accounting Standards) ----------
function plData(from, to) {
    const L = allLedgers();
    const line = s3 => L.filter(l => GROUPS[l.group]?.s3 === s3).map(l => ({ l, amt: r2(-balance(l.id, to, from)) })).filter(x => Math.abs(x.amt) > 0.004);
    const exp = s3 => line(s3).map(x => ({ ...x, amt: -x.amt }));
    const revenue = line('rev_ops'), other = line('other_income');
    const purchases = exp('exp_purchase'), employee = exp('exp_employee'), finance = exp('exp_finance'), dep = exp('exp_dep'), otherExp = exp('exp_other'), tax = exp('exp_tax');
    const openStock = stockValueAt(addDays(from, -1)), closeStock = stockValueAt(to);
    const tot = list => sum(list, 'amt');
    const totalIncome = r2(tot(revenue) + tot(other));
    const changeInv = r2(openStock - closeStock);
    const totalExp = r2(tot(purchases) + changeInv + tot(employee) + tot(finance) + tot(dep) + tot(otherExp));
    const pbt = r2(totalIncome - totalExp);
    const pat = r2(pbt - tot(tax));
    // Manufacturer (raw materials marked as such): Schedule III shows cost of materials consumed separately
    // from the change in finished goods. The total is the same.
    const mfg = isManufacturer();
    const rawOpen = mfg ? stockValueAt(addDays(from, -1), 'raw') : 0, rawClose = mfg ? stockValueAt(to, 'raw') : 0;
    const materials = r2(tot(purchases) + rawOpen - rawClose);
    const changeFg = r2(changeInv - (rawOpen - rawClose));
    return { from, to, revenue, other, purchases, employee, finance, dep, otherExp, tax, openStock, closeStock, changeInv, totalIncome, totalExp, pbt, pat, tot, mfg, rawOpen, rawClose, materials, changeFg };
}
const profitBetween = (from, to) => plData(from, to).pat;

function bsData(asOn) {
    const fy = fyOf(asOn);
    const fyFrom = fyStart(fy) < co.profile.booksFrom ? co.profile.booksFrom : fyStart(fy);
    const currentProfit = profitBetween(fyFrom, asOn);
    const priorProfit = fyFrom > co.profile.booksFrom ? profitBetween(co.profile.booksFrom, addDays(fyFrom, -1)) : 0;
    const lines = {};
    const push = (k, name, amt) => { (lines[k] ||= []).push({ name, amt: r2(amt) }); };
    allLedgers().forEach(l => {
        const g = GROUPS[l.group];
        if (!g || g.nature === 'I' || g.nature === 'E') return;
        const b = balance(l.id, asOn);          // Dr positive
        if (Math.abs(b) < 0.005) return;
        let k = g.s3;
        // A ledger on the "wrong" side is shown where it belongs (advance from a customer is a liability, etc.)
        if (g.nature === 'L' && b > 0) k = l.group === 'creditors' ? 'ca_loans' : 'ca_other';
        if (g.nature === 'A' && b < 0) k = l.group === 'bank' ? 'cl_borrow' : (l.group === 'debtors' ? 'cl_other' : 'cl_other');
        const isAsset = k.startsWith('ca_') || k.startsWith('nca_');
        push(k, l.name, isAsset ? b : -b);
    });
    const stock = stockValueAt(asOn);
    if (stock) push('ca_inventory', 'Stock-in-trade (weighted average cost)', stock);
    push('equity_reserves', 'Surplus in Profit & Loss — earlier years', priorProfit);
    push('equity_reserves', 'Profit / (Loss) for the current year', currentProfit);
    // Opening balance difference (only when opening entries do not tally)
    const diff = openingDifference();
    if (Math.abs(diff) > 0.004) push('equity_reserves', 'Difference in opening balances', -diff);
    const tot = k => sum(lines[k] || [], 'amt');
    const equity = r2(tot('equity_capital') + tot('equity_reserves'));
    const ncl = tot('ncl_borrow');
    const cl = r2(tot('cl_borrow') + tot('cl_payables') + tot('cl_other') + tot('cl_prov'));
    const nca = r2(tot('nca_ppe') + tot('nca_invest'));
    const ca = r2(tot('ca_inventory') + tot('ca_receivables') + tot('ca_cash') + tot('ca_loans') + tot('ca_other'));
    // MSME split of trade payables (Schedule III requires dues to micro & small enterprises separately)
    const msme = sum(co.contacts.filter(c => c.msme && c.type !== 'customer'), c => Math.max(0, -balance(c.id, asOn)));
    return { asOn, lines, tot, equity, ncl, cl, nca, ca, totalEL: r2(equity + ncl + cl), totalA: r2(nca + ca), currentProfit, msme, stock };
}
function openingDifference() {
    const dr = sum(allLedgers(), l => l.openDr) + openingStockValue();
    const cr = sum(allLedgers(), l => l.openCr);
    return r2(dr - cr);
}

// Cash flow statement, indirect method (AS 3 / Ind AS 7)
function cashFlowData(from, to) {
    const pl = plData(from, to);
    const mv = l => r2(-balance(l.id, to, from)); // credit movement in the period = cash inflow effect
    const L = allLedgers().filter(l => GROUPS[l.group] && ['A', 'L'].includes(GROUPS[l.group].nature));
    const pick = cf => L.filter(l => GROUPS[l.group].cf === cf).map(l => ({ name: l.name, group: l.group, amt: mv(l) })).filter(x => Math.abs(x.amt) > 0.004);
    const depTotal = pl.tot(pl.dep), finTotal = pl.tot(pl.finance), taxTotal = pl.tot(pl.tax);
    const wcGroups = {};
    pick('wc').forEach(x => { wcGroups[x.group] = r2((wcGroups[x.group] || 0) + x.amt); });
    const stockChange = r2(pl.openStock - pl.closeStock);
    const wc = [
        ...Object.entries(wcGroups).map(([g, amt]) => ({ name: `${amt >= 0 ? (GROUPS[g].nature === 'A' ? 'Decrease' : 'Increase') : (GROUPS[g].nature === 'A' ? 'Increase' : 'Decrease')} in ${GROUPS[g].name}`, amt })),
        { name: stockChange >= 0 ? 'Decrease in inventories' : 'Increase in inventories', amt: stockChange }
    ].filter(x => Math.abs(x.amt) > 0.004);
    const opBeforeWc = r2(pl.pbt + depTotal + finTotal);
    const cashGenerated = r2(opBeforeWc + sum(wc, 'amt'));
    const operating = r2(cashGenerated - taxTotal);
    const fixedMv = sum(pick('inv').filter(x => x.group === 'fixed'), 'amt');
    const investing = [
        { name: 'Purchase of property, plant & equipment (net)', amt: r2(fixedMv - depTotal) },
        ...pick('inv').filter(x => x.group !== 'fixed').map(x => ({ name: `${x.amt < 0 ? 'Purchase' : 'Sale'} of ${x.name}`, amt: x.amt }))
    ].filter(x => Math.abs(x.amt) > 0.004);
    const financing = [
        ...pick('fin').map(x => ({ name: `${x.amt >= 0 ? 'Proceeds / introduction' : 'Repayment / withdrawal'}: ${x.name}`, amt: x.amt })),
        ...(finTotal ? [{ name: 'Finance costs paid', amt: -finTotal }] : [])
    ].filter(x => Math.abs(x.amt) > 0.004);
    const inv = sum(investing, 'amt'), fin = sum(financing, 'amt');
    const net = r2(operating + inv + fin);
    const cashLedgers = allLedgers().filter(l => GROUPS[l.group]?.cf === 'cash');
    const openCash = sum(cashLedgers, l => from <= co.profile.booksFrom ? (l.openDr - l.openCr) : balance(l.id, addDays(from, -1)));
    const closeCash = sum(cashLedgers, l => balance(l.id, to));
    return { from, to, pl, depTotal, finTotal, taxTotal, opBeforeWc, wc, cashGenerated, operating, investing, financing, inv, fin, net, openCash, closeCash, check: r2(openCash + net - closeCash) };
}

// ---------- numbering (gap-free, per financial year, per series) ----------
function nextNumber(type, date) {
    const fy = fyOf(date);
    const key = `${type}:${fy}`;
    const n = (co.series[key] || 0) + 1;
    return { key, n, no: `${co.settings.prefixes[type] || VTYPES[type].prefix}/${fyShort(fy)}/${String(n).padStart(4, '0')}` };
}
function previewNumber(type, date) { return nextNumber(type, date || todayISO()).no; }

// ---------- validation + save (single doorway for every voucher, from forms, OCR and sample data) ----------
function filedPeriod(type, date) {
    const ym = ymOf(date);
    const ret = ['SI', 'CN', 'DN'].includes(type) ? 'GSTR-1' : type === 'PB' ? 'GSTR-3B' : null;
    // A quarterly (QRMP) return covers all three months of its quarter
    return ret && co.filings.some(f => f.type === ret && (f.period === ym || f.period === `${quarterOf(ym)}-${fyOf(date)}`)) ? ret : null;
}
function validateVoucher(v, old) {
    const E = [];
    const p = co.profile;
    const party = contactById(v.partyId);
    if (!v.date) E.push('Date is required.');
    else {
        if (v.date < p.booksFrom) E.push(`Date is before the books start date (${fmtDate(p.booksFrom)}).`);
        if (co.settings.lockDate && v.date <= co.settings.lockDate) E.push(`Books are locked up to ${fmtDate(co.settings.lockDate)}.`);
        if (old && old.date <= (co.settings.lockDate || '')) E.push('This entry is in a locked period.');
        if (old && fyOf(old.date) !== fyOf(v.date)) E.push('The date cannot move to another financial year (the number belongs to its year). Cancel and re-enter instead.');
        if (v.type === 'SI' && v.date > todayISO()) E.push('A tax invoice cannot be dated in the future.');
        const filed = filedPeriod(v.type, v.date) || (old && filedPeriod(old.type, old.date));
        if (filed) E.push(`${filed} for ${ymLabel(ymOf(old?.date || v.date))} is already filed. Correct it with a credit / debit note or GSTR-1A instead of editing.`);
    }
    if (ITEM_TYPES.includes(v.type)) {
        if (!party) E.push('Choose the party.');
        if (!(v.lines || []).length) E.push('Add at least one line.');
        const hsnMin = (Number(p.aato) || 0) > 50000000 ? 6 : 4;
        (v.lines || []).forEach((l, i) => {
            if (!(Number(l.qty) > 0)) E.push(`Line ${i + 1}: quantity must be more than zero.`);
            if (!(Number(l.rate) >= 0)) E.push(`Line ${i + 1}: rate cannot be negative.`);
            if (!l.desc && !l.itemId) E.push(`Line ${i + 1}: choose an item or type a description.`);
            if ((v.type === 'SI' || v.type === 'CN') && (!hsnValid(l.hsn) || String(l.hsn).length < hsnMin)) E.push(`Line ${i + 1}: HSN/SAC must be at least ${hsnMin} digits (Notification 78/2020).`);
            if (!GST_RATES.includes(Number(l.gstRate))) E.push(`Line ${i + 1}: GST rate ${l.gstRate}% is not a current GST rate.`);
        });
        if (v.type === 'PB') {
            if (!v.refNo) E.push("Enter the supplier's invoice number.");
            const dup = co.vouchers.find(x => x.type === 'PB' && x.id !== v.id && x.status !== 'cancelled' && x.partyId === v.partyId && normInv(x.refNo) === normInv(v.refNo) && fyOf(x.date) === fyOf(v.date));
            if (dup && v.refNo) E.push(`Supplier invoice ${v.refNo} is already entered as ${dup.no}.`);
            if (v.rcm && !(v.lines || []).some(l => Number(l.gstRate) > 0)) E.push('Reverse charge needs a GST rate on the lines.');
        }
        if (v.type === 'CN' || v.type === 'DN') {
            const orig = vById(v.origId);
            if (isRegistered(party) && !orig) E.push(`Link the original ${v.type === 'CN' ? 'invoice' : 'bill'} (needed for GSTR-1 / ITC).`);
            if (orig && orig.partyId !== v.partyId) E.push('The original document belongs to another party.');
            if (orig && v.type === 'CN') {
                const limit = `${fyOf(orig.date) + 1}-11-30`;
                if (v.date > limit) E.push(`A GST credit note for this invoice had to be issued by ${fmtDate(limit)} (Section 34(2)).`);
            }
            if (orig) {
                computeVoucher(v);
                const room = outstanding(orig, v.id) + (old ? 0 : 0);
                if (v.totals.total > billDue(orig) + 0.01) E.push(`The note (${inr(v.totals.total)}) is more than the original document (${inr(billDue(orig))}).`);
                else if (v.totals.total > room + 0.01) E.push(`Only ${inr(room)} is still open on ${orig.no}.`);
            }
        }
    } else if (v.type === 'RC' || v.type === 'PY') {
        const acc = accById(v.accountId);
        if (!acc || !['bank', 'cash'].includes(acc.group)) E.push('Choose the cash or bank account.');
        if (!v.partyId && !v.ledgerId) E.push(v.type === 'RC' ? 'Choose who paid you (party or ledger).' : 'Choose who you paid (party or ledger).');
        if (!(Number(v.amount) > 0)) E.push('Amount must be more than zero.');
        if (v.type === 'PY' && [sysId('tdsPay'), sysId('tcsPay')].includes(v.ledgerId)) {
            if (!v.taxMonth) E.push('Choose the month this TDS / TCS deposit is for.');
            if (v.challan?.bsr && !/^\d{7}$/.test(v.challan.bsr)) E.push('BSR code must be 7 digits.');
            if (v.challan?.serial && !/^\d{1,5}$/.test(v.challan.serial)) E.push('Challan serial number must be up to 5 digits.');
        }
        if (v.type === 'RC' && acc?.group === 'cash' && Number(v.amount) >= 200000) E.push('Cash receipts of ₹2,00,000 or more from one person are prohibited (Income-tax Act 2025, carried over from section 269ST). Use a bank receipt.');
        const alloc = sum(v.alloc || [], x => Number(x.amt) || 0);
        if (alloc > r2(Number(v.amount) + (v.tds?.amount || 0)) + 0.01) E.push('Amount allocated to bills is more than the amount.');
        (v.alloc || []).forEach(a => {
            const b = vById(a.vid);
            if (b && Number(a.amt) > outstanding(b, v.id) + 0.01) E.push(`${b.no}: only ${inr(outstanding(b, v.id))} is open.`);
        });
    } else if (v.type === 'CT') {
        const a = accById(v.accountId), b = accById(v.toId);
        if (!a || !b || !['bank', 'cash'].includes(a.group) || !['bank', 'cash'].includes(b.group)) E.push('Contra moves money between cash and bank accounts only.');
        if (v.accountId === v.toId) E.push('From and To must be different.');
        if (!(Number(v.amount) > 0)) E.push('Amount must be more than zero.');
    } else if (v.type === 'SJ') {
        const goods = id => { const it = itemById(id); return it && it.type === 'goods' && it.trackStock !== false; };
        if (!(v.produce || []).some(l => goods(l.itemId) && Number(l.qty) > 0)) E.push('Add at least one item produced.');
        if (!(v.consume || []).some(l => goods(l.itemId) && Number(l.qty) > 0)) E.push('Add at least one material consumed.');
        [...(v.consume || []), ...(v.produce || [])].forEach(l => { if (!goods(l.itemId)) E.push('Production can only use stock items.'); if (!(Number(l.qty) > 0)) E.push('Quantities must be more than zero.'); });
    } else if (v.type === 'JV') {
        const L = (v.jlines || []).filter(l => l.acc && (Number(l.dr) || Number(l.cr)));
        if (L.length < 2) E.push('A journal needs at least two lines.');
        if (L.some(l => Number(l.dr) && Number(l.cr))) E.push('A line cannot have both debit and credit.');
        const d = sum(L, l => Number(l.dr) || 0), c = sum(L, l => Number(l.cr) || 0);
        if (Math.abs(d - c) > 0.004) E.push(`Debits (${inr(d)}) and credits (${inr(c)}) must be equal.`);
        if (!v.narration) E.push('A journal needs a narration explaining it.');
    }
    if (old?.irn && !old.irnCancelled) E.push('This invoice has an IRN. Cancel the e-invoice (within 24 hours) or issue a credit note.');
    return E;
}
// Warnings that do not stop a save but must be seen.
function voucherWarnings(v) {
    const W = [];
    const acc = accById(v.accountId);
    if (v.type === 'PY' && acc?.group === 'cash' && Number(v.amount) > 10000) W.push('Cash payments above ₹10,000 to one person in a day are disallowed as an expense (carried over from section 40A(3)).');
    if (v.type === 'PB') {
        const s = tdsSuggested(v);
        if (s && !v.tds?.section) W.push(`TDS payment code ${tdsName(s, true)} looks applicable for this supplier (threshold crossed). Not deducting it makes 30% of the expense disallowable.`);
        const party = contactById(v.partyId);
        if (party?.msme) W.push(`${party.name} is an MSME: pay within ${Math.min(45, Number(party.creditDays) || 45)} days or the expense is disallowed until paid (MSMED Act section 15).`);
    }
    if (v.type === 'SI' && co.profile.aato >= 50000000 && isRegistered(contactById(v.partyId))) W.push('e-Invoicing applies: generate the IRN after saving.');
    // Journal: debit and credit must agree
    if (v.type === 'JV') {
        const d = sum(v.jlines || [], l => Number(l.dr) || 0), c = sum(v.jlines || [], l => Number(l.cr) || 0);
        if (Math.abs(d - c) > 0.004) W.push(`${d > c ? 'Debit' : 'Credit'} exceeds ${d > c ? 'credit' : 'debit'} by ${inr(Math.abs(d - c))}. Add ${inr(Math.abs(d - c))} on the ${d > c ? 'credit' : 'debit'} side before saving.`);
    }
    // Money going out must not exceed what is in cash / bank
    const outflows = {};
    if (['PY', 'CT'].includes(v.type) && v.accountId) outflows[v.accountId] = Number(v.amount) || 0;
    if (v.type === 'JV') (v.jlines || []).forEach(l => { const a = accById(l.acc); if (a && ['cash', 'bank'].includes(a.group) && Number(l.cr)) outflows[l.acc] = (outflows[l.acc] || 0) + Number(l.cr); });
    Object.entries(outflows).forEach(([id, amt]) => {
        const a = accById(id);
        const old = v.id ? postingsOf(vById(v.id) || {}).filter(p => p.acc === id).reduce((x, p) => x + p.cr - p.dr, 0) : 0;
        const after = r2(balance(id, v.date || todayISO()) + old - amt);
        if (after < 0) W.push(a.group === 'cash'
            ? `This takes ${a.name} below zero (${inr(after)} on ${fmtDate(v.date)}). Cash in hand cannot be negative — a receipt is probably missing.`
            : `This takes ${a.name} into overdraft (${inr(after)} on ${fmtDate(v.date)}). Check the bank balance.`);
    });
    // Paying or receiving more than the open bills
    if ((v.type === 'PY' || v.type === 'RC') && v.partyId) {
        const open = sum(openBills(v.partyId, v.type === 'RC' ? 'SI' : 'PB', v.id), 'due');
        const amt = r2((Number(v.amount) || 0) + (v.tds?.amount || 0));
        if (amt > open + 0.01) W.push(`${inr(amt)} is more than the ${inr(open)} open on bills. The extra ${inr(amt - open)} stays as an advance ${v.type === 'RC' ? 'from' : 'to'} ${contactById(v.partyId)?.name}.`);
    }
    const P = co.settings.prefs || {};
    if (v.type === 'SI' && (P.warnNegStock ?? true)) {
        const st = stockAt(v.date).items;
        const need = {};
        (v.lines || []).forEach(l => { if (st[l.itemId]) need[l.itemId] = (need[l.itemId] || 0) + (Number(l.qty) || 0); });
        const old = v.id ? vById(v.id) : null;
        (old?.lines || []).forEach(l => { if (need[l.itemId] !== undefined) need[l.itemId] -= Number(l.qty) || 0; });
        Object.entries(need).forEach(([id, q]) => { if (st[id].qty - q < 0) W.push(`${itemById(id).name}: only ${r2(st[id].qty)} ${itemById(id).unit} in stock on ${fmtDate(v.date)}; this sale takes it to ${r2(st[id].qty - q)}. A purchase may be missing.`); });
    }
    if (v.type === 'SI' && (P.warnDuplicateSale ?? true) && co.vouchers.some(x => x.type === 'SI' && x.id !== v.id && x.status !== 'cancelled' && x.partyId === v.partyId && x.date === v.date && Math.abs(x.totals.total - v.totals.total) < 1)) W.push('An invoice for the same customer, date and amount already exists. Check this is not a duplicate.');
    if (v.type === 'SI' && contactById(v.partyId)?.tcsSection && !v.tcs?.section) W.push(`${contactById(v.partyId).name} is set up for TCS (${tcsName(contactById(v.partyId).tcsSection, true)}) but none is charged on this invoice.`);
    return W;
}

function saveVoucher(input, opts = {}) {
    assertEdit();
    const old = input.id ? vById(input.id) : null;
    if (old && old.status === 'cancelled') throw new Error('A cancelled voucher cannot be edited.');
    const v = JSON.parse(JSON.stringify({ ...(old || {}), ...input }));
    v.lines = v.lines?.filter(l => l.itemId || l.desc || Number(l.rate));
    if (v.type === 'JV') v.jlines = (v.jlines || []).filter(l => l.acc && (Number(l.dr) || Number(l.cr))).map(l => ({ acc: l.acc, dr: r2(l.dr), cr: r2(l.cr) }));
    if (v.amount !== undefined) v.amount = r2(v.amount);
    computeVoucher(v);
    const errors = validateVoucher(v, old);
    if (errors.length) { const e = new Error(errors.join('\n')); e.list = errors; throw e; }
    if (!old && v.ext && co.vouchers.some(x => x.ext === v.ext)) throw new Error(`Already imported (${v.ext}).`);
    if (!old && opts.keepNo) {
        // A document issued elsewhere (an Eco Pack invoice, a scanned sales invoice) keeps its own number
        const no = String(input.no || '').trim();
        if (!/^[A-Za-z0-9/-]{1,16}$/.test(no)) throw new Error('The document number must be 1–16 letters, digits, / or -.');
        if (co.vouchers.some(x => x.type === v.type && x.no === no && fyOf(x.date) === fyOf(v.date))) throw new Error(`${VTYPES[v.type].name} ${no} already exists.`);
        v.id = uid('v'); v.no = no; v.status = 'active'; v.created = opts.created || new Date().toISOString(); v.createdBy = me?.name || 'System';
        co.vouchers.push(v);
        audit(`${VTYPES[v.type].name} recorded`, { entity: 'Voucher', ref: v.no, after: summarize(v), reason: opts.source || '' });
    } else if (!old) {
        const nx = nextNumber(v.type, v.date);
        v.id = uid('v');
        v.no = nx.no;
        v.status = 'active';
        v.created = opts.created || new Date().toISOString();
        v.createdBy = me?.name || 'System';
        co.series[nx.key] = nx.n;
        co.vouchers.push(v);
        audit(`${VTYPES[v.type].name} created`, { entity: 'Voucher', ref: v.no, after: summarize(v), reason: opts.source || '' });
    } else {
        const keys = ['date', 'partyId', 'ledgerId', 'accountId', 'toId', 'amount', 'lines', 'jlines', 'refNo', 'refDate', 'pos', 'rcm', 'itc', 'tds', 'alloc', 'narration', 'origId'];
        const change = diffFields(old, v, keys);
        v.updated = new Date().toISOString();
        v.updatedBy = me?.name || 'System';
        co.vouchers[co.vouchers.indexOf(old)] = v;
        audit(`${VTYPES[v.type].name} edited`, { entity: 'Voucher', ref: v.no, before: summarize(old), after: `${summarize(v)}${change ? ' | ' + change : ''}`, reason: opts.reason || '' });
    }
    // Contact remembers the last ledger / GST rate used, so the next entry (and the next scanned bill) pre-fills.
    const party = contactById(v.partyId);
    if (party && v.lines?.[0]) { party.lastAcc = v.lines[0].accId || party.lastAcc; party.lastRate = v.lines[0].gstRate; }
    saveCo();
    return v;
}

function cancelVoucher(id, reason) {
    assertEdit();
    const v = vById(id);
    if (!v || v.status === 'cancelled') return;
    if (!reason) throw new Error('A reason is required to cancel.');
    const errs = [];
    if (co.settings.lockDate && v.date <= co.settings.lockDate) errs.push(`Books are locked up to ${fmtDate(co.settings.lockDate)}.`);
    const filed = filedPeriod(v.type, v.date);
    if (filed) errs.push(`${filed} for ${ymLabel(ymOf(v.date))} is filed. Issue a credit / debit note instead.`);
    if (ITEM_TYPES.includes(v.type) && settledAgainst(v.id) > 0) errs.push('Receipts, payments or notes are linked to this document. Cancel or re-allocate them first.');
    if (v.irn && !v.irnCancelled) {
        const hrs = (Date.now() - new Date(v.ackDt).getTime()) / 36e5;
        if (hrs > 24) errs.push('The IRN is older than 24 hours and cannot be cancelled on the IRP. Issue a credit note instead.');
    }
    if (errs.length) throw new Error(errs.join('\n'));
    if (v.irn) { v.irnCancelled = new Date().toISOString(); }
    v.status = 'cancelled';
    v.cancelReason = reason;
    v.cancelledBy = me?.name;
    v.cancelledAt = new Date().toISOString();
    audit(`${VTYPES[v.type].name} cancelled`, { entity: 'Voucher', ref: v.no, before: summarize({ ...v, status: 'active' }), after: 'Cancelled (number retained, no postings)', reason });
    saveCo();
}

// ---------- masters ----------
function saveContact(c) {
    assertEdit();
    const E = [];
    c.name = String(c.name || '').trim();
    c.gstin = String(c.gstin || '').toUpperCase().trim();
    c.pan = String(c.pan || '').toUpperCase().trim();
    if (!c.name) E.push('Name is required.');
    if (c.gstin && !gstinValid(c.gstin)) E.push('GSTIN is not valid (format or check digit).');
    if (c.gstin) { c.state = c.gstin.slice(0, 2); if (!c.pan) c.pan = c.gstin.slice(2, 12); }
    if (c.pan && !panValid(c.pan)) E.push('PAN is not valid.');
    if (c.gstin && c.pan && c.gstin.slice(2, 12) !== c.pan) E.push('PAN does not match the PAN inside the GSTIN.');
    if (!STATES[c.state]) E.push('Choose the state.');
    if (co.contacts.some(x => x.id !== c.id && x.name.toLowerCase() === c.name.toLowerCase())) E.push('Another contact has this name.');
    if (c.gstin && co.contacts.some(x => x.id !== c.id && x.gstin === c.gstin && x.type === c.type)) E.push('Another contact has this GSTIN.');
    if (c.phone && !/^[6-9]\d{9}$/.test(c.phone)) E.push('Mobile must be 10 digits.');
    if (E.length) { const e = new Error(E.join('\n')); e.list = E; throw e; }
    const old = c.id && contactById(c.id);
    if (old) {
        audit('Contact edited', { entity: 'Contact', ref: c.name, before: diffFields(c, old, ['name', 'gstin', 'pan', 'state', 'openDr', 'openCr', 'tdsSection', 'msme']) ? `${old.name} ${old.gstin}` : '', after: diffFields(old, c, ['name', 'gstin', 'pan', 'state', 'openDr', 'openCr', 'tdsSection', 'msme', 'creditDays']) });
        Object.assign(old, c);
    } else {
        c.id = uid('ct');
        co.contacts.push(c);
        audit('Contact created', { entity: 'Contact', ref: c.name, after: `${c.type} · ${c.gstin || 'Unregistered'} · ${STATES[c.state]}` });
    }
    saveCo();
    return old || c;
}
function saveItem(i) {
    assertEdit();
    const E = [];
    i.name = String(i.name || '').trim();
    if (!i.name) E.push('Name is required.');
    if (!hsnValid(i.hsn)) E.push(`${i.type === 'service' ? 'SAC' : 'HSN'} must be 4, 6 or 8 digits.`);
    if (!GST_RATES.includes(Number(i.gstRate))) E.push('Choose a valid GST rate.');
    if (co.items.some(x => x.id !== i.id && x.name.toLowerCase() === i.name.toLowerCase())) E.push('Another item has this name.');
    if (E.length) { const e = new Error(E.join('\n')); e.list = E; throw e; }
    const old = i.id && itemById(i.id);
    if (old) { audit('Item edited', { entity: 'Item', ref: i.name, after: diffFields(old, i, ['name', 'hsn', 'gstRate', 'rate', 'purchaseRate', 'openQty', 'openValue']) }); Object.assign(old, i); }
    else { i.id = uid('it'); co.items.push(i); audit('Item created', { entity: 'Item', ref: i.name, after: `HSN ${i.hsn} · GST ${i.gstRate}%` }); }
    saveCo();
    return old || i;
}
function saveAccount(a) {
    assertEdit();
    a.name = String(a.name || '').trim();
    const E = [];
    if (!a.name) E.push('Name is required.');
    if (!GROUPS[a.group]) E.push('Choose the group.');
    if (co.accounts.some(x => x.id !== a.id && x.name.toLowerCase() === a.name.toLowerCase())) E.push('Another ledger has this name.');
    if (Number(a.openDr) && Number(a.openCr)) E.push('Opening balance is either debit or credit, not both.');
    if (E.length) { const e = new Error(E.join('\n')); e.list = E; throw e; }
    const old = a.id && accById(a.id);
    if (old) { audit('Ledger edited', { entity: 'Ledger', ref: a.name, after: diffFields(old, a, ['name', 'group', 'openDr', 'openCr']) }); Object.assign(old, a); }
    else { a.id = uid('acc'); co.accounts.push(a); audit('Ledger created', { entity: 'Ledger', ref: a.name, after: GROUPS[a.group].name }); }
    saveCo();
    return old || a;
}

// ---------- attachments (bill images / PDFs kept with the voucher: Income-tax Rule 46 needs the original bills) ----------
const files = (() => {
    let p;
    const db = () => p ||= new Promise((res, rej) => {
        const r = indexedDB.open('wcerp-files', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('f');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
    const run = async (mode, fn) => {
        const d = await db();
        return new Promise((res, rej) => { const t = d.transaction('f', mode); const q = fn(t.objectStore('f')); t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error); });
    };
    return { put: (k, v) => run('readwrite', s => s.put(v, k)), get: k => run('readonly', s => s.get(k)), del: k => run('readwrite', s => s.delete(k)) };
})();
