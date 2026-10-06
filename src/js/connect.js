'use strict';
// ===================== We Create ERP · connected dashboards =====================
// STAY BAY (hotel HR dashboard): payroll only — employees and every month paid there.
// Eco Pack (factory dashboard): customers, products, raw materials, opening stock, sales invoices and receipts,
// raw-material purchase bills, monthly production (materials consumed → finished goods), machine repairs and payroll.
// The dashboards save in the same browser storage when used on the same site (vigneshannamalai-ai.github.io) or as
// local files in the same browser, so the ERP can read them directly; a backup file from either works anywhere.
// Each imported record carries an "ext" key, so syncing again only adds what is new.

const SOURCES = {
    staybay: { name: 'STAY BAY Business Hotels', what: 'Payroll: employees and every salary month paid in the STAY BAY dashboard.', url: 'https://vigneshannamalai-ai.github.io/STAY-BAY-BUSINESS-HOTELS/' },
    ecopack: { name: 'Eco Pack Private Limited', what: 'Customers, products, raw materials, opening stock, sales invoices and receipts, purchase bills, daily production, machine repairs and payroll.', url: 'https://vigneshannamalai-ai.github.io/Eco-Pack-Dashboard/' }
};
const linkOf = k => (co.links ||= {})[k];
let pendingSource = {};   // data read from a backup file this session, per source

// ---------- reading the source data ----------
function readStayBay() {
    if (pendingSource.staybay) return pendingSource.staybay;
    try {
        const raw = localStorage.getItem('staybay.employees.v2');
        if (!raw) return null;
        return { employees: JSON.parse(raw), employer: JSON.parse(localStorage.getItem('staybay.employer.v1') || '{}'), from: 'this browser' };
    } catch (e) { return null; }
}
function readEcoPack() {
    if (pendingSource.ecopack) return pendingSource.ecopack;
    try {
        const raw = localStorage.getItem('ecopack.db.v1');
        return raw ? { db: JSON.parse(raw), from: 'this browser' } : null;
    } catch (e) { return null; }
}
function loadSourceFile(k, text) {
    const j = JSON.parse(text);
    if (k === 'staybay') {
        if (j.app !== 'staybay-hr' || !j.keys?.['staybay.employees.v2']) throw new Error('This is not a STAY BAY backup file.');
        pendingSource.staybay = { employees: JSON.parse(j.keys['staybay.employees.v2']), employer: JSON.parse(j.keys['staybay.employer.v1'] || '{}'), from: `backup of ${fmtDate((j.exportedAt || '').slice(0, 10))}` };
    } else {
        if (j.app !== 'ecopack-dashboard' || !j.db) throw new Error('This is not an Eco Pack backup file.');
        pendingSource.ecopack = { db: j.db, from: `backup of ${fmtDate((j.exportedAt || '').slice(0, 10))}` };
    }
    return pendingSource[k];
}

// ---------- shared helpers ----------
const stateCodeByName = name => {
    const n = String(name || '').toLowerCase().trim();
    return Object.keys(STATES).find(c => STATES[c].toLowerCase() === n) || '';
};
function newReport() { return { added: {}, skipped: 0, failed: [], needs: [] }; }
const bump = (rep, k, n = 1) => { rep.added[k] = (rep.added[k] || 0) + n; };
const hasExt = ext => co.vouchers.some(v => v.ext === ext && v.status !== 'cancelled');
function tryPost(rep, label, fn) {
    try { fn(); return true; } catch (e) { rep.failed.push(`${label}: ${e.message.split('\n')[0]}`); return false; }
}
function bankFor(link) {
    let id = link.bank && accById(link.bank) ? link.bank : cashBankAccounts().find(a => a.group === 'bank')?.id;
    if (!id) id = saveAccount({ name: 'Bank Account', group: 'bank', openDr: 0, openCr: 0 }).id;
    link.bank = id;
    return id;
}
// A payroll month from a dashboard: rows already worked out and paid there
function importPayrollMonth(rep, src, ym, rows, paidOn, bank) {
    if (ym < ymOf(co.profile.booksFrom) || !Object.keys(rows).length) return;
    const run = runOf(ym);
    if (run && run.source === src && run.status !== 'draft') { rep.skipped++; return; }
    if (run && run.status !== 'draft') { rep.failed.push(`${ymLabel(ym)} payroll: already posted in the ERP by hand, so the ${SOURCE_LABEL[src]} figures were not added.`); return; }
    co.payroll[ym] = { status: 'draft', rows, source: src };
    if (!tryPost(rep, `${ymLabel(ym)} payroll`, () => postPayroll(ym, { ext: `${src}:payroll:${ym}`, source: `${SOURCE_LABEL[src]} sync` }))) { delete co.payroll[ym]; return; }
    bump(rep, 'payroll months');
    if (paidOn && paidOn <= todayISO()) tryPost(rep, `${ymLabel(ym)} salary payment`, () => paySalaries(ym, bank, paidOn < lastDay(ym) ? lastDay(ym) > todayISO() ? todayISO() : lastDay(ym) : paidOn, `${SOURCE_LABEL[src]} payroll`, { ext: `${src}:salpay:${ym}`, source: `${SOURCE_LABEL[src]} sync` }));
}
function upsertEmployee(rep, src, srcId, data) {
    co.employees ||= [];
    const ex = co.employees.find(e => e.source === src && e.srcId === srcId);
    if (ex) { const before = JSON.stringify(ex); Object.assign(ex, data); if (JSON.stringify(ex) !== before) bump(rep, 'employees updated'); return ex; }
    const e = { id: uid('em'), source: src, srcId, ...data };
    co.employees.push(e);
    bump(rep, 'employees');
    return e;
}

// ---------- STAY BAY: payroll ----------
function syncStayBay(source) {
    assertEdit();
    const S = source || readStayBay();
    if (!S) throw new Error('No STAY BAY data found. Open the STAY BAY dashboard in this browser first, or load its backup file.');
    const link = co.links.staybay ||= { auto: true };
    const rep = newReport();
    inBulk(() => {
        const bank = bankFor(link);
        co.payroll ||= {};
        const byMonth = {};
        S.employees.forEach(se => {
            const c = se.salaryConfig || {};
            const e = upsertEmployee(rep, 'staybay', se.id, {
                code: se.code || '', name: se.name, dept: se.department || '', desig: se.designation || '', salary: Number(se.salary) || 0, basicPct: Number(c.basicPct) || 50,
                doj: se.doj || '', exitDate: se.exitDate || '', status: se.status === 'Active' || !se.status ? 'Active' : 'Inactive', pan: se.pan || '', uan: /^\d{12}$/.test(se.epf || '') ? se.epf : '', esiNo: se.esi || '',
                pf: c.pfEnabled !== false, esi: c.esiEnabled !== false, bankAcc: se.bank?.accountNumber || ''
            });
            Object.entries(se.payments || {}).forEach(([ym, p]) => {
                const s = p.snapshot || {};
                const gross = Math.round(s.earnedGross ?? ((s.gross || 0) - (s.lop || 0)));
                const M = byMonth[ym] ||= { rows: {}, paidOn: '' };
                M.rows[e.id] = { paidDays: s.paidDays, lop: s.lopDays || 0, gross, basic: Math.round(s.earnedBasic ?? s.basic ?? 0), pf: s.pf || 0, erPf: s.employerPf || 0, esi: s.esi || 0, erEsi: s.employerEsi || 0, pt: s.pt || 0, tds: s.tds || 0, adv: (s.advance || 0) + (s.loan || 0), net: s.net ?? gross };
                // Balance the row exactly to what was paid (STAY BAY rounds the net pay)
                const r = M.rows[e.id];
                r.gross = r2(r.net + r.pf + r.esi + r.pt + r.tds + r.adv);
                if (p.paidOn > M.paidOn) M.paidOn = p.paidOn;
            });
        });
        Object.keys(byMonth).sort().forEach(ym => importPayrollMonth(rep, 'staybay', ym, byMonth[ym].rows, byMonth[ym].paidOn, bank));
        link.lastSync = new Date().toISOString(); link.from = S.from;
    });
    audit('Synced from STAY BAY', { entity: 'Connection', ref: 'STAY BAY', after: reportText(rep) });
    saveCo();
    return rep;
}

// ---------- Eco Pack: sales, purchases, production, repairs, payroll ----------
// 4-digit HSN in the dashboard → 6 digits (needed above ₹5 crore turnover). Check these against your invoices.
const ECO_HSN = {
    bubble: '392010', tube: '392010', stretch: '392010', hmroll: '392010', bubbag: '392321', ldbag: '392321', shop: '392321', garb: '392321', garbroll: '392321',
    cap: '392350', tub: '392390', bottle: '392330', ldpe: '390110', lldpe: '390140', hdpe: '390120', hm: '390120', pp: '390210', rec: '390190', mbb: '320649', mbc: '320649'
};
function syncEcoPack(source) {
    assertEdit();
    const S = source || readEcoPack();
    if (!S) throw new Error('No Eco Pack data found. Open the Eco Pack dashboard in this browser first, or load its backup file.');
    const d = S.db;
    const link = co.links.ecopack ||= { auto: true, vendorGstin: {} };
    link.vendorGstin ||= {};
    const rep = newReport();
    const today = todayISO();
    inBulk(() => {
        const bank = bankFor(link);
        // Company details, first time only
        if (!link.lastSync && d.company) {
            const c = d.company;
            Object.assign(co.profile, { legalName: co.profile.legalName || c.name, gstin: co.profile.gstin || c.gstin || '', state: c.stateCode || co.profile.state, address: co.profile.address || c.address || '' });
            if (co.profile.gstin && !gstinValid(co.profile.gstin)) co.profile.gstin = '';
        }
        // Items: finished goods and raw materials, each a stock item with its kind
        const itemFor = {};
        const ensureItem = (src, kind, x) => {
            let it = co.items.find(i => i.srcId === `ecopack:${src}:${x.id}`);
            if (!it) {
                it = saveItem({ name: co.items.some(i => i.name.toLowerCase() === x.name.toLowerCase()) ? `${x.name} (Eco Pack)` : x.name, type: 'goods', kind, hsn: ECO_HSN[x.id] || (x.hsn ? String(x.hsn).padEnd(6, '0') : '390190'), gstRate: 18, unit: x.unit === 'pcs' ? 'PCS' : 'KGS', rate: kind === 'finished' ? Number(x.rate) || 0 : 0, purchaseRate: kind === 'raw' ? Number(x.rate) || 0 : 0, trackStock: true, openQty: 0, openValue: 0, srcId: `ecopack:${src}:${x.id}` });
                bump(rep, 'items');
            }
            itemFor[`${src}:${x.id}`] = it;
        };
        (d.products || []).forEach(p => ensureItem('fg', 'finished', p));
        (d.materials || []).forEach(m => ensureItem('rm', 'raw', m));
        // Opening stock (only before any stock entry exists, so books stay consistent)
        if (!link.openingDone) {
            (d.moves || []).filter(mv => mv.kind === 'Opening').forEach(mv => {
                const it = itemFor[`${mv.type === 'rm' ? 'rm' : 'fg'}:${mv.item}`];
                if (it) { it.openQty = r2((Number(it.openQty) || 0) + mv.qty); it.openValue = r2((Number(it.openValue) || 0) + mv.qty * (Number(mv.rate) || 0)); }
            });
            const ov = sum((d.moves || []).filter(mv => mv.kind === 'Opening'), mv => mv.qty * (Number(mv.rate) || 0));
            if (ov) { const cap = sysAcc('capital'); cap.openCr = r2((Number(cap.openCr) || 0) + ov); }   // balances the opening stock
            link.openingDone = true;
        }
        // Customers
        const custFor = {};
        (d.customers || []).forEach(c => {
            let ct = co.contacts.find(x => x.srcId === `ecopack:cust:${c.id}`);
            if (!ct) {
                const gst = c.gstin && gstinValid(String(c.gstin).toUpperCase()) ? String(c.gstin).toUpperCase() : '';
                ct = saveContact({ type: 'customer', name: co.contacts.some(x => x.name.toLowerCase() === c.name.toLowerCase()) ? `${c.name} (Eco Pack)` : c.name, gstin: gst, state: gst ? gst.slice(0, 2) : (stateCodeByName(c.state) || companyState()), city: c.city || '', phone: /^[6-9]\d{9}$/.test(c.phone || '') ? c.phone : '', creditDays: Number(c.creditDays) || 30, srcId: `ecopack:cust:${c.id}` });
                bump(rep, 'customers');
            }
            custFor[c.id] = ct;
        });
        // Vendors from purchase entries. GST can only be claimed from a registered supplier, so a GSTIN is needed.
        const purchases = (d.moves || []).filter(mv => mv.kind === 'Purchase' && mv.type === 'rm');
        const vendorNames = [...new Set(purchases.map(mv => mv.party || 'Supplier'))];
        const vendFor = {};
        vendorNames.forEach(name => {
            const gst = link.vendorGstin[name];
            let ct = co.contacts.find(x => x.srcId === `ecopack:vend:${name}`);
            if (!ct && gst) { ct = saveContact({ type: 'vendor', name, gstin: gst === 'URD' ? '' : gst, state: gst === 'URD' ? companyState() : gst.slice(0, 2), creditDays: 30, srcId: `ecopack:vend:${name}` }); bump(rep, 'suppliers'); }
            if (ct && gst && gst !== 'URD' && ct.gstin !== gst) { ct.gstin = gst; ct.state = gst.slice(0, 2); }
            if (!gst) rep.needs.push({ kind: 'vendorGstin', name, bills: purchases.filter(mv => (mv.party || 'Supplier') === name).length });
            vendFor[name] = ct;
        });
        // All documents in date order, so stock and settlements happen in the right sequence
        const docs = [];
        (d.orders || []).filter(o => o.status === 'Dispatched' && o.dispatch?.invoiceNo && o.dispatch.date <= today).forEach(o => docs.push({ date: o.dispatch.date, k: 0, o }));
        const bills = {};
        purchases.forEach(mv => { const key = mv.bill || `${mv.party}|${mv.date}`; (bills[key] ||= []).push(mv); });
        Object.entries(bills).forEach(([key, mvs]) => docs.push({ date: mvs[0].date, k: 1, key, mvs }));
        // one production entry per production day (before today), so finished goods are in stock before they are sold
        const doneDays = new Set();
        (d.production || []).forEach(r => { if (r.date < today) doneDays.add(r.date); });
        doneDays.forEach(day => docs.push({ date: day, k: 2, day }));
        (d.maintenance || []).filter(m => Number(m.cost) > 0 && (m.status || 'Closed') !== 'Open' && m.date <= today).forEach(m => docs.push({ date: m.closedOn && m.closedOn <= today ? m.closedOn : m.date, k: 3, m }));
        docs.sort((a, b) => a.date.localeCompare(b.date) || (a.k === 2 ? -1 : a.k) - (b.k === 2 ? -1 : b.k));
        const inBooks = date => date >= co.profile.booksFrom;
        docs.forEach((x, n) => {
            const created = new Date(Date.parse(x.date) + n).toISOString();
            if (!inBooks(x.date)) return;
            if (x.k === 0) {
                const o = x.o, ext = `ecopack:inv:${o.id}`;
                if (hasExt(ext)) { rep.skipped++; return; }
                const it = itemFor[`fg:${o.productId}`], ct = custFor[o.customerId];
                if (!it || !ct) return;
                const ok = tryPost(rep, `Invoice ${o.dispatch.invoiceNo}`, () => {
                    const v = saveVoucher({ type: 'SI', no: o.dispatch.invoiceNo, date: o.dispatch.date, partyId: ct.id, pos: ct.state === '96' ? '96' : ct.state, ext, narration: `Eco Pack order ${o.no}${o.dispatch.vehicle ? ' · vehicle ' + o.dispatch.vehicle : ''}`, lines: [{ itemId: it.id, desc: it.name, hsn: it.hsn, qty: o.qty, unit: it.unit, rate: o.rate, disc: 0, gstRate: 18, accId: '' }] }, { keepNo: true, source: 'Eco Pack sync', created });
                    bump(rep, 'sales invoices');
                    (o.payments || []).forEach((p, i) => {
                        if (!p.date || p.date > today || hasExt(`${ext}:rc${i}`)) return;
                        const due = outstanding(v);
                        tryPost(rep, `Receipt for ${v.no}`, () => { saveVoucher({ type: 'RC', date: p.date < v.date ? v.date : p.date, accountId: bank, partyId: ct.id, amount: p.amount, refNo: p.ref || p.mode || '', alloc: due > 0 ? [{ vid: v.id, amt: Math.min(due, p.amount) }] : [], ext: `${ext}:rc${i}`, narration: `Received by ${p.mode || 'bank'} against ${v.no}` }, { source: 'Eco Pack sync', created }); bump(rep, 'receipts'); });
                    });
                });
                if (!ok) return;
            } else if (x.k === 1) {
                const ext = `ecopack:bill:${x.key}`, ct = vendFor[x.mvs[0].party || 'Supplier'];
                if (hasExt(ext)) { rep.skipped++; return; }
                if (!ct) return;   // waiting for the supplier's GSTIN
                tryPost(rep, `Purchase ${x.key}`, () => {
                    saveVoucher({ type: 'PB', date: x.date, partyId: ct.id, refNo: String(x.mvs[0].bill || `EP-${x.date}`).slice(0, 16), ext, narration: 'Raw material purchase from the Eco Pack stores register', lines: x.mvs.map(mv => { const it = itemFor[`rm:${mv.item}`]; return { itemId: it.id, desc: it.name, hsn: it.hsn, qty: mv.qty, unit: it.unit, rate: mv.rate, disc: 0, gstRate: 18, accId: '' }; }) }, { source: 'Eco Pack sync', created });
                    bump(rep, 'purchase bills');
                });
            } else if (x.k === 2) {
                const ext = `ecopack:prod:${x.day}`;
                if (hasExt(ext) || hasExt(`ecopack:prod:${x.day.slice(0, 7)}`)) { rep.skipped++; return; }
                const consume = {}, produce = {};
                (d.production || []).filter(r => r.date === x.day).forEach(r => {
                    const p = (d.products || []).find(q => q.id === r.productId);
                    if (!p) return;
                    produce[p.id] = (produce[p.id] || 0) + r.qty;
                    const used = r.qty * (Number(p.wt) || 1) + (Number(r.scrap) || 0);
                    Object.entries(p.recipe || {}).forEach(([m, share]) => { consume[m] = (consume[m] || 0) + used * share; });
                });
                const C = Object.entries(consume).map(([m, q]) => ({ itemId: itemFor[`rm:${m}`]?.id, qty: r2(q) })).filter(l => l.itemId && l.qty > 0);
                const P = Object.entries(produce).map(([p, q]) => ({ itemId: itemFor[`fg:${p}`]?.id, qty: q, weight: Number((d.products || []).find(z => z.id === p)?.wt) || 1 })).filter(l => l.itemId && l.qty > 0);
                if (C.length && P.length) tryPost(rep, `Production ${ddmmyyyy(x.day)}`, () => { saveVoucher({ type: 'SJ', date: x.date, consume: C, produce: P, ext, narration: `Production on ${ddmmyyyy(x.day)} from the Eco Pack production log (materials incl. scrap → finished goods)` }, { source: 'Eco Pack sync', created }); bump(rep, 'production entries'); });
            } else if (x.k === 3) {
                const m = x.m, ext = `ecopack:mt:${m.id}`;
                if (hasExt(ext)) { rep.skipped++; return; }
                const mc = (d.machines || []).find(z => z.id === m.machineId);
                tryPost(rep, 'Machine repair', () => { saveVoucher({ type: 'PY', date: x.date, accountId: bank, ledgerId: sysId('repairs'), amount: Number(m.cost), ext, narration: `${m.type || 'Repair'}: ${mc?.name || m.machineId} — ${m.issue || ''}`.slice(0, 200) }, { source: 'Eco Pack sync', created }); bump(rep, 'repair payments'); });
            }
        });
        // Payroll
        (d.employees || []).forEach(se => upsertEmployee(rep, 'ecopack', se.id, {
            code: se.code || '', name: se.name, dept: `${(d.units || []).find(u => u.id === se.unit)?.short || se.unit || ''} · ${se.dept || ''}`, desig: se.desig || '', salary: Number(se.salary) || 0, basicPct: 50,
            doj: se.doj || '', exitDate: se.exitDate || '', status: se.status === 'Active' || !se.status ? 'Active' : 'Inactive', uan: /^\d{12}$/.test(se.uan || '') ? se.uan : '', pf: se.pf !== false, esi: se.esi !== false, bankAcc: se.account || ''
        }));
        Object.keys(d.pay || {}).sort().forEach(ym => {
            const rows = {}; let paidOn = '';
            Object.entries(d.pay[ym]).forEach(([sid, p]) => {
                const e = co.employees.find(x => x.source === 'ecopack' && x.srcId === sid), s = p.snap || {};
                if (!e) return;
                rows[e.id] = { paidDays: s.paidDays, lop: s.lopDays || 0, gross: s.gross || 0, basic: s.basic || 0, pf: s.pf || 0, erPf: s.erPf || 0, esi: s.esi || 0, erEsi: s.erEsi || 0, pt: s.pt || 0, tds: 0, adv: 0, net: s.net ?? s.gross ?? 0 };
                if (p.paidOn > paidOn) paidOn = p.paidOn;
            });
            importPayrollMonth(rep, 'ecopack', ym, rows, paidOn, bank);
        });
        link.lastSync = new Date().toISOString(); link.from = S.from; link.sample = Boolean(d.sample);
        link.lastReport = { at: link.lastSync, added: rep.added, failed: rep.failed.slice(0, 50), needs: rep.needs };
    });
    audit('Synced from Eco Pack', { entity: 'Connection', ref: 'Eco Pack', after: reportText(rep) });
    saveCo();
    return rep;
}
const reportText = rep => (Object.entries(rep.added).map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing new') + (rep.skipped ? ` · ${rep.skipped} already in the books` : '') + (rep.failed.length ? ` · ${rep.failed.length} not added` : '');

// Quiet sync when a linked company is opened
function autoSync() {
    if (!co?.links || !canEdit()) return;
    const msgs = [];
    [['staybay', readStayBay, syncStayBay], ['ecopack', readEcoPack, syncEcoPack]].forEach(([k, read, sync]) => {
        const l = co.links[k];
        const src = l?.auto && sourceOf(k, l);
        if (!src) return;
        try { const rep = sync(src); if (Object.keys(rep.added).length) msgs.push(`${SOURCE_LABEL[k]}: ${reportText(rep)}`); } catch (e) { console.warn(e); }
    });
    if (msgs.length) toast(`Synced — ${msgs.join(' · ')}`);
}

// Where a connected company's data comes from: the dashboard in this browser, a loaded backup, or the built-in demo
const readSource = k => k === 'staybay' ? readStayBay() : readEcoPack();
const sourceOf = (k, l) => l?.demo ? demoSource(k) : readSource(k);
// Companies connected to a dashboard (each dashboard syncs only into its own company)
function linkedCompanies(k) {
    return meta.companies.filter(c => c.link === k || (c.link === undefined && loadCo(c.id)?.links?.[k])).map(c => ({ ...c, demo: Boolean(loadCo(c.id)?.links?.[k]?.demo) }));
}

// ---------- screen ----------
function connectionsHtml() {
    const card = k => {
        const S = SOURCES[k], l = linkOf(k), src = sourceOf(k, l), real = readSource(k);
        const head = `<div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2 style="margin-bottom:4px">${esc(S.name)} ${l ? `<span class="badge good">Connected to this company</span>${l.demo ? ' <span class="badge warn">Demo data</span>' : ''}` : ''}</h2><p class="note">${esc(S.what)}</p></div>
            <a class="btn btn-g btn-sm" href="${S.url}" target="_blank" rel="noopener">Open dashboard ↗</a></div>`;
        const backup = `<label class="btn btn-s btn-sm" style="cursor:pointer">Load backup file<input type="file" accept=".json" hidden onchange="loadBackupFor('${k}', this)"></label>`;
        if (!l) {
            // This company is not the one for this dashboard: show where it syncs, or create its company
            const others = linkedCompanies(k).filter(c => c.id !== co.id);
            return `<div class="card">${head}<div class="note" style="margin:10px 0">${real ? `✓ ${SOURCE_LABEL[k]} data found (${esc(real.from)}).` : `No ${SOURCE_LABEL[k]} data in this browser yet — open the dashboard once here, or load its backup file.`} ${SOURCE_LABEL[k]} syncs only into its own company, never into ${esc(co.profile.name)}.</div>
                ${others.length ? `<div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:8px">${others.map(c => `<button class="btn btn-s btn-sm" onclick="pickCompany('${c.id}');go('#/connect')">Open ${esc(c.name)}${c.demo ? ' (demo)' : ''} →</button>`).join('')}</div>` : ''}
                <div class="row" style="margin-top:6px">${isAdmin() && (real || !others.length) ? `<button class="btn btn-p btn-sm" onclick="createLinkedCompany('${k}')">${real ? `Create a company for ${SOURCE_LABEL[k]} and connect` : `Create ${SOURCE_LABEL[k]} company with demo data`}</button>` : ''}${backup}</div></div>`;
        }
        const counts = !src ? '' : k === 'staybay' ? `${src.employees.length} employees, ${new Set(src.employees.flatMap(e => Object.keys(e.payments || {}))).size} paid months` : `${(src.db.orders || []).filter(o => o.status === 'Dispatched').length} invoices, ${(src.db.moves || []).filter(m => m.kind === 'Purchase').length} purchases, ${(src.db.employees || []).length} employees`;
        const needs = (l.lastReport?.needs || []).filter(n => n.kind === 'vendorGstin' && !(l.vendorGstin || {})[n.name]);
        return `<div class="card">${head}
            <div class="note" style="margin:10px 0">${src ? `✓ Source: ${esc(src.from)} — ${esc(counts)}` : `No ${SOURCE_LABEL[k]} data in this browser. Open the dashboard on this computer and browser once, or load its backup file below.`}${l.lastSync ? `<br>Last synced ${new Date(l.lastSync).toLocaleString('en-IN')}.` : ''}</div>
            ${l.demo && real && isAdmin() ? `<div class="warns">Your real ${SOURCE_LABEL[k]} data is in this browser. This company holds demo data — <a href="javascript:createLinkedCompany('${k}')">create a company for the real data</a> so the two never mix.</div>` : ''}
            ${needs.length ? `<div class="warns"><b>Supplier GSTINs needed.</b> Purchase bills from these suppliers are held back until you add their GSTIN (input GST can only be claimed from a registered supplier). Type URD if a supplier really has no GSTIN.<div class="fg" style="margin-top:8px">${needs.map((n, i) => `<label class="f">${esc(n.name)} <span class="hint">${n.bills} bill(s)</span><input id="vg_${i}" data-name="${esc(n.name)}" maxlength="15" placeholder="GSTIN or URD" style="text-transform:uppercase"></label>`).join('')}</div>
                <div class="row" style="margin-top:8px"><button class="btn btn-p btn-sm" onclick="saveVendorGstins()">Save & sync again</button>${l.sample ? '<button class="btn btn-g btn-sm" onclick="fillSampleGstins()">Use sample GSTINs (sample data only)</button>' : ''}</div></div>` : ''}
            ${l.lastReport?.failed?.length ? `<details><summary class="note" style="cursor:pointer">${l.lastReport.failed.length} record(s) not added — why</summary><div class="note">${l.lastReport.failed.map(esc).join('<br>')}</div></details>` : ''}
            <div class="row" style="margin-top:10px">${canEdit() ? `<button class="btn btn-p" ${src ? '' : 'disabled'} onclick="runSync('${k}')">Sync now</button>` : ''}${l.demo ? '' : backup}
                <label class="chk"><input type="checkbox" ${l.auto ? 'checked' : ''} onchange="linkOf('${k}').auto=this.checked;saveCo()"> Sync automatically when this company opens</label></div></div>`;
    };
    return `<p class="note" style="margin-bottom:12px">Each dashboard has its own company in the ERP: STAY BAY (payroll) and Eco Pack (sales, purchases, production, payroll). Syncing again only adds what is new; nothing is ever posted twice. You are in <b>${esc(co.profile.name)}</b>.</p>${card('staybay')}${card('ecopack')}`;
}
function viewConnect() { $('#view').innerHTML = pageHead('Connected dashboards', 'Bring payroll from STAY BAY, and sales, purchases, production and payroll from Eco Pack, straight into the books.') + connectionsHtml(); }
function runSync(k) {
    try {
        const l = linkOf(k);
        if (!l) throw new Error(`${co.profile.name} is not connected to ${SOURCE_LABEL[k]}. Each dashboard syncs into its own company.`);
        const src = sourceOf(k, l);
        const rep = k === 'staybay' ? syncStayBay(src) : syncEcoPack(src);
        modal({ title: `Synced from ${SOURCE_LABEL[k]}`, body: `<p style="margin-bottom:10px">${esc(reportText(rep))}.</p>${Object.keys(rep.added).length ? `<ul style="margin-left:18px">${Object.entries(rep.added).map(([n, c]) => `<li>${c} ${esc(n)}</li>`).join('')}</ul>` : ''}${rep.needs.length ? `<div class="warns">${rep.needs.length} supplier(s) need a GSTIN before their bills are added — see the connection card.</div>` : ''}${rep.failed.length ? `<details style="margin-top:8px"><summary>${rep.failed.length} not added</summary><div class="note">${rep.failed.slice(0, 40).map(esc).join('<br>')}</div></details>` : ''}<p class="note" style="margin-top:10px">Every entry is posted to the ledgers, GST and statements and recorded in the audit trail.</p>`, foot: '<button class="btn btn-p" onclick="closeModal();route()">Done</button>' });
    } catch (e) { alert(e.message); }
}
async function loadBackupFor(k, input) {
    const f = input.files[0];
    if (!f) return;
    try { loadSourceFile(k, await f.text()); toast('Backup loaded. Press Sync.'); route(); } catch (e) { alert(e.message); }
}
function saveVendorGstins() {
    const l = linkOf('ecopack'), E = [];
    $$('[id^=vg_]').forEach(inp => {
        const g = inp.value.trim().toUpperCase();
        if (!g) return;
        if (g !== 'URD' && !gstinValid(g)) E.push(`${inp.dataset.name}: GSTIN is not valid.`);
        else l.vendorGstin[inp.dataset.name] = g;
    });
    if (E.length) return alert(E.join('\n'));
    saveCo(); runSync('ecopack');
}
function fillSampleGstins() {
    const l = linkOf('ecopack');
    (l.lastReport?.needs || []).forEach((n, i) => { l.vendorGstin[n.name] ||= makeGstin('33', `AAAFE${String(4100 + i * 7).padStart(4, '0')}K`); });
    saveCo(); runSync('ecopack');
}
// A company for a dashboard. demo: use the built-in demo data (when the dashboard's data is not in this browser).
function buildLinkedCompany(k, demo) {
    const S = demo ? demoSource(k) : readSource(k);
    let p;
    if (k === 'staybay') {
        const em = S?.employer || {};
        p = { name: em.name || 'STAY BAY Business Hotels', legalName: em.name || '', entity: 'Proprietorship', pan: panValid(em.pan) ? em.pan : '', tan: /^[A-Z]{4}\d{5}[A-Z]$/.test(em.tan || '') ? em.tan : '', state: '33', address: em.address || '', city: em.place || '' };
        if (demo) Object.assign(p, { pan: 'AKXPS4821L', gstin: makeGstin('33', 'AKXPS4821L'), tan: 'CHES12345F', phone: '9840098400' });
        const months = (S?.employees || []).flatMap(e => Object.keys(e.payments || {})).sort();
        p.booksFrom = `${fyOf((months[0] || todayISO().slice(0, 7)) + '-01')}-04-01`;
    } else {
        const c = S?.db?.company || {};
        const first = (S?.db?.moves || []).map(m => m.date).sort()[0] || todayISO();
        p = { name: c.name || 'Eco Pack Private Limited', legalName: c.name || '', entity: 'Private Ltd', gstin: gstinValid(c.gstin || '') ? c.gstin : '', state: c.stateCode || '33', address: c.address || '', city: 'Chennai', booksFrom: `${fyOf(first)}-04-01`, aato: 60000000 };
        if (p.gstin) p.pan = p.gstin.slice(2, 12);
    }
    if (demo) p.name += ' (demo)';
    const c = newCompanyData(p);
    co = c;
    meta.companies.push({ id: c.id, name: p.name, gstin: p.gstin || '', link: k });
    audit('Company created', { entity: 'Company', ref: p.name, after: `For the ${SOURCE_LABEL[k]} connection${demo ? ' (demo data)' : ''}` });
    co.links = { [k]: { auto: true, vendorGstin: { ...(S?.vendorGstin || {}) }, demo: Boolean(demo) } };
    if (demo) {   // a funded bank account so the demo payments have money to come from
        const bank = saveAccount({ name: k === 'staybay' ? 'Indian Bank Current A/c' : 'IOB Current A/c', group: 'bank', openDr: k === 'staybay' ? 2500000 : 4000000, openCr: 0 });
        sysAcc('capital').openCr = r2((Number(sysAcc('capital').openCr) || 0) + bank.openDr);
        co.links[k].bank = bank.id;
    }
    // What kind of business it is, so the right GST, credit and compliance rules apply from day one
    const n = k === 'staybay' ? (S?.employees || []).length : (S?.db?.employees || []).length;
    applyBusinessProfile({ ...bizDefaults(), ...LINKED_BIZ[k], employees: n || LINKED_BIZ[k].employees, ...(demo ? {} : { turnoverLast: 0, turnoverExp: 0 }) }, { from: p.booksFrom });
    let rep = null;
    if (S) rep = k === 'staybay' ? syncStayBay(S) : syncEcoPack(S);
    // Demo data: returns and deposits already past their due date are shown as filed on time, like the sample company
    if (demo) {
        const t = todayISO(), bank = co.links[k].bank;
        statDues(fyOf(t)).filter(x => x.pending > 0.5 && STAT[x.k].due(x.ym) < t).forEach(x => {
            const date = addDays(STAT[x.k].due(x.ym), -1);
            try { saveVoucher({ type: 'PY', date, accountId: bank, ledgerId: sysId(STAT[x.k].ledger), taxMonth: x.ym, amount: x.pending, challan: x.k === 'tds' ? { bsr: '0510308', serial: String(10000 + Number(x.ym.slice(5)) * 37) } : undefined, narration: `${STAT[x.k].label} for ${ymLabel(x.ym)} (demo)` }, { source: 'Demo data' }); } catch (e) { console.warn(e); }
        });
    }
    if (demo) complianceItems(fyOf(todayISO())).filter(i => i.state === 'overdue').forEach(i => { try { markFiled(i.type, i.period, 'DEMO', addDays(i.due, -1)); } catch (e) { /* already filed */ } });
    saveCo(); saveMeta();
    return { company: c, rep };
}
function createLinkedCompany(k) {
    if (limitReached('companies')) return upgradePrompt('More companies');
    const real = readSource(k);
    try {
        buildLinkedCompany(k, !real);
        state.fy = defaultFy();
        go('#/connect');
        toast(`${co.profile.name} created and connected${real ? '' : ' with demo data'}.`);
    } catch (e) { alert(e.message); }
}
// The sample workspace: the sample trading company plus STAY BAY and Eco Pack, each in its own connected company
function createSampleWorkspace() {
    const saved = co;
    createSampleCompany();
    ['staybay', 'ecopack'].forEach(k => { try { buildLinkedCompany(k, !readSource(k)); } catch (e) { console.warn(k, e); } });
    co = saved; ver++;
}
