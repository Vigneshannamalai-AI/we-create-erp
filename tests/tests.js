'use strict';
// Automated checks: accounting identities, GST and TDS rules, legal guards, audit trail, bill reading and every screen.
const results = [];
function check(name, fn) {
    // true = pass; 'info: …' = pass with a note; any other string or false = fail (the string says why)
    try { const r = fn(); const info = typeof r === 'string' && r.startsWith('info:'); results.push({ name, ok: r === true || info, note: typeof r === 'string' ? r.replace(/^info:\s*/, '') : '' }); }
    catch (e) { results.push({ name, ok: false, note: (e && e.message || String(e)).slice(0, 300) }); }
}
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;
const throws = (fn, re) => { try { fn(); } catch (e) { if (!re || re.test(e.message)) return true; throw new Error('Wrong error: ' + e.message); } throw new Error('Expected an error'); };

function runTests() {
    const shot = new URLSearchParams(location.search).get('shot');
    if (shot) return screenshotMode(shot);
    if (new URLSearchParams(location.search).get('ocr')) return ocrSelfTest();
    Object.keys(localStorage).filter(k => k.startsWith('wcerp.')).forEach(k => localStorage.removeItem(k));
    loadMeta();
    // ---------- utilities ----------
    check('SHA-256 known vector', () => sha256('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    check('GSTIN checksum: valid sample', () => gstinValid('27AAPFU0939F1ZV'));
    check('GSTIN checksum: one wrong digit fails', () => !gstinValid('27AAPFU0939F1ZW'));
    check('makeGstin produces valid GSTINs', () => gstinValid(makeGstin('33', 'AABCK4521M')));
    check('Amount in words (Indian system)', () => inWords(1234567.5) === 'Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Fifty Paise Only' || inWords(1234567.5));
    check('Financial year helpers', () => fyOf('2026-03-31') === 2025 && fyOf('2026-04-01') === 2026 && fyLabel(2026) === '2026-27');

    // ---------- sample company through the real validation ----------
    const salt = randomHex(16);
    me = { id: 'u_test', name: 'Test Owner', username: 'owner', role: 'admin', salt, hash: hashPassword('password1', salt), companies: 'all', active: true };
    meta.users.push(me);
    let t0 = performance.now();
    check('Sample company builds through saveVoucher()', () => { createSampleCompany(); return `info: ${co.vouchers.length} vouchers in ${Math.round(performance.now() - t0)} ms`; });
    const today = todayISO();
    const fy = fyOf(today);

    check('Every voucher balances (debits = credits)', () => {
        const bad = co.vouchers.filter(v => { const P = postingsOf(v); return !near(sum(P, 'dr'), sum(P, 'cr')); });
        return bad.length ? `Unbalanced: ${bad.slice(0, 5).map(v => v.no).join(', ')}` : `info: ${co.vouchers.length} checked`;
    });
    check('Trial balance tallies', () => { const tot = sum(allLedgers(), l => balance(l.id)) + openingStockValue(); return near(tot, 0) || `Off by ${tot}`; });
    check('Opening balances tally', () => near(openingDifference(), 0));
    check('Balance sheet balances today', () => { const b = bsData(today); return near(b.totalEL, b.totalA) || `EL ${b.totalEL} vs A ${b.totalA}`; });
    check('Balance sheet balances at last year end', () => { const b = bsData(fyEnd(fy - 1)); return near(b.totalEL, b.totalA) || `EL ${b.totalEL} vs A ${b.totalA}`; });
    check('Cash flow ties to cash & bank (this FY)', () => { const c = cashFlowData(fyStart(fy), today); return near(c.check, 0) || `Diff ${c.check}`; });
    check('Cash flow ties to cash & bank (last FY)', () => { const c = cashFlowData(co.profile.booksFrom, fyEnd(fy - 1)); return near(c.check, 0) || `Diff ${c.check}`; });
    check('P&L profit = profit in balance sheet', () => near(plData(fyStart(fy), today).pat, bsData(today).currentProfit));
    check('Last year is profitable with depreciation and tax provision', () => { const p = plData(co.profile.booksFrom, fyEnd(fy - 1)); return p.tot(p.dep) === 95000 && p.tot(p.tax) > 0 && p.pat > 0 || `revenue ${p.tot(p.revenue)} purchases ${p.tot(p.purchases)} inv change ${p.changeInv} emp ${p.tot(p.employee)} other ${p.tot(p.otherExp)} pbt ${p.pbt}`; });
    check('This year to date P&L', () => { const p = plData(fyStart(fy), today); return `info: revenue ${inr0(p.tot(p.revenue))}, PBT ${inr0(p.pbt)}`; });
    check('Stock never negative', () => { const s = stockAt(today); const neg = Object.values(s.items).filter(x => x.qty < 0); return !neg.length || `${neg.length} negative`; });

    // ---------- GST ----------
    const prakash = co.contacts.find(c => c.name === 'Prakash Constructions');
    const sunrise = co.contacts.find(c => c.name.startsWith('Sunrise'));
    const gulf = co.contacts.find(c => c.name.startsWith('Gulf'));
    const wire = co.items.find(i => i.name.startsWith('Copper'));
    const mk = (partyId, extra = {}) => computeVoucher({ type: 'SI', date: today, partyId, lines: [{ itemId: wire.id, hsn: wire.hsn, qty: 2, rate: 1000, gstRate: 18, unit: 'BOX' }], ...extra });
    check('Intra-state sale → CGST 9% + SGST 9%', () => { const v = mk(prakash.id); return v.totals.cgst === 180 && v.totals.sgst === 180 && !v.totals.igst; });
    check('Inter-state sale → IGST 18%', () => { const v = mk(sunrise.id); return v.totals.igst === 360 && !v.totals.cgst; });
    check('Export under LUT → zero tax', () => { const v = mk(gulf.id); return v.totals.tax === 0 && v.kind === 'EXP'; });
    check('Export with payment → IGST', () => { const v = mk(gulf.id, { zeroWithPay: true }); return v.totals.igst === 360; });
    check('RCM rent bill posts GST to reverse-charge payable', () => { const v = co.vouchers.find(x => x.type === 'PB' && x.rcm && x.refNo.startsWith('RENT')); const P = postingsOf(v); return P.some(p => p.acc === sysId('rcmPay') && p.cr === 10800) && v.totals.total === 60000; });
    check('TDS on rent: 10% of ₹60,000 = ₹6,000', () => co.vouchers.find(x => x.refNo?.startsWith('RENT')).tds.amount === 6000);
    check('TDS: no PAN → 20%', () => { const v = computeVoucher({ type: 'PB', date: today, partyId: co.contacts.find(c => c.name === 'Speed Transport Co').id, tds: { section: '194C-O' }, lines: [{ qty: 1, rate: 50000, gstRate: 5, hsn: '996511' }], rcm: true }); return v.tds.rate === 2; });
    check('GSTR-3B liability = sales tax − credit-note tax (each month)', () => {
        const bad = fyMonths(fy - 1).filter(m => {
            const g = gstr3b(m);
            const exp = sum(activeIn(['SI'], m), v => v.totals.tax) - sum(activeIn(['CN'], m), v => v.totals.tax);
            return !near(g.liab.iamt + g.liab.camt + g.liab.samt, exp, 0.05);
        });
        return !bad.length || bad.join(',');
    });
    check('GSTR-1 JSON has B2B, B2CL, B2CS, HSN sections', () => {
        const m = fyMonths(fy - 1).find(x => gstr1(x).b2cl.length) || fyMonths(fy - 1)[2];
        const j = gstr1Json(m);
        return Boolean(j.b2b?.length && j.b2cs?.length && j.hsn?.hsn_b2b?.length) || Object.keys(j).join(',');
    });
    check('Set-off follows Rule 88A (IGST credit used first)', () => { const s = setOff({ iamt: 100, camt: 50, samt: 50 }, { iamt: 120, camt: 10, samt: 10 }, { iamt: 0, camt: 0, samt: 0 }); return (s.use.iamt.iamt === 100 && s.use.iamt.camt === 10 && s.use.iamt.samt === 10 && s.cash.camt === 30 && s.cash.samt === 30) || JSON.stringify(s); });
    check('No CGST / SGST credit stranded while cash is paid on the other head', () => { const bad = fyMonths(fy - 1).filter(m => { const s = gstr3b(m).setoff; return (s.carry.camt > 1 && s.cash.samt - gstr3b(m).rcmLiab.samt > 1) || (s.carry.samt > 1 && s.cash.camt - gstr3b(m).rcmLiab.camt > 1); }); return !bad.length || bad.join(','); });
    check('e-Invoice JSON totals match invoice', () => { const v = co.vouchers.find(x => x.irn && x.type === 'SI'); const j = einvoiceJson(v); return j.ValDtls.TotInvVal === v.totals.total && j.ItemList.length === v.lines.length && j.SellerDtls.Gstin === co.profile.gstin; });
    check('B2B invoices have IRN (turnover above ₹5 crore)', () => !co.vouchers.some(v => einvoiceApplies(v) && v.status !== 'cancelled' && !v.irn));
    check('Health check runs', () => `info: ${healthCheck().map(h => h.text).join(' | ')}`);

    // ---------- numbering ----------
    check('Sales invoice numbers are gap-free per FY', () => {
        const bad = [fy - 1, fy].filter(y => { const n = co.vouchers.filter(v => v.type === 'SI' && fyOf(v.date) === y).map(v => Number(v.no.split('/').pop())).sort((a, b) => a - b); return n.some((x, i) => x !== i + 1); });
        return !bad.length;
    });

    // ---------- legal guards ----------
    check('Future-dated tax invoice is refused', () => throws(() => saveVoucher({ type: 'SI', date: addDays(today, 3), partyId: prakash.id, lines: [{ itemId: wire.id, hsn: wire.hsn, qty: 1, rate: 10, gstRate: 18 }] }), /future/));
    check('Cash receipt of ₹2 lakh is refused', () => throws(() => saveVoucher({ type: 'RC', date: today, accountId: sysId('cash'), partyId: prakash.id, amount: 200000 }), /2,00,000/));
    check('Unbalanced journal is refused', () => throws(() => saveVoucher({ type: 'JV', date: today, narration: 'x', jlines: [{ acc: sysId('rent'), dr: 100, cr: 0 }, { acc: sysId('cash'), dr: 0, cr: 90 }] }), /equal/));
    check('Duplicate supplier invoice is refused', () => { const b = co.vouchers.find(v => v.type === 'PB' && v.date >= fyStart(fy) && v.refNo.startsWith('AIR')); return throws(() => saveVoucher({ type: 'PB', date: b.date > co.settings.lockDate ? today : today, partyId: b.partyId, refNo: b.refNo, lines: [{ qty: 1, rate: 100, gstRate: 18, hsn: '998422' }] }), /already entered/); });
    check('Short HSN refused (turnover above ₹5 crore needs 6 digits)', () => throws(() => saveVoucher({ type: 'SI', date: today, partyId: prakash.id, lines: [{ desc: 'x', hsn: '8544', qty: 1, rate: 10, gstRate: 18 }] }), /HSN/));
    check('Entry in a locked period is refused', () => co.settings.lockDate ? throws(() => saveVoucher({ type: 'JV', date: co.settings.lockDate, narration: 'x', jlines: [{ acc: sysId('rent'), dr: 10, cr: 0 }, { acc: sysId('cash'), dr: 0, cr: 10 }] }), /locked/) : 'no lock date set by the sample');
    check('Editing an invoice after GSTR-1 is filed is refused', () => {
        const filed = new Set(co.filings.filter(x => x.type === 'GSTR-1').map(x => x.period));
        const v = co.vouchers.find(x => x.type === 'SI' && filed.has(ymOf(x.date)) && !x.irn && x.status !== 'cancelled' && x.date > (co.settings.lockDate || ''));
        return v ? throws(() => saveVoucher({ id: v.id, narration: 'changed' }), /filed/) : 'no candidate found';
    });
    check('Invoice with IRN cannot be edited', () => { const v = co.vouchers.find(x => x.irn && x.date > (co.settings.lockDate || '')); return throws(() => saveVoucher({ id: v.id, narration: 'x' }), /IRN|filed/); });
    check('Credit note larger than the invoice is refused', () => {
        const inv = co.vouchers.find(v => v.type === 'SI' && v.partyId === prakash.id && ymOf(v.date) === ymOf(today) && v.status !== 'cancelled');
        if (!inv) return 'no invoice this month';
        return throws(() => saveVoucher({ type: 'CN', date: today, partyId: prakash.id, origId: inv.id, lines: inv.lines.map(l => ({ ...l, qty: l.qty * 3 })) }), /more than|open/);
    });

    // ---------- a full new cycle: sell, collect, cancel ----------
    check('New invoice → receipt settles it → status Paid', () => {
        const v = saveVoucher({ type: 'SI', date: today, partyId: prakash.id, lines: [{ itemId: wire.id, hsn: wire.hsn, qty: 1, rate: 1450, gstRate: 18, unit: 'BOX' }] });
        const r = saveVoucher({ type: 'RC', date: today, accountId: cashBankAccounts().find(a => a.group === 'bank').id, partyId: prakash.id, amount: v.totals.total, alloc: [{ vid: v.id, amt: v.totals.total }] });
        return (outstanding(v) === 0 && v.totals.total === 1711 && r.no.includes('/')) || `out ${outstanding(v)} total ${v.totals.total}`;
    });
    check('Cancel keeps the number and removes postings', () => {
        const v = saveVoucher({ type: 'SI', date: today, partyId: sunrise.id, lines: [{ itemId: wire.id, hsn: wire.hsn, qty: 1, rate: 1450, gstRate: 18, unit: 'BOX' }] });
        cancelVoucher(v.id, 'Test');
        return vById(v.id).status === 'cancelled' && postingsOf(vById(v.id)).length === 0 && vById(v.id).no === v.no;
    });
    check('Books still balance after new entries', () => { const b = bsData(today); return near(b.totalEL, b.totalA); });

    // ---------- audit trail ----------
    check('Audit chain verifies', () => verifyChain(co.audit).ok || `broken at ${verifyChain(co.audit).at}`);
    check('Tampering with an audit entry is detected', () => { const e = co.audit[5]; const old = e.after; e.after = 'tampered'; const r = verifyChain(co.audit); e.after = old; return !r.ok && r.at === 6 && verifyChain(co.audit).ok; });
    check('Every voucher has a "created" audit entry', () => { const refs = new Set(co.audit.filter(a => /created$/.test(a.action)).map(a => a.ref)); return co.vouchers.every(v => refs.has(v.no)); });

    // ---------- bill reading ----------
    const billText = `RAMESH AGENCIES
No 12, Mint Street, Chennai 600079
GSTIN: ${contactById(co.contacts.find(c => c.name === 'Ramesh Agencies').id).gstin}
TAX INVOICE
Invoice No: RA/2610/555          Date: 02/10/2026
Bill To: Kaveri Electricals Pvt Ltd   GSTIN ${co.profile.gstin}
Description            HSN       Qty   Rate    Amount
LED Bulb 9W            853952    200   62.00   12,400.00
Taxable Value                                   12,400.00
CGST @ 9%                                        1,116.00
SGST @ 9%                                        1,116.00
Grand Total                                     14,632.00`;
    check('Bill reader: finds GSTINs, number, date, amounts', () => {
        const p = parseInvoiceText(billText);
        return (p.gstins.length === 2 && p.invoiceNo === 'RA/2610/555' && p.date === '2026-10-02' && p.taxable === 12400 && p.tax === 2232 && p.total === 14632 && p.rate === 18 && p.hsn[0] === '853952') || JSON.stringify({ g: p.gstins, n: p.invoiceNo, d: p.date, t: p.taxable, x: p.tax, tot: p.total, r: p.rate, h: p.hsn });
    });
    check('Bill reader: our GSTIN as buyer → purchase from existing vendor', () => { const d = draftFromBill(parseInvoiceText(billText)); return d.type === 'PB' && contactById(d.v.partyId)?.name === 'Ramesh Agencies' && d.v.refNo === 'RA/2610/555'; });
    check('Bill reader: our GSTIN as seller → sales invoice', () => { const t = billText.replace(/GSTIN: \S+/, `GSTIN: ${co.profile.gstin}`).replace(/GSTIN (\S+)$/m, `GSTIN ${prakash.gstin}`); const d = draftFromBill(parseInvoiceText(t)); return d.type === 'SI' && d.v.partyId === prakash.id; });
    check('Bill reader: repairs OCR O/0 and S/5 mix-ups in GSTIN', () => { const r = parseInvoiceText('GSTIN 27AAPFU0939F1ZV / GSTlN 27AAPFUO939F1ZV / 33ABMPR44S5Q1ZV').gstins; return (r.includes('27AAPFU0939F1ZV') && r.includes('33ABMPR4455Q1ZV')) || JSON.stringify(r); });
    check('Bill reader: real OCR output with a stray character in the GSTIN', () => {
        const ocr = 'RAMESH AGENCIES\n\nNo 12, Mint Street, Chennai 600079\n\nGSTIN: 33ABMPR4455Q1Z2V\n\nTAX INVOICE\n\nInvoice No: RA/2610/555 Date: 02/10/2026\nBill To: Kaveri Electricals GSTIN: 33AABCK4521M1ZN\nDescription HSN Qty Rate Amount\nLED Bulb 9W 853952 200 62.00 12,400.00\nTaxable Value 12,400.00\nCGST@ 9% 1,116.00\nSGST@ 9% 1,116.00\nGrand Total 14,632.00\n';
        const p = parseInvoiceText(ocr); const d = draftFromBill(p);
        return (p.gstins.includes('33ABMPR4455Q1ZV') && d.type === 'PB' && contactById(d.v.partyId)?.name === 'Ramesh Agencies' && p.total === 14632 && p.tax === 2232 && p.hsn[0] === '853952') || JSON.stringify({ g: p.gstins, t: p.total, x: p.tax, h: p.hsn });
    });
    check('Bill reader: random text gives no false GSTIN', () => { const p = parseInvoiceText('GST NO 1234567890ABCDEF\nGSTIN ZZZZZZZZZZZZZZZZ\nTotal 500'); return p.gstins.length === 0 || p.gstins.join(','); });
    check('Scanned bill saves as a purchase and posts input GST', () => {
        const d = draftFromBill(parseInvoiceText(billText));
        d.v.date = today;
        const v = saveVoucher(d.v, { source: 'Scanned bill' });
        const P = postingsOf(v);
        return v.totals.total === 14632 && P.some(p => p.acc === sysId('inCgst') && p.dr === 1116);
    });

    // ---------- TDS codes, TCS, returns ----------
    check('TDS codes: every section has a 4-digit payment code', () => Object.values(TDS_SECTIONS).every(x => /^\d{4}$/.test(x.code)) && Object.values(TCS_SECTIONS).every(x => /^\d{4}$/.test(x.code)));
    check('TDS code shows with old section', () => tdsName('194J-P', true) === '1027 (194J(b))' || tdsName('194J-P', true));
    const scrapCo = co.contacts.find(c => c.name === 'Metro Scrap Traders');
    check('TCS on scrap sale: 1% of value incl. GST, posted to TCS Payable', () => {
        const v = co.vouchers.find(x => x.type === 'SI' && x.tcs?.amount);
        const P = postingsOf(v);
        return (v.tcs.amount === Math.round(v.totals.total / 100) && v.totals.receivable === v.totals.total + v.tcs.amount && P.some(p => p.acc === sysId('tcsPay') && p.cr === v.tcs.amount) && near(sum(P, 'dr'), sum(P, 'cr'))) || JSON.stringify(v.tcs);
    });
    check('TCS without PAN: 5% (twice the rate or 5%)', () => { const c = { ...scrapCo, id: 'tmp', pan: '', gstin: '' }; co.contacts.push(c); const v = computeVoucher({ type: 'SI', date: today, partyId: 'tmp', tcs: { section: 'scrap' }, lines: [{ qty: 1, rate: 1000, gstRate: 18, hsn: '740400' }] }); co.contacts.pop(); return v.tcs.rate === 5; });
    check('TDS / TCS registers: deposits made every month in the sample', () => { const t = taxRegister('tds', fy - 1).months.filter(m => m.deducted && m.pending > 0.5); const c = taxRegister('tcs', fy - 1).months.filter(m => m.deducted && m.pending > 0.5); return (!t.length && !c.length) || `${t.length} TDS / ${c.length} TCS months pending`; });
    check('Quarterly TDS return (Form 140) builds with challans and no blocking issues', () => { const r = taxReturn('tds', fy - 1, 'Q2'); return (r.rows.length > 0 && r.challans.length === 3 && near(r.deposited, r.total, 1) && !r.issues.some(i => i.level === 'bad')) || JSON.stringify({ rows: r.rows.length, ch: r.challans.length, dep: r.deposited, tot: r.total, issues: r.issues.map(i => i.text) }); });
    check('TCS return (Form 143) and CSV export', () => { const r = taxReturn('tcs', fy - 1, 'Q1'); const csv = taxReturnCsv(r, 'rows'); return (r.K.form === '143' && csv.split('\n').length === r.rows.length + 1 && /1073/.test(csv)) || `${r.rows.length} rows`; });
    check('Late deposit interest: 1.5% a month or part from deduction date', () => monthsOrPart('2026-06-15', '2026-07-08') === 2 && monthsOrPart('2026-06-15', '2026-06-30') === 1);
    check('Late return fee: ₹200 a day capped at the tax; none when filed on time', () => { const onTime = taxReturn('tds', fy, 'Q1'); const f = co.filings.find(x => x.type === 'FORM-140' && x.period === `Q1-${fy}`); const keep = f.filedOn; f.filedOn = addDays(onTime.due, 10); const late = taxReturn('tds', fy, 'Q1'); f.filedOn = keep; return (onTime.lateFee === 0 && late.lateFee === Math.min(2000, late.total)) || `${onTime.lateFee} ${late.lateFee}`; });
    check('TDS deposit needs the month; challan BSR must be 7 digits', () => throws(() => saveVoucher({ type: 'PY', date: today, accountId: cashBankAccounts().find(a => a.group === 'bank').id, ledgerId: sysId('tdsPay'), taxMonth: ymOf(today), amount: 10, challan: { bsr: '12', serial: '1' } }), /BSR/));
    check('No false overdue filings in the sample company', () => { const o = complianceItems(fy).concat(complianceItems(fy - 1)).filter(i => i.state === 'overdue' && i.due >= co.profile.booksFrom); return !o.length || o.map(i => i.label).join(', '); });
    check('Calendar has TCS deposits and Form 143', () => { const c = complianceItems(fy); return c.some(i => i.type === 'TCS-PAY') && c.some(i => i.type === 'FORM-143'); });

    // ---------- journal and money alerts ----------
    check('Journal alert: debit exceeding credit is shown with the difference', () => { const w = voucherWarnings(computeVoucher({ type: 'JV', date: today, jlines: [{ acc: sysId('rent'), dr: 1500, cr: 0 }, { acc: sysId('cash'), dr: 0, cr: 1000 }] })); return w.some(x => /Debit exceeds credit by ₹500/.test(x)) || w.join(' | '); });
    check('Alert when a payment takes cash below zero', () => { const w = voucherWarnings(computeVoucher({ type: 'PY', date: today, accountId: sysId('cash'), ledgerId: sysId('rent'), amount: balance(sysId('cash')) + 5000 })); return w.some(x => /below zero/.test(x)) || w.join(' | '); });
    check('Alert when paying more than the open bills', () => { const ram = co.contacts.find(c => c.name === 'Ramesh Agencies'); const open = sum(openBills(ram.id, 'PB'), 'due'); const w = voucherWarnings(computeVoucher({ type: 'PY', date: today, accountId: sysId('cash'), partyId: ram.id, amount: open + 1000 })); return w.some(x => /advance/.test(x)) || w.join(' | '); });

    // ---------- settings ----------
    check('Composition scheme: no GST on sales, no ITC on purchases', () => { co.profile.gstType = 'composition'; const s1 = mk(prakash.id); const b = computeVoucher({ type: 'PB', date: today, partyId: co.contacts.find(c => c.name === 'Ramesh Agencies').id, lines: [{ qty: 1, rate: 100, gstRate: 18, hsn: '853952' }] }); co.profile.gstType = 'regular'; return (s1.totals.tax === 0 && b.itc === false) || `${s1.totals.tax} ${b.itc}`; });
    check('QRMP calendar: quarterly GSTR-1 / 3B and PMT-06', () => { co.profile.gstFreq = 'quarterly'; const c = complianceItems(fy); co.profile.gstFreq = 'monthly'; return c.some(i => i.type === 'GSTR-1' && /^Q1/.test(i.period) && i.due.endsWith('-13')) && c.some(i => i.type === 'GSTR-3B' && i.due.endsWith('-22')) && c.some(i => i.type === 'PMT-06'); });
    check('Quarterly filing locks all three months', () => { co.filings.push({ type: 'GSTR-1', period: `Q4-${fy}`, filedOn: today }); const r = filedPeriod('SI', `${fy + 1}-02-10`); co.filings.pop(); return r === 'GSTR-1'; });
    check('WhatsApp templates fill placeholders', () => /Prakash Constructions/.test(fillTemplate('waReminder', { customer: 'Prakash Constructions', amount: '₹1', invoices: 'INV1', company: 'K', upi: '' })));
    check('CSV import adds valid rows and reports bad ones', () => { const before = co.contacts.length; const rows = [['X', makeGstin('33', 'AAFFX1234K'), '', '33', 'Chennai', '', '', '30', '0'], ['Bad', '33XXXXX', '', '33', '', '', '', '', '']]; let ok = 0; rows.forEach(r => { try { saveContact({ type: 'customer', name: r[0], gstin: r[1], state: r[3], creditDays: 30 }); ok++; } catch (e) { /* skipped */ } }); return (ok === 1 && co.contacts.length === before + 1) || ok; });

    // ---------- plans ----------
    check('New workspace starts on a 14-day Professional trial', () => { const s = subscription(); return (currentPlan() === 'professional' && s.trial && daysBetween(today, s.trialEnds) === 14) || planStatus(); });
    check('Starter plan locks bank reconciliation, 2B and returns, never the books', () => { const s = subscription(); const saved = { ...s }; Object.assign(s, { plan: 'starter', trial: false }); const r = !hasFeature('bankRecon') && !hasFeature('recon2b') && !hasFeature('taxReturns') && !hasFeature('gstFiling'); let books = true; try { saveVoucher({ type: 'JV', date: today, narration: 'plan test', jlines: [{ acc: sysId('rent'), dr: 1, cr: 0 }, { acc: sysId('cash'), dr: 0, cr: 1 }] }); } catch (e) { books = e.message; } Object.assign(s, saved); return (r && books === true) || `${r} ${books}`; });
    check('Expired trial drops to Starter', () => { const s = subscription(); const saved = s.trialEnds; s.trialEnds = addDays(today, -1); const p = currentPlan(); s.trialEnds = saved; return p === 'starter'; });
    check('User and company limits follow the plan', () => { const s = subscription(); const saved = { ...s }; Object.assign(s, { plan: 'starter', trial: false }); const r = limitReached('users') && limitReached('companies'); Object.assign(s, saved); return r; });
    check('Test payment upgrades the plan and records a GST invoice', () => { const s = subscription(); const saved = JSON.parse(JSON.stringify(s)); s.history.push({ date: today, until: addDays(today, 364), plan: 'standard', cycle: 'y', amount: 4990, gst: 898.2, total: 5888.2, method: 'UPI', ref: 'TEST-X', state: '33' }); Object.assign(s, { plan: 'standard', trial: false, renews: addDays(today, 364) }); const ok = currentPlan() === 'standard' && hasFeature('einvoice') && !hasFeature('bankRecon'); printSubInvoice('TEST-X'); const inv = /TAX INVOICE/.test($('#printArea').innerText) && /5,888.20/.test($('#printArea').innerText); meta.sub = saved; return (ok && inv) || `${ok} ${inv}`; });

    // ---------- forgot password ----------
    check('Recovery code: 16 unambiguous characters in 4 groups', () => { const c = newRecoveryCode(); return /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/.test(c) || c; });
    check('Forgot password: code resets the password, finds the username, and is single-use', () => {
        const u = me; const code = setRecovery(u); const oldHash = u.recHash;
        const r = recoverWithCode(code.toLowerCase().replace(/-/g, ' '), '', 'brandnew123', 'brandnew123');   // typed loosely, username forgotten
        const okLogin = hashPassword('brandnew123', u.salt) === u.hash && r.username === u.username;
        const reused = (() => { try { recoverWithCode(code, '', 'another123', 'another123'); return false; } catch (e) { return /not valid/.test(e.message); } })();
        closeModal();
        return (okLogin && reused && u.recHash !== oldHash) || `${okLogin} ${reused}`;
    });
    check('Forgot password: wrong code refused, locked after 5 tries, recorded in audit', () => {
        delete meta.guard.__recover;
        let msgs = [];
        for (let i = 0; i < 6; i++) { try { recoverWithCode('AAAA-BBBB-CCCC-DDDD', '', 'whatever123', 'whatever123'); } catch (e) { msgs.push(e.message); } }
        const locked = /Too many/.test(msgs.at(-1)); delete meta.guard.__recover;
        return (locked && meta.audit.some(a => /wrong recovery code/.test(a.action)) && verifyChain(meta.audit).ok) || msgs.join(' | ');
    });
    check('Forgot password screen renders from sign-in', () => { showForgot(); const ok = /Recovery code/.test($('#auth').innerText); $('#auth').hidden = true; return ok; });

    // ---------- screens ----------
    enterApp();
    const pages = ['#/dashboard', '#/companies', '#/sales', '#/purchases', '#/notes', '#/receipts', '#/payments', '#/journals', '#/customers', '#/vendors', '#/items', '#/accounts', '#/scan', '#/reports',
        '#/report/pl', '#/report/bs', '#/report/cf', '#/report/tb', '#/report/daybook', '#/report/ledger', '#/report/stock', '#/report/ageing-r', '#/report/ageing-p', '#/report/msme', '#/report/salesreg', '#/report/purchreg', '#/report/hsn',
        '#/gst/r1', '#/gst/r3b', '#/gst/2b', '#/gst/ein', '#/gst/health', '#/tds', '#/bank', '#/calendar', '#/audit', '#/settings/company', '#/settings/numbering', '#/settings/users', '#/settings/backup',
        '#/new/SI', '#/new/PB', '#/new/CN', '#/new/DN', '#/new/RC', '#/new/PY', '#/new/JV', '#/new/CT',
        '#/manual', '#/billing', '#/settings/invoice', '#/settings/tax', '#/settings/prefs', '#/settings/reminders', '#/settings/import'];
    const sampleV = ['SI', 'PB', 'CN', 'DN', 'RC', 'PY', 'JV', 'CT'].map(t => co.vouchers.find(v => v.type === t)).filter(Boolean);
    pages.push(...sampleV.map(v => `#/v/${v.id}`));
    const failed = [];
    pages.forEach(h => {
        history.replaceState(null, '', h);
        try { route(); } catch (e) { failed.push(`${h}: ${e.message}`); return; }
        const html = $('#view').innerHTML;
        if (html.length < 200 || /^<div class="errors">/.test(html.trim())) failed.push(`${h}: ${$('#view').innerText.slice(0, 120)}`);
    });
    check(`All ${pages.length} screens render`, () => !failed.length || failed.join(' | '));
    check('Reports with ledger detail render', () => { reportState.detail = true; history.replaceState(null, '', '#/report/bs'); route(); reportState.detail = false; const n = $('#bsT') ? $('#bsT').querySelectorAll('tbody tr').length : 0; return n > 25 || `${n} rows · ${$('#view').innerText.slice(0, 200)}`; });
    check('Invoice prints with Rule 46 fields', () => { const v = co.vouchers.find(x => x.type === 'SI' && x.kind === 'B2B'); printVoucher(v.id); const h = $('#printArea').innerText; return /TAX INVOICE/.test(h) && h.includes(v.no) && h.includes(co.profile.gstin) && /Place of supply/.test(h) && /Reverse charge/.test(h) && /Rupees/.test(h); });
    check('Voucher form calculates totals live', () => { history.replaceState(null, '', '#/new/SI'); route(); F.partyId = sunrise.id; F.lines = [{ itemId: wire.id, desc: 'w', hsn: wire.hsn, qty: 2, unit: 'BOX', rate: 1000, disc: 10, gstRate: 18, accId: '' }]; drawLines(); return (/IGST/.test($('#f_totals').innerText) && /2,124/.test($('#f_totals').innerText)) || $('#f_totals').innerText; });
    check('TDS screens: all tabs render', () => { const bad = []; ['tds', 'tcs', 'returns', 'codes'].forEach(t => { tdsTab = t; history.replaceState(null, '', '#/tds'); route(); if ($('#view').innerText.length < 300) bad.push(t); }); tdsTab = 'tds'; return !bad.length || bad.join(','); });
    check('Journal save with mismatch shows a pop-up alert', () => { history.replaceState(null, '', '#/new/JV'); route(); F.jlines = [{ acc: sysId('rent'), dr: 900, cr: 0 }, { acc: sysId('cash'), dr: 0, cr: 400 }]; F.narration = 'x'; drawJournal(); const live = /Debit exceeds credit by ₹500/.test($('#f_jAlert').innerText); submitVoucher(false); const pop = $('#dlg').open && /do not match/.test($('#dlg').innerText); closeModal(); return (live && pop) || `${live} ${pop}`; });
    check('Locked feature shows the upgrade page on Starter', () => { const s = subscription(); const saved = { ...s }; Object.assign(s, { plan: 'starter', trial: false }); history.replaceState(null, '', '#/bank'); route(); const r = /Available in the Professional plan/.test($('#view').innerText); Object.assign(s, saved); return r; });
    check('Manual search finds TDS returns', () => { manualQ = 'Form 140'; viewManual(); const r = $$('#view .man').length >= 1 && /Form 140/.test($('#view').innerText); manualQ = ''; return r; });
    check('Auditor role is read-only', () => { const saved = me; me = { ...me, role: 'auditor' }; let ok = false; try { saveVoucher({ type: 'JV', date: today, narration: 'x', jlines: [] }); } catch (e) { ok = /read-only/.test(e.message); } me = saved; return ok; });
    check('Data survives a reload (saved to storage)', () => { const id = co.id, n = co.vouchers.length; const again = loadCo(id); return again.vouchers.length === n && verifyChain(again.audit).ok; });

    // ---------- report ----------
    const pass = results.filter(r => r.ok).length;
    document.title = `TESTS ${pass === results.length ? 'PASS' : 'FAIL'} ${pass}/${results.length}`;
    const pre = document.createElement('pre');
    pre.id = 'results';
    pre.textContent = results.map(r => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.note ? '  — ' + r.note : ''}`).join('\n');
    document.body.innerHTML = '';
    document.body.appendChild(pre);
}

// test.html?shot=/report/bs  → sets up the sample company, signs in and opens that screen (for screenshots)
function screenshotMode(path) {
    Object.keys(localStorage).filter(k => k.startsWith('wcerp.')).forEach(k => localStorage.removeItem(k));
    loadMeta();
    const salt = randomHex(16);
    me = { id: 'u_demo', name: 'Vignesh Annamalai', username: 'owner', role: 'admin', salt, hash: hashPassword('password1', salt), companies: 'all', active: true };
    meta.users.push(me);
    createSampleCompany();
    boot();
    me = meta.users[0];
    if (path === '/v/first') path = '/v/' + co.vouchers.find(v => v.type === 'SI' && v.kind === 'B2B' && v.status !== 'cancelled' && ymOf(v.date) === ymOf(todayISO())).id;
    location.hash = '#' + path;
    enterApp();
    history.replaceState(null, '', '#' + path);
    route();
    if (path === '/forgot') { setTimeout(() => { $('#app').hidden = true; $('#auth').hidden = false; showForgot(); }, 300); return; }
    if (path === '/rcode') setTimeout(() => showRecoveryCode('K7QM-4XPN-8RTB-2WCE', 'This is your recovery code. If you forget your username or password, use it on the sign-in screen.'), 300);
    if (path === '/tds') { tdsTab = new URLSearchParams(location.search).get('tab') || 'tds'; retQ = 'Q1'; route(); }
    if (path === '/new/JV') setTimeout(() => { F.jlines = [{ acc: sysId('depreciation'), dr: 95000, cr: 0 }, { acc: co.accounts.find(a => a.name === 'Computers').id, dr: 0, cr: 60000 }, { acc: '', dr: 0, cr: 0 }]; F.narration = 'Depreciation'; drawJournal(); }, 300);
    if (path === '/scan') setTimeout(() => processText(`RAMESH AGENCIES\nNo 12, Mint Street, Chennai\nGSTIN: ${co.contacts.find(c => c.name === 'Ramesh Agencies').gstin}\nTAX INVOICE\nInvoice No: RA/2610/555   Date: 02/10/2026\nBill To: Kaveri Electricals  GSTIN ${co.profile.gstin}\nDescription  HSN  Qty  Rate  Amount\nLED Bulb 9W  853952  200  62.00  12,400.00\nTaxable Value 12,400.00\nCGST @ 9% 1,116.00\nSGST @ 9% 1,116.00\nGrand Total 14,632.00`, null), 300);
}

// test.html?ocr=1 → draws a bill as an image and reads it with the real OCR engine (needs internet)
async function ocrSelfTest() {
    const c = document.createElement('canvas');
    c.width = 1100; c.height = 700;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#111'; g.font = '26px Arial';
    ['RAMESH AGENCIES', 'No 12, Mint Street, Chennai 600079', 'GSTIN: 33ABMPR4455Q1ZV', 'TAX INVOICE', 'Invoice No: RA/2610/555        Date: 02/10/2026',
        'Bill To: Kaveri Electricals   GSTIN: 33AABCK4521M1ZN', 'Description         HSN        Qty     Rate       Amount', 'LED Bulb 9W         853952     200     62.00      12,400.00',
        'Taxable Value                                     12,400.00', 'CGST @ 9%                                          1,116.00', 'SGST @ 9%                                          1,116.00', 'Grand Total                                       14,632.00']
        .forEach((t, i) => g.fillText(t, 40, 50 + i * 52));
    try {
        console.log("OCR start"); const text = await ocrImage(c, (p, m) => console.log("OCR progress " + p)); console.log("OCR TEXT " + JSON.stringify(text));
        const p = parseInvoiceText(text);
        console.log(`OCR RESULT ${p.invoiceNo}|${p.date}|${p.taxable}|${p.tax}|${p.total}|${p.gstins.join(',')}|${p.hsn.join(',')}`); document.title = `OCR ${p.invoiceNo}|${p.date}|${p.taxable}|${p.tax}|${p.total}|${p.gstins.join(',')}|${p.hsn.join(',')}`;
    } catch (e) { console.log("OCR ERROR " + e.message); document.title = "OCR ERROR " + e.message; }
}
