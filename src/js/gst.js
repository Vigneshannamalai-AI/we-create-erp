'use strict';
// ===================== We Create ERP · GST, TDS, compliance, bill reading =====================

const activeIn = (types, ym) => co.vouchers.filter(v => types.includes(v.type) && v.status !== 'cancelled' && ymOf(v.date) === ym);
const byRate = v => {
    const m = {};
    (v.lines || []).forEach(l => {
        const r = l.effRate ?? l.gstRate;
        const x = m[r] ||= { rt: Number(r), txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
        x.txval += l.taxable; x.iamt += l.igst; x.camt += l.cgst; x.samt += l.sgst;
    });
    return Object.values(m).map(x => ({ ...x, txval: r2(x.txval), iamt: r2(x.iamt), camt: r2(x.camt), samt: r2(x.samt) }));
};

// ---------- GSTR-1 ----------
function gstr1(ym) {
    const sales = activeIn(['SI'], ym), notes = activeIn(['CN'], ym);
    const out = { b2b: [], b2cl: [], b2cs: {}, exp: [], cdnr: [], cdnur: [], hsnB2B: {}, hsnB2C: {}, docs: [] };
    const hsnAdd = (bucket, v, sign) => (v.lines || []).forEach(l => {
        const it = itemById(l.itemId);
        const uqc = (l.unit || it?.unit || 'OTH');
        const k = `${l.hsn}|${l.effRate}|${uqc}`;
        const h = bucket[k] ||= { hsn: l.hsn, desc: (l.desc || it?.name || '').slice(0, 30), uqc, rt: l.effRate, qty: 0, txval: 0, iamt: 0, camt: 0, samt: 0 };
        h.qty += sign * l.qty; h.txval += sign * l.taxable; h.iamt += sign * l.igst; h.camt += sign * l.cgst; h.samt += sign * l.sgst;
    });
    sales.forEach(v => {
        const p = contactById(v.partyId);
        const row = { v, party: p, pos: v.pos, val: v.totals.total, rates: byRate(v) };
        if (v.kind === 'B2B' || v.kind === 'SEZ') { out.b2b.push(row); hsnAdd(out.hsnB2B, v, 1); return; }
        hsnAdd(out.hsnB2C, v, 1);
        if (v.kind === 'EXP') out.exp.push(row);
        else if (v.totals.inter && v.totals.total > 100000) out.b2cl.push(row);   // B2CL limit ₹1 lakh from Aug 2024
        else row.rates.forEach(r => {
            const k = `${v.pos}|${r.rt}`;
            const b = out.b2cs[k] ||= { pos: v.pos, rt: r.rt, sply: v.totals.inter ? 'INTER' : 'INTRA', txval: 0, iamt: 0, camt: 0, samt: 0 };
            b.txval += r.txval; b.iamt += r.iamt; b.camt += r.camt; b.samt += r.samt;
        });
    });
    notes.forEach(v => {
        const p = contactById(v.partyId);
        const row = { v, party: p, orig: vById(v.origId), val: v.totals.total, rates: byRate(v) };
        if (isRegistered(p)) { out.cdnr.push(row); hsnAdd(out.hsnB2B, v, -1); }
        else { hsnAdd(out.hsnB2C, v, -1); if (v.kind === 'EXP' || (v.totals.inter && (row.orig?.totals.total || 0) > 100000)) out.cdnur.push(row); else row.rates.forEach(r => { const k = `${v.pos}|${r.rt}`; const b = out.b2cs[k] ||= { pos: v.pos, rt: r.rt, sply: v.totals.inter ? 'INTER' : 'INTRA', txval: 0, iamt: 0, camt: 0, samt: 0 }; b.txval -= r.txval; b.iamt -= r.iamt; b.camt -= r.camt; b.samt -= r.samt; }); }
    });
    // Table 13: documents issued (cancelled ones included)
    ['SI', 'CN'].forEach(t => {
        const list = co.vouchers.filter(v => v.type === t && ymOf(v.date) === ym).sort((a, b) => a.no.localeCompare(b.no));
        if (list.length) out.docs.push({ doc: t === 'SI' ? 'Invoices for outward supply' : 'Credit Note', from: list[0].no, to: list.at(-1).no, total: list.length, cancel: list.filter(v => v.status === 'cancelled').length });
    });
    out.b2cs = Object.values(out.b2cs);
    out.hsnB2B = Object.values(out.hsnB2B); out.hsnB2C = Object.values(out.hsnB2C);
    const all = [...out.b2b, ...out.b2cl, ...out.exp].reduce((s, r) => s + r.v.totals.taxable, 0) + out.b2cs.reduce((s, b) => s + b.txval, 0);
    out.summary = { invoices: sales.length, notes: notes.length, taxable: r2(all) };
    return out;
}
function gstr1Json(ym) {
    const g = gstr1(ym);
    const fp = ym.slice(5) + ym.slice(0, 4);
    const inv = r => ({
        inum: r.v.no, idt: ddmmyyyy(r.v.date), val: r.val, pos: r.v.pos, rchrg: 'N',
        inv_typ: r.v.kind === 'SEZ' ? (r.v.zeroWithPay ? 'SEWP' : 'SEWOP') : 'R',
        itms: r.rates.map((x, i) => ({ num: i + 1, itm_det: { txval: x.txval, rt: x.rt, iamt: x.iamt, camt: x.camt, samt: x.samt, csamt: 0 } }))
    });
    const groupBy = (rows, key) => Object.values(rows.reduce((m, r) => { (m[key(r)] ||= []).push(r); return m; }, {}));
    const j = { gstin: co.profile.gstin, fp, version: 'GST3.2', hash: 'hash' };
    if (g.b2b.length) j.b2b = groupBy(g.b2b, r => r.party.gstin).map(rs => ({ ctin: rs[0].party.gstin, inv: rs.map(inv) }));
    if (g.b2cl.length) j.b2cl = groupBy(g.b2cl, r => r.v.pos).map(rs => ({ pos: rs[0].v.pos, inv: rs.map(r => { const x = inv(r); delete x.rchrg; delete x.inv_typ; return x; }) }));
    if (g.b2cs.length) j.b2cs = g.b2cs.map(b => ({ sply_ty: b.sply, pos: b.pos, typ: 'OE', rt: b.rt, txval: r2(b.txval), iamt: r2(b.iamt), camt: r2(b.camt), samt: r2(b.samt), csamt: 0 }));
    if (g.exp.length) j.exp = [{ exp_typ: g.exp[0].v.zeroWithPay ? 'WPAY' : 'WOPAY', inv: g.exp.map(r => ({ inum: r.v.no, idt: ddmmyyyy(r.v.date), val: r.val, itms: r.rates.map(x => ({ txval: x.txval, rt: x.rt, iamt: x.iamt, csamt: 0 })) })) }];
    if (g.cdnr.length) j.cdnr = groupBy(g.cdnr, r => r.party.gstin).map(rs => ({ ctin: rs[0].party.gstin, nt: rs.map(r => ({ ntty: 'C', nt_num: r.v.no, nt_dt: ddmmyyyy(r.v.date), val: r.val, pos: r.v.pos, rchrg: 'N', inv_typ: 'R', itms: r.rates.map((x, i) => ({ num: i + 1, itm_det: { txval: x.txval, rt: x.rt, iamt: x.iamt, camt: x.camt, samt: x.samt, csamt: 0 } })) })) }));
    const hsnRow = (h, i) => ({ num: i + 1, hsn_sc: h.hsn, desc: h.desc, uqc: h.uqc, qty: r2(h.qty), rt: h.rt, txval: r2(h.txval), iamt: r2(h.iamt), camt: r2(h.camt), samt: r2(h.samt), csamt: 0 });
    j.hsn = { hsn_b2b: g.hsnB2B.map(hsnRow), hsn_b2c: g.hsnB2C.map(hsnRow) };
    if (g.docs.length) j.doc_issue = { doc_det: g.docs.map((d, i) => ({ doc_num: i === 0 ? 1 : 5, docs: [{ num: 1, from: d.from, to: d.to, totnum: d.total, cancel: d.cancel, net_issue: d.total - d.cancel }] })) };
    return j;
}

// ---------- GSTR-3B ----------
function gstr3b(ym) {
    const sales = activeIn(['SI'], ym), notes = activeIn(['CN'], ym), bills = activeIn(['PB'], ym), dns = activeIn(['DN'], ym);
    const z = () => ({ txval: 0, iamt: 0, camt: 0, samt: 0 });
    const add = (t, v, s) => { t.txval += s * v.totals.taxable; t.iamt += s * v.totals.igst; t.camt += s * v.totals.cgst; t.samt += s * v.totals.sgst; };
    const a = z(), b = z(), c = z(), d = z(), itcRcm = z(), itcOther = z(), ineligible = z(), reversal = z();
    const interUnreg = {};
    [[sales, 1], [notes, -1]].forEach(([list, s]) => list.forEach(v => {
        if (v.kind === 'EXP' || v.kind === 'SEZ') add(b, v, s);
        else if (v.totals.tax === 0) add(c, v, s);
        else add(a, v, s);
        if (v.kind === 'B2C' && v.totals.inter) { const x = interUnreg[v.pos] ||= { pos: v.pos, txval: 0, iamt: 0 }; x.txval += s * v.totals.taxable; x.iamt += s * v.totals.igst; }
    }));
    bills.forEach(v => {
        if (v.rcm) { add(d, v, 1); add(itcRcm, v, 1); return; }
        if (v.itc === false) { add(ineligible, v, 1); return; }
        if (v.totals.tax) add(itcOther, v, 1);
    });
    dns.forEach(v => { if (!v.rcm && v.itc !== false && v.totals.tax) add(reversal, v, 1); });
    const R = o => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, r2(x)]));
    const itcAvail = R({ iamt: itcRcm.iamt + itcOther.iamt, camt: itcRcm.camt + itcOther.camt, samt: itcRcm.samt + itcOther.samt });
    // Credit left over from earlier months (what is still in the input ledgers at the end of last month)
    const prevEnd = lastDay(addMonths(ym, -1));
    const carryIn = R({ iamt: Math.max(0, balance(sysId('inIgst'), prevEnd)), camt: Math.max(0, balance(sysId('inCgst'), prevEnd)), samt: Math.max(0, balance(sysId('inSgst'), prevEnd)) });
    const itcNet = R({ iamt: itcAvail.iamt - reversal.iamt + carryIn.iamt, camt: itcAvail.camt - reversal.camt + carryIn.camt, samt: itcAvail.samt - reversal.samt + carryIn.samt });
    const liab = R({ iamt: a.iamt + b.iamt, camt: a.camt, samt: a.samt });
    const rcmLiab = R({ iamt: d.iamt, camt: d.camt, samt: d.samt });
    return { ym, carryIn, a: R(a), b: R(b), c: R(c), d: R(d), interUnreg: Object.values(interUnreg).map(R), itcRcm: R(itcRcm), itcOther: R(itcOther), reversal: R(reversal), ineligible: R(ineligible), itcAvail, itcNet, liab, rcmLiab, setoff: setOff(liab, itcNet, rcmLiab) };
}
// Rule 88A order: IGST credit first (IGST, then CGST/SGST); CGST credit → CGST then IGST; SGST credit → SGST then IGST. RCM is paid in cash.
function setOff(liab, itc, rcm) {
    const L = { ...liab }, C = { ...itc };
    const use = { iamt: { iamt: 0, camt: 0, samt: 0 }, camt: { camt: 0, iamt: 0 }, samt: { samt: 0, iamt: 0 } };
    const take = (from, to) => { const x = r2(Math.min(Math.max(C[from], 0), Math.max(L[to], 0))); C[from] = r2(C[from] - x); L[to] = r2(L[to] - x); use[from][to] = r2((use[from][to] || 0) + x); };
    take('iamt', 'iamt');
    // IGST credit left over must be used next (Rule 88A), split between CGST and SGST where their own credit falls short,
    // so that no CGST or SGST credit is stranded while cash is paid on the other head.
    const spare = Math.max(C.iamt, 0);
    if (spare > 0) {
        const needC = Math.max(0, L.camt - Math.max(C.camt, 0)), needS = Math.max(0, L.samt - Math.max(C.samt, 0));
        const first = Math.min(spare, needC + needS);
        const toC = needC + needS ? r2(first * needC / (needC + needS)) : 0;
        const giveC = r2(Math.min(toC, L.camt)), giveS = r2(Math.min(first - giveC, L.samt));
        C.iamt = r2(C.iamt - giveC - giveS); L.camt = r2(L.camt - giveC); L.samt = r2(L.samt - giveS);
        use.iamt.camt = giveC; use.iamt.samt = giveS;
        const rest = Math.max(C.iamt, 0), totL = Math.max(L.camt, 0) + Math.max(L.samt, 0);
        if (rest > 0 && totL > 0) {
            const c2 = r2(Math.min(L.camt, rest * Math.max(L.camt, 0) / totL)), s2 = r2(Math.min(L.samt, Math.min(rest, totL) - c2));
            C.iamt = r2(C.iamt - c2 - s2); L.camt = r2(L.camt - c2); L.samt = r2(L.samt - s2);
            use.iamt.camt = r2(use.iamt.camt + c2); use.iamt.samt = r2(use.iamt.samt + s2);
        }
    }
    take('camt', 'camt'); take('camt', 'iamt');
    take('samt', 'samt'); take('samt', 'iamt');
    const cash = { iamt: r2(Math.max(L.iamt, 0) + rcm.iamt), camt: r2(Math.max(L.camt, 0) + rcm.camt), samt: r2(Math.max(L.samt, 0) + rcm.samt) };
    return { use, cash, carry: C, totalCash: r2(cash.iamt + cash.camt + cash.samt) };
}
// Posts the month's ITC set-off as a journal so the GST ledgers in the books match the return.
function postSetOff(ym) {
    const g = gstr3b(ym);
    const u = g.setoff.use;
    const L = [];
    const dr = (k, amt) => amt && L.push({ acc: sysId(k), dr: amt, cr: 0 });
    const cr = (k, amt) => amt && L.push({ acc: sysId(k), dr: 0, cr: amt });
    dr('outIgst', r2(u.iamt.iamt + u.camt.iamt + u.samt.iamt)); dr('outCgst', r2(u.iamt.camt + u.camt.camt)); dr('outSgst', r2(u.iamt.samt + u.samt.samt));
    cr('inIgst', r2(u.iamt.iamt + u.iamt.camt + u.iamt.samt)); cr('inCgst', r2(u.camt.camt + u.camt.iamt)); cr('inSgst', r2(u.samt.samt + u.samt.iamt));
    if (L.length < 2) throw new Error('There is no input tax credit to set off for this month.');
    return saveVoucher({ type: 'JV', date: lastDay(ym), jlines: L, narration: `GST input tax credit set off against output tax for ${ymLabel(ym)} (GSTR-3B, Rule 88A order)` }, { source: 'GSTR-3B set-off' });
}

// ---------- e-invoice (INV-01 schema) and a TEST IRN ----------
function einvoiceJson(v) {
    const p = co.profile, b = contactById(v.partyId);
    const typ = v.type === 'CN' ? 'CRN' : 'INV';
    const supTyp = v.kind === 'SEZ' ? (v.zeroWithPay ? 'SEZWP' : 'SEZWOP') : v.kind === 'EXP' ? (v.zeroWithPay ? 'EXPWP' : 'EXPWOP') : 'B2B';
    return {
        Version: '1.1',
        TranDtls: { TaxSch: 'GST', SupTyp: supTyp, RegRev: 'N', IgstOnIntra: 'N' },
        DocDtls: { Typ: typ, No: v.no, Dt: ddmmyyyy(v.date, '/') },
        SellerDtls: { Gstin: p.gstin, LglNm: p.legalName || p.name, TrdNm: p.name, Addr1: p.address || '-', Loc: p.city || '-', Pin: Number(p.pincode) || 0, Stcd: p.state, Ph: p.phone || null, Em: p.email || null },
        BuyerDtls: { Gstin: b.state === '96' ? 'URP' : b.gstin, LglNm: b.name, Pos: v.pos, Addr1: b.address || '-', Loc: b.city || '-', Pin: b.state === '96' ? 999999 : (Number(b.pincode) || 0), Stcd: b.state },
        ItemList: v.lines.map((l, i) => {
            const it = itemById(l.itemId);
            return { SlNo: String(i + 1), PrdDesc: l.desc || it?.name || '', IsServc: it?.type === 'service' || String(l.hsn).startsWith('99') ? 'Y' : 'N', HsnCd: l.hsn, Qty: Number(l.qty), Unit: l.unit || it?.unit || 'OTH', UnitPrice: Number(l.rate), TotAmt: r2(l.qty * l.rate), Discount: l.discAmt || 0, AssAmt: l.taxable, GstRt: Number(l.gstRate), IgstAmt: l.igst, CgstAmt: l.cgst, SgstAmt: l.sgst, CesRt: 0, CesAmt: 0, TotItemVal: r2(l.taxable + l.cgst + l.sgst + l.igst) };
        }),
        ValDtls: { AssVal: v.totals.taxable, CgstVal: v.totals.cgst, SgstVal: v.totals.sgst, IgstVal: v.totals.igst, CesVal: 0, RndOffAmt: v.totals.roundOff, TotInvVal: v.totals.total }
    };
}
const einvoiceApplies = v => (v.type === 'SI' || v.type === 'CN') && ['B2B', 'SEZ', 'EXP'].includes(v.kind) && (Number(co.profile.aato) || 0) > 50000000;
function generateIrn(id) {
    assertEdit();
    const v = vById(id);
    if (!v || v.status === 'cancelled') throw new Error('Only active invoices can be registered.');
    if (v.irn) throw new Error('This invoice already has an IRN.');
    if (!co.profile.gstin) throw new Error('Add your GSTIN in Settings first.');
    if (!['B2B', 'SEZ', 'EXP'].includes(v.kind)) throw new Error('e-Invoicing covers B2B, SEZ and export invoices. B2C invoices use a dynamic QR instead.');
    if ((Number(co.profile.aato) || 0) >= 100000000 && daysBetween(v.date, todayISO()) > 30) throw new Error(`IRP rejected: for turnover of ₹10 crore or more an e-invoice must be reported within 30 days of its date (this one is ${daysBetween(v.date, todayISO())} days old).`);
    // The real IRN is a SHA-256 hash of supplier GSTIN + financial year + document type + document number.
    v.irn = sha256(`${co.profile.gstin}${fyLabel(fyOf(v.date))}${v.type === 'CN' ? 'CRN' : 'INV'}${v.no}`);
    v.ackNo = String(Date.now()).slice(-12).padStart(15, '1');
    v.ackDt = new Date().toISOString();
    v.irnTest = true;
    audit('e-Invoice IRN generated (TEST)', { entity: 'Voucher', ref: v.no, after: `IRN ${v.irn.slice(0, 16)}… Ack ${v.ackNo}` });
    saveCo();
    return v;
}
function generateEwb(id, info) {
    assertEdit();
    const v = vById(id);
    if (!v) return;
    const E = [];
    if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(String(info.vehicle || '').toUpperCase().replace(/\s/g, ''))) E.push('Vehicle number looks wrong (e.g. TN01AB1234).');
    if (!(Number(info.distance) > 0 && Number(info.distance) <= 4000)) E.push('Distance must be 1 to 4,000 km.');
    if (E.length) throw new Error(E.join('\n'));
    const days = Math.max(1, Math.ceil(Number(info.distance) / 200));   // 200 km per day for regular cargo
    v.ewb = { no: String(Date.now()).slice(-12), vehicle: info.vehicle.toUpperCase().replace(/\s/g, ''), distance: Number(info.distance), mode: info.mode || 'Road', date: todayISO(), validUpto: addDays(todayISO(), days), test: true };
    audit('e-Way bill generated (TEST)', { entity: 'Voucher', ref: v.no, after: `EWB ${v.ewb.no} · ${v.ewb.vehicle} · ${v.ewb.distance} km · valid to ${v.ewb.validUpto}` });
    saveCo();
}
const ewbNeeded = v => v.type === 'SI' && v.status !== 'cancelled' && v.totals.total > 50000 && v.lines.some(l => itemById(l.itemId)?.type !== 'service' && !String(l.hsn).startsWith('99'));

// ---------- GSTR-2B import and matching ----------
function import2b(text, period) {
    const rows = [];
    const t = text.trim();
    if (t.startsWith('{')) {
        const j = JSON.parse(t);
        const d = j.data?.docdata || j.docdata || j.data || j;
        const fp = j.data?.rtnprd || j.rtnprd || '';
        if (fp && !period) period = `${fp.slice(2)}-${fp.slice(0, 2)}`;
        (d.b2b || []).forEach(s => (s.inv || []).forEach(i => {
            const items = i.items || i.itms || [];
            const it = items.length ? items.reduce((a, x) => { const y = x.itm_det || x; return { txval: a.txval + (y.txval || 0), igst: a.igst + (y.igst ?? y.iamt ?? 0), cgst: a.cgst + (y.cgst ?? y.camt ?? 0), sgst: a.sgst + (y.sgst ?? y.samt ?? 0) }; }, { txval: 0, igst: 0, cgst: 0, sgst: 0 }) : i;
            rows.push({ gstin: s.ctin, name: s.trdnm || '', inv: i.inum, date: anyDateToISO(i.dt || i.idt), taxable: r2(it.txval), igst: r2(it.igst), cgst: r2(it.cgst), sgst: r2(it.sgst), value: r2(i.val) });
        }));
    } else {
        const csv = csvParse(t);
        const head = csv.shift().map(h => h.toLowerCase());
        const col = re => head.findIndex(h => re.test(h));
        const c = { g: col(/gstin/), n: col(/name/), i: col(/invoice.*(no|num)|^inv/), d: col(/date/), t: col(/taxable/), ig: col(/igst|integrated/), cg: col(/cgst|central/), sg: col(/sgst|state/) };
        if (c.g < 0 || c.i < 0) throw new Error('The CSV needs at least GSTIN and Invoice number columns.');
        csv.forEach(r => rows.push({ gstin: (r[c.g] || '').trim().toUpperCase(), name: r[c.n] || '', inv: (r[c.i] || '').trim(), date: anyDateToISO(r[c.d]), taxable: r2(r[c.t]), igst: r2(r[c.ig]), cgst: r2(r[c.cg]), sgst: r2(r[c.sg]) }));
    }
    if (!period) throw new Error('Choose the return period for this 2B.');
    if (!rows.length) throw new Error('No B2B invoices were found in the file.');
    co.gstr2b = co.gstr2b.filter(r => r.period !== period);
    rows.forEach(r => co.gstr2b.push({ id: uid('2b'), period, ims: 'Pending', ...r }));
    audit('GSTR-2B imported', { entity: 'GST', ref: ymLabel(period), after: `${rows.length} supplier invoices` });
    saveCo();
    return { period, count: rows.length };
}
function recon2b(period) {
    const bills = activeIn(['PB'], period).filter(v => !v.rcm && isRegistered(contactById(v.partyId)));
    const portal = co.gstr2b.filter(r => r.period === period);
    const used = new Set();
    const out = [];
    bills.forEach(v => {
        const g = contactById(v.partyId).gstin;
        const m = portal.find(r => !used.has(r.id) && r.gstin === g && normInv(r.inv) === normInv(v.refNo));
        const bookTax = v.totals.tax;
        if (!m) { out.push({ status: 'Only in books', v, bookTax, note: 'Supplier has not filed it: ITC cannot be claimed yet (Section 16(2)(aa)).' }); return; }
        used.add(m.id);
        const portalTax = r2(m.igst + m.cgst + m.sgst);
        const ok = Math.abs(portalTax - bookTax) <= 1 && Math.abs(m.taxable - v.totals.taxable) <= 1;
        out.push({ status: ok ? 'Matched' : 'Mismatch', v, r: m, bookTax, portalTax, note: ok ? '' : `Taxable ${inr(v.totals.taxable)} vs ${inr(m.taxable)}, tax ${inr(bookTax)} vs ${inr(portalTax)}` });
    });
    portal.filter(r => !used.has(r.id)).forEach(r => out.push({ status: 'Only in 2B', r, portalTax: r2(r.igst + r.cgst + r.sgst), note: 'Not in your books: enter the bill, or reject it in IMS if it is not yours.' }));
    return out;
}

// ---------- TDS ----------
// kind 'tds' = deducted on purchase bills (Form 140), 'tcs' = collected on sales invoices (Form 143)
const TAX_KIND = {
    tds: { ledger: 'tdsPay', form: '140', oldForm: '26Q', cert: '131 (old 16A)', label: 'TDS', codes: TDS_SECTIONS },
    tcs: { ledger: 'tcsPay', form: '143', oldForm: '27EQ', cert: '133 (old 27D)', label: 'TCS', codes: TCS_SECTIONS }
};
const QUARTERS = { Q1: [4, 5, 6], Q2: [7, 8, 9], Q3: [10, 11, 12], Q4: [1, 2, 3] };
const quarterOf = ym => Object.keys(QUARTERS).find(q => QUARTERS[q].includes(Number(ym.slice(5))));
const returnDue = (fy, q) => ({ Q1: `${fy}-07-31`, Q2: `${fy}-10-31`, Q3: `${fy + 1}-01-31`, Q4: `${fy + 1}-05-31` })[q];
const depositDue = ym => ym.endsWith('-03') ? `${Number(ym.slice(0, 4))}-04-30` : `${addMonths(ym, 1)}-07`;
// "Month or part of a month": a deduction on 15 June paid on 8 July counts as 2 months
const monthsOrPart = (from, to) => to <= from ? 0 : (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;

function taxRegister(kind, fy) {
    const K = TAX_KIND[kind];
    const src = kind === 'tds' ? co.vouchers.filter(v => v.type === 'PB' && v.tds?.amount) : co.vouchers.filter(v => v.type === 'SI' && v.tcs?.amount);
    const rows = src.filter(v => v.status !== 'cancelled' && fyOf(v.date) === fy).map(v => {
        const x = kind === 'tds' ? v.tds : v.tcs;
        return { v, party: contactById(v.partyId), section: x.section, code: K.codes[x.section]?.code, base: x.base, rate: x.rate, amount: x.amount, month: ymOf(v.date) };
    });
    const deposits = co.vouchers.filter(v => v.type === 'PY' && v.status !== 'cancelled' && v.ledgerId === sysId(K.ledger)).sort((a, b) => a.date.localeCompare(b.date));
    const t = todayISO();
    const months = fyMonths(fy).map(ym => {
        const deducted = sum(rows.filter(r => r.month === ym), 'amount');
        const deps = deposits.filter(d => d.taxMonth === ym);
        const paid = sum(deps, 'amount');
        // Date on which the month was fully deposited (or today, if still unpaid)
        let run = 0, paidOn = '';
        deps.forEach(d => { run += d.amount; if (!paidOn && run >= deducted - 0.5) paidOn = d.date; });
        const due = depositDue(ym);
        const until = paidOn || (deducted > paid ? t : '');
        const interest = until && until > due ? Math.round(sum(rows.filter(r => r.month === ym), r => r.amount * 0.015 * monthsOrPart(r.v.date, until))) : 0;
        return { ym, deducted, paid, due, paidOn, pending: r2(deducted - paid), deps, interest };
    });
    return { rows, months, deposits };
}
const tdsRegister = fy => taxRegister('tds', fy);

// Quarterly statement: deductee / collectee rows, challans, checks, interest and late fee
function taxReturn(kind, fy, q) {
    const K = TAX_KIND[kind];
    const R = taxRegister(kind, fy);
    const months = QUARTERS[q].map(m => `${m >= 4 ? fy : fy + 1}-${String(m).padStart(2, '0')}`);
    const rows = R.rows.filter(r => months.includes(r.month));
    const mths = R.months.filter(m => months.includes(m.ym));
    const challans = mths.flatMap(m => m.deps.map(d => ({ v: d, month: m.ym, bsr: d.challan?.bsr || '', serial: d.challan?.serial || '', date: d.date, amount: d.amount })));
    const due = returnDue(fy, q);
    const filing = co.filings.find(f => f.type === `FORM-${K.form}` && f.period === `${q}-${fy}`);
    const total = sum(rows, 'amount');
    const issues = [];
    if (!co.profile.tan) issues.push({ level: 'bad', text: 'Your TAN is missing (Settings → Tax).' });
    if (!co.profile.respName) issues.push({ level: 'warn', text: 'Name of the person responsible for the return is missing (Settings → Tax).' });
    rows.filter(r => !r.party?.pan).forEach(r => issues.push({ level: 'warn', text: `${r.party?.name}: no PAN, so the higher rate applied and no certificate can be issued. Collect the PAN.` }));
    mths.filter(m => m.pending > 0.5).forEach(m => issues.push({ level: 'bad', text: `${ymLabel(m.ym)}: ${inr(m.pending)} ${K.label} not yet deposited (due ${fmtDate(m.due)}).` }));
    mths.filter(m => m.interest).forEach(m => issues.push({ level: 'warn', text: `${ymLabel(m.ym)}: deposited late — interest ${inr(m.interest)} at 1.5% a month from the date of ${kind === 'tds' ? 'deduction' : 'collection'}. Pay it with the next challan.` }));
    challans.filter(c => !c.bsr || !c.serial).forEach(c => issues.push({ level: 'warn', text: `Challan of ${inr(c.amount)} on ${fmtDate(c.date)} has no BSR code / serial number; the return needs them to match the challan.` }));
    const lateTo = filing ? filing.filedOn : todayISO();
    const lateDays = lateTo > due ? daysBetween(due, lateTo) : 0;
    const lateFee = Math.min(lateDays * 200, total);
    if (lateFee && !filing) issues.push({ level: 'bad', text: `The return is ${lateDays} days late: late fee ${inr(lateFee)} (₹200 a day, up to the tax amount) so far.` });
    return { kind, K, fy, q, months, rows, mths, challans, due, filing, total, deposited: sum(challans, 'amount'), interest: sum(mths, 'interest'), lateFee, issues };
}
function taxReturnCsv(ret, part) {
    if (part === 'challans') return toCSV([['Challan serial', 'BSR code', 'Date of deposit', 'Amount', 'For month', 'Tax year', 'Minor head'],
        ...ret.challans.map(c => [c.serial, c.bsr, ddmmyyyy(c.date, '/'), c.amount, ymLabel(c.month), fyLabel(ret.fy), '200 (TDS/TCS payable by taxpayer)'])]);
    return toCSV([[ret.kind === 'tds' ? 'Deductee PAN' : 'Collectee PAN', 'Name', 'Payment code', 'Old section', ret.kind === 'tds' ? 'Date of payment / credit' : 'Date of receipt / debit', 'Amount', 'Rate %', ret.kind === 'tds' ? 'TDS' : 'TCS', 'Date of deposit', 'Challan BSR', 'Challan serial', 'Bill / invoice no'],
        ...ret.rows.map(r => { const m = ret.mths.find(x => x.ym === r.month); const c = m?.deps[0]; return [r.party?.pan || 'PANNOTAVBL', r.party?.name, r.code, ret.K.codes[r.section]?.old, ddmmyyyy(r.v.date, '/'), r.base, r.rate, r.amount, c ? ddmmyyyy(c.date, '/') : '', c?.challan?.bsr || '', c?.challan?.serial || '', r.v.refNo || r.v.no]; })]);
}

// ---------- compliance calendar ----------
function complianceItems(fy) {
    const items = [];
    const add = (type, period, due, label, law) => {
        const f = co.filings.find(x => x.type === type && x.period === period);
        items.push({ type, period, due, label, law, filed: f || null });
    };
    const hasGst = Boolean(co.profile.gstin);
    const hasTds = Boolean(co.profile.tan) || co.vouchers.some(v => v.tds?.amount);
    const hasTcs = co.vouchers.some(v => v.tcs?.amount) || co.contacts.some(c => c.tcsSection);
    const qrmp = co.profile.gstFreq === 'quarterly';
    const tdsReg = taxRegister('tds', fy), tcsReg = taxRegister('tcs', fy);
    // QRMP GSTR-3B: the 22nd for these states, the 24th for the rest
    const day3b = ['22', '23', '24', '26', '27', '29', '30', '31', '32', '33', '34', '35', '36', '37'].includes(co.profile.state) ? '22' : '24';
    fyMonths(fy).forEach(ym => {
        const next = addMonths(ym, 1);
        if (hasGst && !qrmp) {
            add('GSTR-1', ym, `${next}-11`, `GSTR-1 · ${ymLabel(ym)}`, 'CGST Act s.37');
            add('GSTR-3B', ym, `${next}-20`, `GSTR-3B · ${ymLabel(ym)}`, 'CGST Act s.39');
        }
        if (hasGst && qrmp) {
            const q = quarterOf(ym), last = QUARTERS[q].at(-1) === Number(ym.slice(5));
            if (last) {
                add('GSTR-1', `${q}-${fy}`, `${next}-13`, `GSTR-1 (quarterly) · ${q} ending ${ymLabel(ym)}`, 'CGST Act s.37 · QRMP');
                add('GSTR-3B', `${q}-${fy}`, `${next}-${day3b}`, `GSTR-3B (quarterly) · ${q} ending ${ymLabel(ym)}`, 'CGST Act s.39 · QRMP');
            } else add('PMT-06', ym, `${next}-25`, `GST monthly payment PMT-06 · ${ymLabel(ym)}`, 'CGST Rule 61A');
        }
        // A deposit is due only for a month that has tax in it (current and future months are shown as upcoming)
        const open = ym >= ymOf(todayISO());
        if (hasTds && (open || tdsReg.months.find(m => m.ym === ym)?.deducted)) add('TDS-PAY', ym, depositDue(ym), `TDS deposit · ${ymLabel(ym)}`, 'Income-tax Act 2025');
        if (hasTcs && (open || tcsReg.months.find(m => m.ym === ym)?.deducted)) add('TCS-PAY', ym, depositDue(ym), `TCS deposit · ${ymLabel(ym)}`, 'Income-tax Act 2025 s.394');
    });
    Object.keys(QUARTERS).forEach(q => {
        if (hasTds) add('FORM-140', `${q}-${fy}`, returnDue(fy, q), `TDS return Form 140 (old 26Q) · ${q}`, 'Income-tax Act 2025 s.397');
        if (hasTcs) add('FORM-143', `${q}-${fy}`, returnDue(fy, q), `TCS return Form 143 (old 27EQ) · ${q}`, 'Income-tax Act 2025 s.397');
    });
    [['15%', `${fy}-06-15`], ['45%', `${fy}-09-15`], ['75%', `${fy}-12-15`], ['100%', `${fy + 1}-03-15`]].forEach(([p, d]) => add('ADV-TAX', `${p}-${fy}`, d, `Advance tax instalment (${p})`, 'Income-tax Act 2025'));
    if (hasGst) add('GSTR-9', `FY-${fy}`, `${fy + 1}-12-31`, `GSTR-9 annual return · FY ${fyLabel(fy)}`, 'CGST Act s.44');
    if (/Ltd/.test(co.profile.entity)) { add('MSME-1', `H1-${fy}`, `${fy}-10-31`, 'MSME-1 (Apr–Sep dues)', 'Companies Act s.405'); add('MSME-1', `H2-${fy}`, `${fy + 1}-04-30`, 'MSME-1 (Oct–Mar dues)', 'Companies Act s.405'); }
    const t = todayISO();
    items.forEach(i => { i.state = i.filed ? 'filed' : i.due < t ? 'overdue' : daysBetween(t, i.due) <= 7 ? 'soon' : 'upcoming'; });
    return items.sort((a, b) => a.due.localeCompare(b.due));
}
function markFiled(type, period, ref, filedOn) {
    assertEdit();
    if (co.filings.some(f => f.type === type && f.period === period)) throw new Error('Already marked as filed.');
    co.filings.push({ type, period, ref: ref || '', filedOn: filedOn || todayISO(), by: me?.name });
    audit(`${type} marked filed`, { entity: 'Compliance', ref: period, after: ref ? `Ref ${ref}` : 'Filed', reason: ['GSTR-1', 'GSTR-3B'].includes(type) ? 'Entries for this period are now locked against editing' : '' });
    saveCo();
}

// ---------- health check (what needs attention before filing) ----------
function healthCheck() {
    const H = [];
    const add = (level, text, sub, route) => H.push({ level, text, sub, route });
    const t = todayISO();
    const active = co.vouchers.filter(v => v.status !== 'cancelled');
    const ein = active.filter(v => einvoiceApplies(v) && !v.irn);
    if (ein.length) add(ein.some(v => daysBetween(v.date, t) > 20) ? 'bad' : 'warn', `${ein.length} invoice(s) need an e-invoice IRN`, ein.some(v => daysBetween(v.date, t) > 20) ? 'Some are close to or past the 30-day IRP limit' : 'Generate them from the invoice screen', '#/gst');
    const ewb = active.filter(v => ewbNeeded(v) && !v.ewb && daysBetween(v.date, t) <= 15);
    if (ewb.length) add('warn', `${ewb.length} goods invoice(s) above ₹50,000 have no e-way bill`, 'Needed before goods move', '#/sales');
    const tdsMiss = active.filter(v => v.type === 'PB' && !v.tds?.section && tdsSuggested(v));
    if (tdsMiss.length) add('bad', `${tdsMiss.length} bill(s) where TDS looks applicable but was not deducted`, 'Expense becomes partly disallowable', '#/purchases');
    const msme = active.filter(v => v.type === 'PB' && contactById(v.partyId)?.msme && outstanding(v) > 0 && daysBetween(v.date, t) > Math.min(45, Number(contactById(v.partyId).creditDays) || 45));
    if (msme.length) add('bad', `${msme.length} MSME bill(s) unpaid beyond 45 days`, `${inr(sum(msme, v => outstanding(v)))} — disallowed as expense until paid`, '#/report/msme');
    const fy = fyOf(t);
    const overdue = complianceItems(fy).concat(fy - 1 >= fyOf(co.profile.booksFrom) ? complianceItems(fy - 1) : []).filter(i => i.state === 'overdue' && i.due >= co.profile.booksFrom);
    if (overdue.length) add('bad', `${overdue.length} compliance filing(s) overdue`, overdue.slice(0, 3).map(i => i.label).join(', '), '#/calendar');
    const soon = complianceItems(fy).filter(i => i.state === 'soon');
    if (soon.length) add('info', `${soon.length} filing(s) due within 7 days`, soon.map(i => `${i.label} on ${fmtDate(i.due)}`).join(', '), '#/calendar');
    const notIn2b = [...new Set(co.gstr2b.map(r => r.period))].flatMap(p => recon2b(p)).filter(x => x.status !== 'Matched');
    if (notIn2b.length) add('warn', `${notIn2b.length} GSTR-2B difference(s) to resolve`, 'Input tax credit at risk', '#/gst/2b');
    const unrec = co.bankLines.filter(b => !b.vid);
    if (unrec.length) add('warn', `${unrec.length} bank statement line(s) not reconciled`, 'Match or create entries', '#/bank');
    const overdueRec = active.filter(v => v.type === 'SI' && outstanding(v) > 0 && dueDate(v) < t);
    if (overdueRec.length) add('info', `${overdueRec.length} customer invoice(s) overdue`, `${inr(sum(overdueRec, v => outstanding(v)))} to collect`, '#/report/ageing-r');
    if (Math.abs(openingDifference()) > 0.004) add('warn', 'Opening balances do not tally', `Difference ${inr(openingDifference())}`, '#/accounts');
    const chain = verifyChain(co.audit);
    if (!chain.ok) add('bad', 'Audit trail integrity check FAILED', `Entry ${chain.at} has been altered outside the software`, '#/audit');
    return H;
}

// ---------- reading a bill from a photo / PDF ----------
const loadScript = src => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the reader. Bill reading needs an internet connection the first time.'));
    document.head.appendChild(s);
});
async function readBillFile(file, onProgress = () => { }) {
    if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        let text = '';
        for (let p = 1; p <= Math.min(pdf.numPages, 3); p++) {
            const page = await pdf.getPage(p);
            const tc = await page.getTextContent();
            // Rebuild lines from text positions so labels and amounts stay together
            const lines = {};
            tc.items.forEach(i => { const y = Math.round(i.transform[5] / 3); (lines[y] ||= []).push(i); });
            text += Object.keys(lines).sort((a, b) => b - a).map(y => lines[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ')).join('\n') + '\n';
        }
        if (text.replace(/\s/g, '').length > 40) { onProgress(100, 'Text read from PDF'); return text; }
        // Scanned PDF: render the first page and OCR it
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 2.2 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        return ocrImage(canvas, onProgress);
    }
    return ocrImage(file, onProgress);
}
async function ocrImage(src, onProgress) {
    await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    const r = await window.Tesseract.recognize(src, 'eng', { logger: m => m.status === 'recognizing text' && onProgress(Math.round(m.progress * 100), 'Reading the bill') });
    return r.data.text;
}

// Pulls GSTINs, invoice number, date, HSN, taxable value, taxes and total out of the bill text.
function parseInvoiceText(raw) {
    const text = String(raw || '').replace(/\r/g, '');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const U = text.toUpperCase();
    // GSTINs, repairing common OCR swaps (O/0, I/1, S/5, B/8) in digit and letter positions
    const toDigit = { O: '0', D: '0', Q: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' };
    const toLetter = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', 2: 'Z', 6: 'G' };
    const fix = s => s.split('').map((ch, i) => ([0, 1, 7, 8, 9, 10].includes(i) ? (toDigit[ch] || ch) : [2, 3, 4, 5, 6, 11].includes(i) ? (toLetter[ch] || ch) : i === 13 ? 'Z' : ch)).join('');
    // GSTINs with the line they sit on, so we know who is the seller (top of the bill) and who is the buyer ("Bill to")
    const gstins = [], gLine = {};
    const found = (g, li) => { if (gstinValid(g) && !gstins.includes(g)) { gstins.push(g); gLine[g] = li; return true; } return false; };
    const ULines = U.split('\n');
    ULines.forEach((l, li) => {
        (l.replace(/[ \t]/g, '').match(/[0-9ODQ]{2}[A-Z0-9]{10}[A-Z0-9][Z2][A-Z0-9]/g) || []).forEach(c => found(fix(c), li));
        // OCR sometimes inserts one character; on lines that mention GST, try 16-character runs with one character removed.
        // A repair is accepted only when the GSTIN check digit confirms it.
        if (!/GST/.test(l)) return;
        l.replace(/GSTIN|GST\s*NO|GST/g, ' ').replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length === 16).forEach(w => {
            if (gstins.some(g => w.includes(g))) return;
            for (let k = 0; k < 16; k++) if (found(fix(w.slice(0, k) + w.slice(k + 1)), li)) break;
        });
    });
    gstins.sort((a, b) => gLine[a] - gLine[b]);
    const buyerRe = /(BILL(ED)?\s*TO|BUYER|CONSIGNEE|SHIP(PED)?\s*TO|RECIPIENT|CUSTOMER|SOLD\s*TO|M\/S)/;
    const buyerGstin = gstins.find(g => ULines.slice(Math.max(0, gLine[g] - 2), gLine[g] + 1).some(l => buyerRe.test(l)));
    const amountsIn = s => (s.match(/-?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})|-?\d+(?:\.\d{1,2})?/g) || []).map(x => Number(x.replace(/,/g, ''))).filter(n => !isNaN(n));
    const lastAmount = re => {
        let best = null;
        lines.forEach(l => {
            if (!re.test(l)) return;
            const a = amountsIn(l.replace(/\d+(\.\d+)?\s*%/g, '')).filter(n => n >= 0);
            if (a.length) best = a.at(-1);
        });
        return best;
    };
    const maxAmount = re => {
        let best = null;
        lines.forEach(l => { if (re.test(l)) amountsIn(l).forEach(n => { if (best === null || n > best) best = n; }); });
        return best;
    };
    let invoiceNo = '';
    const mInv = text.match(/(?:invoice|inv|bill)\s*(?:no\.?|number|#)\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\/\-]{0,15})/i) || text.match(/(?:invoice|bill)\s*[:#]\s*([A-Z0-9][A-Z0-9\/\-]{0,15})/i);
    if (mInv) invoiceNo = mInv[1].replace(/[.\-\/]+$/, '');
    const dateRe = /(\d{1,2}[-/.](?:\d{1,2}|[A-Za-z]{3})[-/.]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s[A-Za-z]{3}\s\d{4})/;
    let date = '';
    const dateLine = lines.find(l => /date/i.test(l) && dateRe.test(l) && !/due/i.test(l));
    const dm = (dateLine || text).match(dateRe);
    if (dm) date = anyDateToISO(dm[1].replace(/\./g, '-').replace(/\s/g, '-'));
    const hsn = [...new Set([...text.matchAll(/(?:HSN|SAC)(?:\s*\/\s*SAC)?\s*(?:code)?\s*[:\-]?\s*(\d{4,8})\b/gi)].map(m => m[1]))];
    // Item tables: an "HSN" column header, then 4/6/8-digit codes (not amounts) on the lines below it
    const hIdx = lines.findIndex(l => /\b(HSN|SAC)\b/i.test(l) && !/\d{4}/.test(l));
    if (hIdx >= 0) lines.slice(hIdx + 1, hIdx + 15).forEach(l => {
        if (/(total|taxable|cgst|sgst|igst)/i.test(l)) return;
        const m = l.match(/(?:^|\s)(\d{4}|\d{6}|\d{8})(?=\s|$)/);
        if (m && !hsn.includes(m[1])) hsn.push(m[1]);
    });
    const cgst = lastAmount(/\bCGST\b/i), sgst = lastAmount(/\b(SGST|UTGST)\b/i), igst = lastAmount(/\bIGST\b/i);
    const rateM = text.match(/IGST\s*@?\s*(\d{1,2}(?:\.\d+)?)\s*%/i) || text.match(/CGST\s*@?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
    let rate = rateM ? Number(rateM[1]) * (/IGST/i.test(rateM[0]) ? 1 : 2) : null;
    let total = lastAmount(/(grand\s*total|invoice\s*(total|value|amount)|total\s*amount|amount\s*payable|net\s*(amount|payable)|total\s*\(?inr)/i) ?? maxAmount(/\btotal\b/i);
    let taxable = lastAmount(/(taxable\s*(value|amount)|sub\s*-?\s*total|assessable\s*value|total\s*before\s*tax)/i);
    const tax = r2((cgst || 0) + (sgst || 0) + (igst || 0));
    if (taxable == null && total != null) taxable = r2(total - tax);
    if (total == null && taxable != null) total = r2(taxable + tax);
    if (rate == null && taxable) rate = GST_RATES.reduce((b, r) => Math.abs(taxable * r / 100 - tax) < Math.abs(taxable * b / 100 - tax) ? r : b, 0);
    if (rate != null && !GST_RATES.includes(rate)) rate = GST_RATES.reduce((b, r) => Math.abs(r - rate) < Math.abs(b - rate) ? r : b, 0);
    // Seller name: the first line that looks like a name (before the first GSTIN line)
    const nameLine = lines.slice(0, 8).find(l => /[A-Za-z]{3,}/.test(l) && !/(tax\s*invoice|invoice|bill of supply|original|duplicate|gstin|phone|mobile|email|date)/i.test(l) && l.length <= 60);
    const r = { gstins, buyerGstin, invoiceNo, date, hsn, cgst, sgst, igst, tax, taxable, total, rate, sellerName: nameLine || '', text };
    const checks = [];
    if (taxable != null && rate != null) {
        const expect = r2(taxable * rate / 100);
        if (tax && Math.abs(expect - tax) > 2) checks.push(`Tax on the bill (${inr(tax)}) does not equal ${rate}% of ${inr(taxable)} (${inr(expect)}). Please check the figures.`);
    }
    if (cgst && sgst && Math.abs(cgst - sgst) > 1) checks.push('CGST and SGST on the bill are not equal.');
    if (cgst && igst) checks.push('The bill shows both CGST and IGST; only one kind applies to a supply.');
    r.checks = checks;
    r.confidence = [gstins.length, invoiceNo, date, total, taxable].filter(Boolean).length;
    return r;
}

// Turns the parsed bill into a ready-to-review voucher: purchase if we are the buyer, sales if we are the seller.
function draftFromBill(p) {
    const ours = co.profile.gstin;
    let type = 'PB', partyGstin = p.gstins.find(g => g !== ours) || '';
    // We are the seller when our GSTIN is not the "Bill to" one and appears first on the document
    if (ours && p.gstins.includes(ours) && p.buyerGstin !== ours && (p.buyerGstin || p.gstins[0] === ours)) type = 'SI';
    const party = co.contacts.find(c => c.gstin && c.gstin === partyGstin) || (!partyGstin && p.sellerName ? co.contacts.find(c => c.name.toLowerCase() === p.sellerName.toLowerCase()) : null);
    const it = co.items.find(i => p.hsn.includes(i.hsn));
    const rate = p.rate ?? party?.lastRate ?? 18;
    const v = {
        type, date: p.date && p.date <= todayISO() ? p.date : todayISO(), partyId: party?.id || '', refNo: type === 'PB' ? p.invoiceNo : '', refDate: p.date,
        lines: [{ itemId: it?.id || '', desc: it?.name || (type === 'PB' ? 'As per supplier bill' : 'As per invoice'), hsn: p.hsn[0] || it?.hsn || '', qty: 1, unit: it?.unit || 'NOS', rate: p.taxable || 0, disc: 0, gstRate: rate, accId: party?.lastAcc || '' }],
        narration: `Entered from scanned bill${p.invoiceNo ? ' ' + p.invoiceNo : ''}`
    };
    const newParty = !party && partyGstin ? { type: type === 'PB' ? 'vendor' : 'customer', name: p.sellerName || `Party ${partyGstin}`, gstin: partyGstin, state: partyGstin.slice(0, 2), pan: partyGstin.slice(2, 12) } : null;
    return { type, v, newParty, partyGstin };
}
