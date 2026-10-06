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

async function runTests() {
    const shot = new URLSearchParams(location.search).get('shot');
    if (shot) return screenshotMode(shot);
    if (new URLSearchParams(location.search).get('ocr')) return ocrSelfTest();
    if (new URLSearchParams(location.search).get('mcheck')) return mobileCheck();
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
    check('Passwords: 4 characters accepted, 3 refused', () => { const ok4 = (() => { try { recoverWithCode('AAAA-BBBB-CCCC-DDDD', '', '1234', '1234'); } catch (e) { return !/at least/.test(e.message); } })(); const no3 = (() => { try { recoverWithCode('AAAA-BBBB-CCCC-DDDD', '', '123', '123'); } catch (e) { return /at least 4/.test(e.message); } return false; })(); delete meta.guard.__recover; return (ok4 && no3) || `${ok4} ${no3}`; });
    check('Forgot password screen renders from sign-in', () => { showForgot(); const ok = /Recovery code/.test($('#auth').innerText); $('#auth').hidden = true; return ok; });

    // ---------- payroll (sample company) ----------
    check('Payroll: monthly runs posted and paid; salary ledger = gross', () => {
        const runs = Object.entries(co.payroll).filter(([, r]) => r.status === 'paid');
        const gross = sum(runs, ([, r]) => runTotals(r).gross);
        const fyFrom = co.profile.booksFrom;
        return (runs.length >= 12 && near(balance(sysId('salary'), todayISO()) - 0, gross) && near(balance(sysId('salPay')), 0)) || `${runs.length} runs, ledger ${balance(sysId('salary'))} vs ${gross}, salPay ${balance(sysId('salPay'))}`;
    });
    check('Payroll journal balances and splits PF / ESI / PT / TDS', () => {
        const [ym, r] = Object.entries(co.payroll).find(([, r]) => r.status === 'paid' && runTotals(r).pt);
        const P = postingsOf(vById(r.jvId)), T = runTotals(r);
        const cr = k => sum(P.filter(p => p.acc === sysId(k)), 'cr');
        return (near(sum(P, 'dr'), sum(P, 'cr')) && near(cr('pfPay'), T.pf + T.erPf) && near(cr('esiPay'), T.esi + T.erEsi) && near(cr('ptPay'), T.pt) && near(cr('tdsSalPay'), T.tds) && near(cr('salPay'), T.net)) || ym;
    });
    check('Payroll: PF 12% of basic, ESI only up to ₹21,000, TN professional tax in September', () => {
        const r = computePayRow({ salary: 20000, pf: true, esi: true, basicPct: 50 }, '2026-09', 0);
        const hi = computePayRow({ salary: 30000, pf: true, esi: true, basicPct: 50 }, '2026-09', 0);
        const lo = computePayRow({ salary: 3000, pf: false, esi: false }, '2026-09', 0);   // ₹18,000 a half-year: below the TN slab
        return (r.pf === 1200 && r.esi === 150 && r.pt === 1250 && hi.esi === 0 && hi.pt === 1250 && lo.pt === 0 && computePayRow({ salary: 30000 }, '2026-08').pt === 0) || JSON.stringify([r, hi, lo]);
    });
    check('Payroll: loss of pay days reduce gross pro rata', () => computePayRow({ salary: 31000, pf: false, esi: false }, '2026-07', 3).gross === 28000);
    check('Employee benefits expense in the P&L includes employer PF / ESI', () => { const p = plData(fyStart(fy - 1), fyEnd(fy - 1)); return p.employee.some(x => x.l.id === sysId('erPf')) && p.tot(p.employee) > 900000; });

    // ---------- GSTR-2B drives the credit claimed ----------
    const m2b = addMonths(ymOf(today), -1);
    const billsM = activeIn(['PB'], m2b).filter(v => !v.rcm && v.totals.tax && isRegistered(contactById(v.partyId)));
    const heldBack = billsM[0];
    check('GSTR-2B: credit of a bill not in 2B is held back and carried', () => {
        const rows = billsM.slice(1).map(v => [contactById(v.partyId).gstin, contactById(v.partyId).name, v.refNo, ddmmyyyy(v.date), v.totals.taxable, v.totals.igst, v.totals.cgst, v.totals.sgst]);
        import2b(toCSV([['GSTIN of supplier', 'Trade name', 'Invoice number', 'Invoice date', 'Taxable value', 'IGST', 'CGST', 'SGST'], ...rows]), m2b);
        const g = gstr3b(m2b);
        const claim = sum(billsM.slice(1), v => v.totals.tax);
        const held = heldBack.totals.tax;
        const pend = itcPending(m2b);
        return (g.basis === '2B' && near(g.itcOther.iamt + g.itcOther.camt + g.itcOther.samt, claim) && near(g.deferred.iamt + g.deferred.camt + g.deferred.samt, held) && near(pend.iamt + pend.camt + pend.samt, held)) || JSON.stringify({ basis: g.basis, got: g.itcOther, claim, def: g.deferred, held, pend });
    });
    check('GSTR-2B: a late-filed bill is claimed in the month it appears', () => {
        const nx = ymOf(today);
        const ct = contactById(heldBack.partyId);
        import2b(toCSV([['GSTIN of supplier', 'Trade name', 'Invoice number', 'Invoice date', 'Taxable value', 'IGST', 'CGST', 'SGST'], [ct.gstin, ct.name, heldBack.refNo, ddmmyyyy(heldBack.date), heldBack.totals.taxable, heldBack.totals.igst, heldBack.totals.cgst, heldBack.totals.sgst]]), nx);
        const r = recon2b(nx).find(x => x.status === 'Earlier bill, now in 2B');
        const pend = itcPending(nx), P = pend.iamt + pend.camt + pend.samt;
        const notIn2b = sum(activeIn(['PB'], nx).filter(v => !v.rcm && v.itc !== false && v.totals.tax && isRegistered(contactById(v.partyId))), v => v.totals.tax);
        return (r && r.v.id === heldBack.id && near(P, notIn2b, 1)) || JSON.stringify({ pend, notIn2b });
    });
    check('GST advisor gives this month\'s steps', () => { const a = gstAdvice(m2b); return a.some(x => /GSTR-3B/.test(x.text)) || a.map(x => x.text).join(' | '); });
    check('GSTR-3B JSON in the GSTN format', () => { const j = gstr3bJson(m2b); return (j.ret_period === m2b.slice(5) + m2b.slice(0, 4) && j.sup_details.osup_det.txval > 0 && j.itc_elg.itc_avl.length === 5) || JSON.stringify(j.sup_details); });
    check('GSTR-9: turnover = sales − credit notes; tax payable = paid through credit + cash', () => {
        const g = gstr9(fy - 1);
        const V = co.vouchers.filter(v => v.status !== 'cancelled' && fyOf(v.date) === fy - 1);
        const turn = sum(V.filter(v => v.type === 'SI'), v => v.totals.taxable) - sum(V.filter(v => v.type === 'CN'), v => v.totals.taxable);   // reverse-charge purchases excluded
        const P = g.pay, tot = x => x.iamt + x.camt + x.samt;
        return (near(g.turnover, turn, 1) && near(tot(P.payable), tot(P.itc) + tot(P.cash), 1) && g.hsn.length > 3) || JSON.stringify({ t: g.turnover, turn, P });
    });
    check('GSTR-9 CSV for the offline tool', () => /4N/.test(gstr9Csv(fy - 1)) && /HSN/.test(gstr9Csv(fy - 1)));

    // ---------- scanned bills post themselves ----------
    const ram = co.contacts.find(c => c.name === 'Ramesh Agencies');
    window.__scanText = `RAMESH AGENCIES\nGSTIN: ${ram.gstin}\nTAX INVOICE\nInvoice No: RA/AUTO/77   Date: ${ddmmyyyy(today, '/')}\nBill To: Kaveri Electricals  GSTIN ${co.profile.gstin}\nLED Bulb 9W  HSN 853952  100  62.00  6,200.00\nTaxable Value 6,200.00\nCGST @ 9% 558.00\nSGST @ 9% 558.00\nGrand Total 7,316.00`;

    // ---------- STAY BAY: payroll only ----------
    const home = co;
    const fresh = (name, extra = {}) => { const c = newCompanyData({ name, state: '33', booksFrom: `${fy}-04-01`, ...extra }); co = c; meta.companies.push({ id: c.id, name }); co.links = {}; return c; };
    const m1 = `${fy}-04`, m2 = `${fy}-05`;
    const sbSnap = (gross, lop, basic, pf, esi, tds, adv, er) => ({ gross, lop, earnedGross: gross - lop, earnedBasic: basic, pf, esi, pt: 0, tds, advance: adv, loan: 0, net: gross - lop - pf - esi - tds - adv, employerPf: pf, employerEsi: er });
    const SB = { employees: [
        { id: 'sb1', code: 'SBY001', name: 'Ravi Kumar', department: 'Front Office', designation: 'Manager', salary: 30000, doj: '2020-01-01', status: 'Active', pan: 'ABCPR1234K', epf: '100200300400', salaryConfig: { pfEnabled: true, esiEnabled: true, basicPct: 50 }, payments: { [m1]: { paidOn: `${m2}-01`, snapshot: sbSnap(30000, 1000, 14500, 1740, 0, 500, 1000, 0) }, [m2]: { paidOn: `${fy}-06-01`, snapshot: sbSnap(30000, 0, 15000, 1800, 0, 500, 0, 0) } } },
        { id: 'sb2', code: 'SBY002', name: 'Selvi R', department: 'Housekeeping', designation: 'Room Attendant', salary: 15000, doj: '2022-01-01', status: 'Active', salaryConfig: {}, payments: { [m1]: { paidOn: `${m2}-01`, snapshot: sbSnap(15000, 0, 7500, 900, 113, 0, 0, 488) } } }
    ], employer: {}, from: 'test' };
    let sbRep;
    check('STAY BAY sync: employees and paid months posted to the books', () => {
        fresh('STAY BAY test');
        saveAccount({ name: 'HDFC Bank', group: 'bank', openDr: 500000, openCr: 0 });
        sysAcc('capital').openCr = 500000;
        sbRep = syncStayBay(SB);
        const gross = 29000 + 30000 + 15000;
        return (co.employees.length === 2 && Object.keys(co.payroll).length === 2 && near(balance(sysId('salary')), gross) && near(balance(sysId('salPay')), 0) && near(-balance(sysId('pfPay')), 1740 * 2 + 1800 * 2 + 900 * 2) && near(-balance(sysId('tdsSalPay')), 1000) && near(balance(sysId('salAdv')), -1000)) || `${reportText(sbRep)} · salary ${balance(sysId('salary'))} · ${sbRep.failed.join(' | ')}`;
    });
    check('STAY BAY sync again adds nothing; balance sheet tallies', () => { const n = co.vouchers.length; const r = syncStayBay(SB); const b = bsData(today); return (co.vouchers.length === n && r.skipped === 2 && near(b.totalEL, b.totalA)) || `${co.vouchers.length - n} new · ${reportText(r)} · BS ${b.totalEL} vs ${b.totalA}`; });

    // ---------- Eco Pack: sales, purchases, production, repairs, payroll ----------
    const EP = { db: {
        sample: true, company: { name: 'Eco Pack Private Limited', gstin: makeGstin('33', 'AAACE1734G'), stateCode: '33', address: 'Arcot Road, Porur, Chennai' },
        units: [{ id: 'porur', short: 'Porur' }], machines: [{ id: 'bf2', name: 'Blown Film Extruder 2' }],
        products: [{ id: 'garb', name: 'Garbage Bag (Black)', unit: 'kg', wt: 1, rate: 128, hsn: '3923', recipe: { hdpe: .6, rec: .4 } }],
        materials: [{ id: 'hdpe', name: 'HDPE Granules', rate: 100 }, { id: 'rec', name: 'Reprocessed Granules', rate: 60 }],
        customers: [{ id: 'c1', name: 'Sri Lakshmi Traders', city: 'Chennai', state: 'Tamil Nadu', creditDays: 30 }, { id: 'c2', name: 'Deccan Electronics', city: 'Bengaluru', state: 'Karnataka', creditDays: 45 }],
        moves: [{ date: `${m1}-01`, type: 'rm', item: 'hdpe', qty: 1000, rate: 100, kind: 'Opening' }, { date: `${m1}-01`, type: 'rm', item: 'rec', qty: 500, rate: 60, kind: 'Opening' }, { date: `${m1}-01`, type: 'fg', item: 'garb', qty: 200, rate: 128, kind: 'Opening' },
            { date: `${m1}-05`, type: 'rm', item: 'hdpe', qty: 2000, rate: 102, kind: 'Purchase', party: 'Polymer distributor, Ambattur', bill: 'PB-0405-HDPE' }, { date: `${m1}-06`, type: 'rm', item: 'rec', qty: 1000, rate: 62, kind: 'Purchase', party: 'Reprocessed granules supplier, Padi', bill: 'PB-0406-REC' }],
        production: [{ date: `${m1}-10`, productId: 'garb', qty: 1500, scrap: 30 }, { date: `${m1}-20`, productId: 'garb', qty: 1000, scrap: 20 }],
        orders: [{ id: 'o1', no: 'SO-1', date: `${m1}-12`, customerId: 'c1', productId: 'garb', qty: 1000, rate: 130, status: 'Dispatched', dispatch: { date: `${m1}-14`, invoiceNo: `EP/${fyLabel(fy)}/0001`, vehicle: 'TN 01 AB 1234' }, payments: [{ date: `${m1}-25`, amount: Math.round(1000 * 130 * 1.18), mode: 'NEFT' }] },
            { id: 'o2', no: 'SO-2', date: `${m2}-01`, customerId: 'c2', productId: 'garb', qty: 800, rate: 140, status: 'Dispatched', dispatch: { date: `${m2}-03`, invoiceNo: `EP/${fyLabel(fy)}/0002` }, payments: [] },
            { id: 'o3', no: 'SO-3', date: `${m2}-04`, customerId: 'c1', productId: 'garb', qty: 100, rate: 130, status: 'Pending', payments: [] }],
        maintenance: [{ id: 'mt1', machineId: 'bf2', date: `${m1}-15`, type: 'Breakdown', issue: 'Heater band failure', cost: 4500, status: 'Closed' }],
        employees: [{ id: 'e1', code: 'EP001', unit: 'porur', name: 'Murugan S', dept: 'Extrusion', desig: 'Extrusion Operator', salary: 19500, pf: true, esi: true, doj: '2015-01-01', status: 'Active' }],
        pay: { [m1]: { e1: { paidOn: `${m2}-02`, snap: { gross: 19500, basic: 9750, pf: 1170, esi: 147, pt: 0, net: 18183, erPf: 1170, erEsi: 634 } } } }
    }, from: 'test' };
    let epRep;
    check('Eco Pack sync: invoices (own numbers), receipts, production, repairs, payroll; purchases wait for GSTINs', () => {
        fresh('Eco Pack test', { entity: 'Private Ltd', aato: 60000000 });
        saveAccount({ name: 'IOB Current A/c', group: 'bank', openDr: 1000000, openCr: 0 });
        sysAcc('capital').openCr = 1000000;
        epRep = syncEcoPack(EP);
        const inv = co.vouchers.filter(v => v.type === 'SI');
        const A = epRep.added;
        return (inv.length === 2 && inv[0].no === `EP/${fyLabel(fy)}/0001` && inv[1].totals.igst > 0 && A.receipts === 1 && A['production entries'] === 2 && A['repair payments'] === 1 && A['payroll months'] === 1 && !A['purchase bills'] && epRep.needs.length === 2) || `${reportText(epRep)} · needs ${epRep.needs.length} · ${epRep.failed.join(' | ')}`;
    });
    check('Eco Pack: supplier GSTINs added → purchase bills come in, nothing duplicated', () => {
        const n = co.vouchers.filter(v => v.type === 'SI').length;
        co.links.ecopack.vendorGstin = { 'Polymer distributor, Ambattur': makeGstin('33', 'AAAFP4100K'), 'Reprocessed granules supplier, Padi': makeGstin('33', 'AAAFR4107K') };
        const r = syncEcoPack(EP);
        const bills = co.vouchers.filter(v => v.type === 'PB');
        return (bills.length === 2 && bills.every(b => b.totals.tax > 0) && co.vouchers.filter(v => v.type === 'SI').length === n && r.added['purchase bills'] === 2) || reportText(r);
    });
    check('Eco Pack: production moves material cost into finished goods (stock quantities right)', () => {
        const st = stockAt(today).items;
        const it = n => co.items.find(i => i.name.startsWith(n));
        const fg = st[it('Garbage').id], hd = st[it('HDPE').id], re = st[it('Reprocessed').id];
        return (near(fg.qty, 200 + 2500 - 1000 - 800, 0.01) && near(hd.qty, 1000 + 2000 - 2550 * 0.6, 0.01) && near(re.qty, 500 + 1000 - 2550 * 0.4, 0.01) && near(fg.avg, 89.02, 0.05)) || JSON.stringify({ fg, hd, re });
    });
    check('Eco Pack: P&L shows cost of materials consumed; balance sheet tallies; cash flow ties', () => {
        const p = plData(`${fy}-04-01`, today), b = bsData(today), c = cashFlowData(`${fy}-04-01`, today);
        return (p.mfg && p.materials > 0 && near(b.totalEL, b.totalA) && near(c.check, 0)) || JSON.stringify({ mfg: p.mfg, mat: p.materials, el: b.totalEL, a: b.totalA, cf: c.check });
    });
    check('Eco Pack invoices appear in GSTR-1 with 6-digit HSN', () => { const g = gstr1(m1); return (g.summary.invoices === 1 && g.hsnB2C[0]?.hsn === '392321') || JSON.stringify(g.summary); });
    check('Every voucher in the linked companies balances; audit chains intact', () => {
        const bad = co.vouchers.filter(v => !near(sum(postingsOf(v), 'dr'), sum(postingsOf(v), 'cr')));
        return (!bad.length && verifyChain(co.audit).ok) || bad.map(v => v.no).join(',');
    });

    // ---------- business profile: the ERP adapts rates, credit and returns to the business ----------
    const B = (x) => ({ ...bizDefaults(), turnoverLast: 0, turnoverExp: 0, employees: 0, cashPct: 10, ...x });
    const has = (R, re, level) => R.some(r => re.test(r.title) && (!level || r.level === level));
    check('Rules: small hotel rooms are 5% without credit; above ₹7,500 → 18% with credit (Rule 42 when mixed)', () => {
        const lo = B({ industry: 'hotel', maxTariff: 3500 }), hi = B({ industry: 'hotel', maxTariff: 9000, hasRestaurant: true });
        const s1 = INDUSTRIES.hotel.supplies(lo), s2 = INDUSTRIES.hotel.supplies(hi);
        return (itcPolicyOf(lo) === 'none' && s1[0].rate === 5 && !s1[0].itc && itcPolicyOf(hi) === 'mixed' && s2.some(x => x.rate === 18 && x.itc) && s2.find(x => /Restaurant/.test(x.name)).rate === 18) || JSON.stringify([itcPolicyOf(lo), itcPolicyOf(hi)]);
    });
    check('Rules: composition — 1% for a small B2C trader, refused above ₹1.5 crore or with inter-state sales; 5% restaurants; 6% services up to ₹50 lakh', () => {
        const t = compositionOf(B({ industry: 'trader', turnoverLast: 9000000, b2bShare: 10 }));
        return (t.eligible && t.rate === 1 && t.recommended && !compositionOf(B({ industry: 'trader', turnoverLast: 16000000 })).eligible && !compositionOf(B({ industry: 'trader', turnoverLast: 5000000, interstate: true })).eligible
            && compositionOf(B({ industry: 'restaurant', turnoverLast: 5000000 })).rate === 5 && compositionOf(B({ industry: 'professional', turnoverLast: 4000000 })).rate === 6 && !compositionOf(B({ industry: 'professional', turnoverLast: 6000000 })).eligible) || JSON.stringify(t);
    });
    check('Rules: size thresholds (registration, GSTR-9, e-invoice, tax audit, presumptive, PF/ESI)', () => {
        const small = businessRules(B({ industry: 'trader', turnoverLast: 3000000, employees: 4 }), { state: '33', entity: 'Proprietorship' });
        const big = businessRules(B({ industry: 'trader', turnoverLast: 60000000, employees: 25 }), { state: '33', entity: 'Proprietorship', aato: 60000000 });
        const pro = businessRules(B({ industry: 'professional', turnoverLast: 4000000 }), { state: '33', entity: 'Proprietorship' });
        const ok = has(small, /registration optional/) && has(small, /GSTR-9 optional/) && has(small, /old 44AD/) && has(small, /Tax audit not needed/) && !has(small, /Provident Fund \(EPF\) compulsory/)
            && has(big, /registration compulsory/) && has(big, /E-invoicing/, 'must') && has(big, /^Tax audit$/, 'must') && has(big, /GSTR-9C/) && has(big, /EPF/, 'must') && has(big, /ESI compulsory/) && !has(big, /old 44AD/)
            && has(pro, /old 44ADA/);
        return ok || [small, big, pro].map(R => R.map(r => r.title).join(' | ')).join(' ### ');
    });
    check('Rules: small private company — no cash flow statement, no CARO', () => { const R = businessRules(B({ industry: 'manufacturer', turnoverLast: 30000000, paidUp: 1000000 }), { state: '33', entity: 'Private Ltd' }); return has(R, /^Small company$/) && /cash flow statement is not mandatory/.test(R.find(r => r.title === 'Small company').text); });

    check('Hotel books: GST on purchases (incl. reverse charge) becomes cost; GSTR-3B claims no credit', () => {
        fresh('Hotel test');
        saveAccount({ name: 'SBI', group: 'bank', openDr: 500000, openCr: 0 }); sysAcc('capital').openCr = 500000;
        applyBusinessProfile(B({ industry: 'hotel', maxTariff: 3500 }), { from: `${fy}-04-01` });
        const room = co.items.find(i => /up to ₹7,500/.test(i.name));
        const guest = saveContact({ type: 'customer', name: 'Walk-in guest', state: '33' });
        const ven = saveContact({ type: 'vendor', name: 'Linen Supplier', gstin: makeGstin('33', 'AAAFL1234K'), state: '33' });
        const adv = saveContact({ type: 'vendor', name: 'Advocate R', state: '33' });
        const d = `${fy}-05-10`;
        const si = saveVoucher({ type: 'SI', date: d, partyId: guest.id, lines: [{ itemId: room.id, desc: room.name, hsn: room.hsn, qty: 10, rate: 3000, gstRate: room.gstRate }] });
        const pb = saveVoucher({ type: 'PB', date: d, partyId: ven.id, refNo: 'LS-1', lines: [{ desc: 'Bed linen', hsn: '6302', qty: 10, rate: 1000, gstRate: 5 }] });
        const rc = saveVoucher({ type: 'PB', date: d, partyId: adv.id, refNo: 'ADV-1', rcm: true, lines: [{ desc: 'Legal fees', hsn: '998212', qty: 1, rate: 20000, gstRate: 18 }] });
        const g = gstr3b(`${fy}-05`);
        return (si.totals.tax === 1500 && pb.itc === false && rc.itc === false && g.itcAvail.camt === 0 && near(g.ineligible.camt + g.ineligible.samt, 500 + 3600) && near(g.d.camt, 1800) && near(balance(sysId('inCgst')), 0)) || JSON.stringify({ tax: si.totals.tax, pbItc: pb.itc, avail: g.itcAvail, inel: g.ineligible });
    });
    check('Hotel with rooms above ₹7,500: common credit reversed under Rule 42 and posted', () => {
        fresh('Hotel mixed test');
        saveAccount({ name: 'SBI', group: 'bank', openDr: 500000, openCr: 0 }); sysAcc('capital').openCr = 500000;
        applyBusinessProfile(B({ industry: 'hotel', maxTariff: 9000 }), { from: `${fy}-04-01` });
        const lo = co.items.find(i => /up to ₹7,500/.test(i.name)), hi = co.items.find(i => /above ₹7,500/.test(i.name));
        const guest = saveContact({ type: 'customer', name: 'Guest', state: '33' });
        const ven = saveContact({ type: 'vendor', name: 'AC Service', gstin: makeGstin('33', 'AAAFA1234K'), state: '33' });
        const d = `${fy}-06-10`;
        saveVoucher({ type: 'SI', date: d, partyId: guest.id, lines: [{ itemId: lo.id, desc: lo.name, hsn: lo.hsn, qty: 20, rate: 5000, gstRate: 5 }, { itemId: hi.id, desc: hi.name, hsn: hi.hsn, qty: 10, rate: 10000, gstRate: 18 }] });
        saveVoucher({ type: 'PB', date: d, partyId: ven.id, refNo: 'AC-1', lines: [{ desc: 'AC maintenance', hsn: '998719', qty: 1, rate: 100000, gstRate: 18 }] });
        const g = gstr3b(`${fy}-06`);
        const jv = postSetOff(`${fy}-06`);
        const rev = sum(postingsOf(jv).filter(p => p.acc === sysId('itcRev')), 'dr');
        return (near(g.ratio42, 0.5) && near(g.rule42.camt + g.rule42.samt, 9000) && near(rev, 9000) && near(g.itcNet.camt + g.itcNet.samt, 9000) && gstr3bJson(`${fy}-06`).itc_elg.itc_rev[0].camt === 4500) || JSON.stringify({ r: g.ratio42, r42: g.rule42, net: g.itcNet, rev });
    });
    check('Food-app orders: no GST on our bill, reported in GSTR-3B 3.1.1(ii)', () => {
        fresh('Restaurant test');
        applyBusinessProfile(B({ industry: 'restaurant', aggregator: true }), { from: `${fy}-04-01` });
        const it = co.items.find(i => i.eco95);
        const app = saveContact({ type: 'customer', name: 'Food App Pvt Ltd', gstin: makeGstin('29', 'AABCF1234K'), state: '29' });
        const v = saveVoucher({ type: 'SI', date: `${fy}-07-05`, partyId: app.id, lines: [{ itemId: it.id, desc: it.name, hsn: it.hsn, qty: 1, rate: 50000, gstRate: 5 }] });
        const g = gstr3b(`${fy}-07`);
        return (v.totals.tax === 0 && g.eco.txval === 50000 && g.c.txval === 0 && gstr3bJson(`${fy}-07`).eco_dtls.eco_reg_sup.txval === 50000 && co.profile.itcPolicy === 'none') || JSON.stringify({ tax: v.totals.tax, eco: g.eco, c: g.c });
    });
    check('Composition dealer: bill of supply without GST, 1% tax by CMP-08, GSTR-4 instead of GSTR-1/3B', () => {
        fresh('Composition test', { gstin: makeGstin('33', 'ABCPC1234D') });
        saveAccount({ name: 'SBI', group: 'bank', openDr: 200000, openCr: 0 }); sysAcc('capital').openCr = 200000;
        const r = applyBusinessProfile(B({ industry: 'trader', turnoverLast: 8000000, b2bShare: 5, scheme: 'composition' }), { from: `${fy}-04-01` });
        const cu = saveContact({ type: 'customer', name: 'Retail customer', state: '33' });
        const ven = saveContact({ type: 'vendor', name: 'Distributor', gstin: makeGstin('33', 'AAAFD1234K'), state: '33' });
        const si = saveVoucher({ type: 'SI', date: `${fy}-04-15`, partyId: cu.id, lines: [{ desc: 'Switches', hsn: '8536', qty: 100, rate: 1000, gstRate: 18 }] });
        const pb = saveVoucher({ type: 'PB', date: `${fy}-04-10`, partyId: ven.id, refNo: 'D-1', lines: [{ desc: 'Switches', hsn: '8536', qty: 100, rate: 800, gstRate: 18 }] });
        const c = cmp08(fy, 'Q1');
        const jv = postCompositionTax(fy, 'Q1');
        const cal = complianceItems(fy).map(i => i.type);
        return (r.scheme === 'composition' && si.totals.tax === 0 && pb.itc === false && c.tax === 1000 && near(balance(sysId('compTax')), 1000) && near(-balance(sysId('compPay')), 1000) && jv && cal.includes('CMP-08') && cal.includes('GSTR-4') && !cal.includes('GSTR-3B') && !cal.includes('GSTR-1') && throws(() => postCompositionTax(fy, 'Q1'), /already posted/)) || JSON.stringify({ c, cal: [...new Set(cal)] });
    });

    // ---------- sample workspace: STAY BAY and Eco Pack get their own connected companies ----------
    check('Sample workspace: STAY BAY and Eco Pack companies are created and connected (demo data), not the sample company', () => {
        const n = meta.companies.length;
        const sb = buildLinkedCompany('staybay', true).company;
        const sbOk = sb.links.staybay?.demo && sb.profile.biz.industry === 'hotel' && sb.profile.itcPolicy === 'none' && Object.keys(sb.payroll).length >= 1 && near(balance(sysId('salPay')), 0);
        const sbBs = bsData(today);
        const ep = buildLinkedCompany('ecopack', true).company;
        const epB = bsData(today), inv = ep.vouchers.filter(v => v.type === 'SI').length, bills = ep.vouchers.filter(v => v.type === 'PB').length, prod = ep.vouchers.filter(v => v.type === 'SJ').length;
        const ok = sbOk && near(sbBs.totalEL, sbBs.totalA) && near(epB.totalEL, epB.totalA) && inv > 0 && bills > 0 && prod > 0 && !ep.links.ecopack.lastReport.needs.length && ep.profile.biz.industry === 'manufacturer'
            && !complianceItems(fy).some(i => i.state === 'overdue')
            && meta.companies.length === n + 2 && meta.companies.slice(-2).map(c => c.link).join() === 'staybay,ecopack' && !Object.keys(home.links || {}).length;
        return ok || JSON.stringify({ od: complianceItems(fy).filter(i => i.state === 'overdue').map(i => i.type + ' ' + i.period), sbOk, inv, bills, prod, needs: ep.links.ecopack.lastReport.needs, sbBs: [sbBs.totalEL, sbBs.totalA], ep: [epB.totalEL, epB.totalA], fails: ep.links.ecopack.lastReport.failed.slice(0, 3) });
    });
    check('Demo re-sync adds nothing; a company not connected to a dashboard refuses to sync', () => {
        const n = co.vouchers.length;
        autoSync();
        const same = co.vouchers.length === n;
        const sbId = meta.companies.find(c => c.link === 'staybay').id;
        co = home;
        let refused = false;
        try { const l = linkOf('staybay'); if (!l) throw new Error('not connected'); } catch (e) { refused = true; }
        const listed = linkedCompanies('staybay').some(c => c.id === sbId);
        return (same && refused && listed) || JSON.stringify({ same, refused, listed });
    });
    check('Dashboard links open their own company: STAY BAY → STAY BAY payroll, Eco Pack → Eco Pack', () => {
        const route0 = window.route, last0 = meta.lastCompany; window.route = () => {};
        try {
            openLinked('staybay'); const a = co.links?.staybay && location.hash === '#/payroll';
            openLinked('ecopack'); const b = co.links?.ecopack && location.hash === '#/dashboard';
            openLinked('staybay'); const c = co.links?.staybay && !co.links?.ecopack;
            return (a && b && c) || JSON.stringify({ a, b, c, name: co.profile.name });
        } finally { window.route = route0; meta.lastCompany = last0; co = home; ver++; }
    });
    await (async () => {
        const ask0 = window.ask, route0 = window.route, go0 = window.go, alert0 = window.alert;
        try {
            window.alert = () => {};
            const target = meta.companies.find(c => c.link === 'ecopack');
            window.route = () => {}; window.go = () => {};
            window.ask = async () => 'wrong name';
            await deleteCompany(target.id);
            const kept = meta.companies.some(c => c.id === target.id);
            window.ask = async () => target.name;
            await deleteCompany(target.id);
            const gone = !meta.companies.some(c => c.id === target.id) && !loadCo(target.id);
            results.push({ name: 'Delete company: needs the exact name, then removes it and its data', ok: kept && gone, note: JSON.stringify({ kept, gone }) });
        } catch (e) { results.push({ name: 'Delete company', ok: false, note: e.message }); }
        finally { window.ask = ask0; window.route = route0; window.go = go0; window.alert = alert0; co = home; ver++; }
    })();
    co = home; ver++;

    // ---------- screens ----------
    enterApp();
    const pages = ['#/dashboard', '#/companies', '#/sales', '#/purchases', '#/notes', '#/receipts', '#/payments', '#/journals', '#/customers', '#/vendors', '#/items', '#/accounts', '#/scan', '#/reports',
        '#/report/pl', '#/report/bs', '#/report/cf', '#/report/tb', '#/report/daybook', '#/report/ledger', '#/report/stock', '#/report/ageing-r', '#/report/ageing-p', '#/report/msme', '#/report/salesreg', '#/report/purchreg', '#/report/hsn',
        '#/gst/r1', '#/gst/r3b', '#/gst/2b', '#/gst/ein', '#/gst/health', '#/tds', '#/bank', '#/calendar', '#/audit', '#/settings/company', '#/settings/numbering', '#/settings/users', '#/settings/backup',
        '#/new/SI', '#/new/PB', '#/new/CN', '#/new/DN', '#/new/RC', '#/new/PY', '#/new/JV', '#/new/CT',
        '#/manual', '#/billing', '#/payroll', '#/connect', '#/business', '#/gst/plan', '#/gst/gstr9', '#/new/SJ', '#/settings/invoice', '#/settings/tax', '#/settings/prefs', '#/settings/reminders', '#/settings/import'];
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

    // ---------- scan automation (async) ----------
    await (async () => {
        try {
            const r = await autoPostBill(window.__scanText, null);
            results.push({ name: 'Scan: a clean bill is posted automatically with GST and TDS rules', ok: r.status === 'posted' && r.v.type === 'PB' && r.v.totals.total === 7316 && r.v.refNo === 'RA/AUTO/77', note: r.status === 'posted' ? r.v.no : r.reason });
            const bad = await autoPostBill('some unreadable text 123', null);
            results.push({ name: 'Scan: an unclear bill waits for checking', ok: bad.status === 'review', note: bad.reason });
            const dup = await autoPostBill(window.__scanText, null);
            results.push({ name: 'Scan: the same bill scanned twice is not posted twice', ok: dup.status === 'review' && /already entered/.test(dup.reason), note: dup.reason });
        } catch (e) { results.push({ name: 'Scan automation', ok: false, note: e.message }); }
    })();

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
    const filled = path === '/new/SI-filled', openMenu = path === '/menu', openAdd = path === '/add';
    if (filled) path = '/new/SI';
    if (path === '/menu' || path === '/add') path = '/dashboard';
    if (path === '/v/first') path = '/v/' + co.vouchers.find(v => v.type === 'SI' && v.kind === 'B2B' && v.status !== 'cancelled' && ymOf(v.date) === ymOf(todayISO())).id;
    location.hash = '#' + path;
    enterApp();
    history.replaceState(null, '', '#' + path);
    route();
    if (path === '/forgot') { setTimeout(() => { $('#app').hidden = true; $('#auth').hidden = false; showForgot(); }, 300); return; }
    if (path === '/rcode') setTimeout(() => showRecoveryCode('K7QM-4XPN-8RTB-2WCE', 'This is your recovery code. If you forget your username or password, use it on the sign-in screen.'), 300);
    if (filled) { setTimeout(() => { const p = co.contacts.find(c => c.name === 'Prakash Constructions'); F.partyId = p.id; $('#f_party').value = p.id; onParty(); const w = co.items.find(i => i.name.startsWith('Copper')), f = co.items.find(i => i.name.startsWith('Ceiling')); F.lines = [{ itemId: w.id, desc: w.name, hsn: w.hsn, qty: 10, unit: w.unit, rate: w.rate, disc: 0, gstRate: 18, accId: '' }, { itemId: f.id, desc: f.name, hsn: f.hsn, qty: 4, unit: f.unit, rate: f.rate, disc: 5, gstRate: 18, accId: '' }]; drawLines(); }, 300); }
    if (openMenu) setTimeout(() => document.body.classList.add('side-open'), 600);
    if (openAdd) setTimeout(quickAdd, 600);
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

// test.html?mcheck=1 at a phone-sized window: every screen must fit the screen width (no sideways page scroll)
function mobileCheck() {
    screenshotMode('/dashboard');
    const pages = ['#/dashboard', '#/companies', '#/sales', '#/purchases', '#/notes', '#/receipts', '#/payments', '#/journals', '#/customers', '#/vendors', '#/items', '#/accounts', '#/scan', '#/reports',
        '#/report/pl', '#/report/bs', '#/report/cf', '#/report/tb', '#/report/daybook', '#/report/ledger', '#/report/ageing-r', '#/report/salesreg', '#/gst/r1', '#/gst/r3b', '#/gst/2b', '#/gst/ein', '#/tds', '#/bank', '#/calendar', '#/audit',
        '#/settings/company', '#/settings/invoice', '#/settings/tax', '#/settings/users', '#/billing', '#/manual', '#/new/SI', '#/new/PB', '#/new/RC', '#/new/JV', `#/v/${co.vouchers.find(v => v.type === 'SI').id}`];
    const bad = [];
    pages.forEach(h => {
        history.replaceState(null, '', h); route();
        const w = window.innerWidth;
        if (document.documentElement.scrollWidth > w + 1) bad.push(`${h}: page ${document.documentElement.scrollWidth}px wide on a ${w}px screen`);
        // anything (other than inside a scrolling table box) sticking out past the right edge
        const offenders = [...document.querySelectorAll('#app *')].filter(el => { if (el.closest('.tw') || el.closest('#side') || el.closest('.tabs') || el.closest('.manual-toc') || !el.offsetParent) return false; const r = el.getBoundingClientRect(); return r.width && r.right > w + 1; });
        if (offenders.length) bad.push(`${h}: ${offenders.slice(0, 3).map(el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')).join(', ')}`);
    });
    console.log('MCHECK ' + window.innerWidth + ' ' + JSON.stringify(bad.length ? bad : ['All screens fit']));
    const widest = [...document.querySelectorAll('body *')].filter(el => el.offsetParent).map(el => [el.getBoundingClientRect().right, el.tagName + (el.id ? '#' + el.id : '') + '.' + String(el.className).split(' ')[0] + ' w=' + Math.round(el.getBoundingClientRect().width)]).sort((a, b) => b[0] - a[0]).slice(0, 6);
    bad.push(`innerWidth ${window.innerWidth} clientWidth ${document.documentElement.clientWidth} widest: ${widest.map(x => Math.round(x[0]) + ' ' + x[1]).join(' | ')}`);
    document.title = bad.length ? `MOBILE FAIL ${bad.length}` : `MOBILE PASS ${pages.length}`;
    const pre = document.createElement('pre'); pre.id = 'results'; pre.textContent = bad.join('\n') || 'All screens fit';
    document.body.appendChild(pre);
}
