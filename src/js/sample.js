'use strict';
// ===================== We Create ERP · sample company =====================
// Builds about 18 months of realistic entries through the same saveVoucher() checks a user goes through.

function createSampleCompany() {
    const savedCo = co;
    let seed = 20261005;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const pick = a => a[Math.floor(rnd() * a.length)];
    const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const today = todayISO();
    const startFy = fyOf(today) - 1;
    const pan = 'AABCK4521M';
    co = newCompanyData({
        name: 'Kaveri Electricals', legalName: 'Kaveri Electricals Private Limited', entity: 'Private Ltd', gstin: makeGstin('33', pan), pan, tan: 'CHEK04512B',
        respName: 'R. Kaveri', respDesig: 'Director', respPan: 'AJKPK7722M', respMobile: '9840012345', deductorType: 'company', upi: 'kaverielectricals@hdfcbank', gstType: 'regular', gstFreq: 'monthly',
        state: '33', address: '14, Anna Salai, Teynampet', city: 'Chennai', pincode: '600018', phone: '9840012345', email: 'accounts@kaverielectricals.example',
        booksFrom: `${startFy}-04-01`, aato: 62000000, lut: true, bankName: 'HDFC Bank', bankAcc: '50200012345678', bankIfsc: 'HDFC0000123', roundOff: true
    });
    meta.companies.push({ id: co.id, name: co.profile.name, gstin: co.profile.gstin });
    audit('Company created', { entity: 'Company', ref: co.profile.name, after: 'Sample company' });
    const acc = (name, group, dr = 0, cr = 0) => saveAccount({ name, group, openDr: dr, openCr: cr }).id;
    sysAcc('cash').openDr = 45000;
    const bank = acc('HDFC Bank Current A/c', 'bank', 850000);
    const shareCap = acc('Equity Share Capital', 'capital', 0, 1000000);
    const loan = acc('Term Loan – SBI', 'loans', 0, 600000);
    const furn = acc('Furniture & Fixtures', 'fixed', 350000);
    const comp = acc('Computers', 'fixed', 180000);
    const elec = acc('Electricity Charges', 'indexp');
    const advTax = acc('Advance Income Tax', 'loansadv');
    const taxExp = acc('Current Tax', 'taxexp');
    const taxProv = acc('Provision for Income Tax', 'provisions');
    const telephone = acc('Telephone & Internet', 'indexp');
    const surplus = acc('Surplus in P&L (opening)', 'reserves');
    sysAcc('capital').name = "Directors' Current Account";

    const item = (name, type, hsn, gstRate, rate, purchaseRate, openQty = 0, unit = 'NOS') => saveItem({ name, type, hsn, gstRate, rate, purchaseRate, unit, openQty, openValue: openQty * purchaseRate, trackStock: type === 'goods' }).id;
    const I = {
        bulb: item('LED Bulb 9W', 'goods', '853952', 18, 95, 62, 800),
        wire: item('Copper Wire 1.5 sq mm (90 m)', 'goods', '854449', 18, 1450, 1120, 120, 'BOX'),
        fan: item('Ceiling Fan 1200 mm', 'goods', '841451', 18, 2350, 1780, 60),
        mcb: item('MCB 32A Double Pole', 'goods', '853620', 18, 240, 165, 300),
        pipe: item('PVC Conduit Pipe 25 mm', 'goods', '391723', 18, 120, 82, 500, 'PCS'),
        solar: item('Solar Water Heater 200 L', 'goods', '841919', 5, 18500, 14200, 6),
        install: item('Electrical Installation Service', 'service', '995461', 18, 1200, 0, 0, 'HRS'),
        legal: item('Legal Consultancy', 'service', '998212', 18, 0, 25000, 0, 'OTH'),
        freight: item('Goods Transport (GTA)', 'service', '996511', 5, 0, 8000, 0, 'OTH'),
        rent: item('Office Rent', 'service', '997212', 18, 0, 60000, 0, 'OTH'),
        phone: item('Broadband & Phone', 'service', '998422', 18, 0, 2500, 0, 'OTH'),
        scrap: item('Copper & PVC Scrap', 'goods', '740400', 18, 420, 0, 0, 'KGS')
    };
    co.items.find(i => i.id === I.rent).purchaseAcc = sysId('rent');
    co.items.find(i => i.id === I.legal).purchaseAcc = sysId('professional');
    co.items.find(i => i.id === I.freight).purchaseAcc = sysId('freight');
    co.items.find(i => i.id === I.phone).purchaseAcc = telephone;
    co.items.find(i => i.id === I.scrap).trackStock = false;   // scrap arises from operations, not purchased

    const ct = c => saveContact({ creditDays: 30, ...c }).id;
    const C = {
        prakash: ct({ type: 'customer', name: 'Prakash Constructions', gstin: makeGstin('33', 'AAFFP2231K'), state: '33', city: 'Chennai', phone: '9884011122', openDr: 120000, creditDays: 30 }),
        sunrise: ct({ type: 'customer', name: 'Sunrise Builders Pvt Ltd', gstin: makeGstin('29', 'AAKCS7788L'), state: '29', city: 'Bengaluru', phone: '9845022233', creditDays: 45 }),
        walkin: ct({ type: 'customer', name: 'Walk-in Customer (Cash)', state: '33', city: 'Chennai', creditDays: 0 }),
        thomas: ct({ type: 'customer', name: 'Thomas Mathew', state: '32', city: 'Kochi', phone: '9447033344', creditDays: 15 }),
        gulf: ct({ type: 'customer', name: 'Gulf Lights Trading LLC', state: '96', city: 'Dubai', creditDays: 60 }),
        scrapCo: ct({ type: 'customer', name: 'Metro Scrap Traders', gstin: makeGstin('33', 'AAPFM6611R'), state: '33', city: 'Chennai', tcsSection: 'scrap', creditDays: 7 }),
        ramesh: ct({ type: 'vendor', name: 'Ramesh Agencies', gstin: makeGstin('33', 'ABMPR4455Q'), state: '33', city: 'Chennai', msme: true, udyam: 'UDYAM-TN-02-0012345', creditDays: 30, openCr: 95000 }),
        polycab: ct({ type: 'vendor', name: 'Wirecraft Industries Ltd', gstin: makeGstin('27', 'AABCW3344D'), state: '27', city: 'Mumbai', creditDays: 45 }),
        advocate: ct({ type: 'vendor', name: 'Adv. S. Krishnan', pan: 'BCDPK5566E', state: '33', city: 'Chennai', tdsSection: '194J-P', creditDays: 15 }),
        gta: ct({ type: 'vendor', name: 'Speed Transport Co', pan: 'AAJFS9988P', state: '33', city: 'Chennai', creditDays: 15 }),
        landlord: ct({ type: 'vendor', name: 'Shanthi Properties', pan: 'AAAPS1234B', state: '33', city: 'Chennai', tdsSection: '194I-B', creditDays: 5 }),
        airtel: ct({ type: 'vendor', name: 'Bharti Airtel Ltd', gstin: makeGstin('33', 'AAACB2894G'), state: '33', city: 'Chennai', creditDays: 15 })
    };
    // Balance the opening position through opening surplus
    const diff = openingDifference();
    const sa = accById(surplus);
    if (diff > 0) sa.openCr = diff; else sa.openDr = -diff;
    saveCo();

    const stock = Object.fromEntries(co.items.map(i => [i.id, Number(i.openQty) || 0]));
    const sv = o => saveVoucher(o, { source: 'Sample data' });
    const line = (id, qty, over = {}) => { const it = itemById(id); return { itemId: id, desc: it.name, hsn: it.hsn, qty, unit: it.unit, rate: over.rate ?? (it.rate || it.purchaseRate), disc: over.disc || 0, gstRate: it.gstRate, accId: '' }; };
    const buyLine = (id, qty) => { const it = itemById(id); stock[id] += qty; return { ...line(id, qty, { rate: it.purchaseRate }) }; };
    const sellLine = (id, want) => { const q = Math.max(0, Math.min(want, stock[id] - 5)); stock[id] -= q; return q ? line(id, q) : null; };
    const d = (ym, day) => { const x = dayIso2(ym, day); return x > today ? null : x; };
    const dayIso2 = (ym, day) => `${ym}-${String(Math.min(day, Number(lastDay(ym).slice(8)))).padStart(2, '0')}`;
    const months = [];
    for (let m = `${startFy}-04`; m <= ymOf(today); m = addMonths(m, 1)) months.push(m);
    const goods = [I.bulb, I.wire, I.fan, I.mcb, I.pipe];
    let invCount = 0;
    const gstDue = {};
    const skipPay = new Set();

    months.forEach((ym, mi) => {
        const last = lastDay(ym) <= today ? lastDay(ym) : null;
        // ---- previous month's dues paid early in this month ----
        const prev = addMonths(ym, -1);
        const tdsPrev = tdsRegister(fyOf(prev + '-01')).months.find(m => m.ym === prev);
        if (tdsPrev?.pending > 0 && d(ym, 6)) sv({ type: 'PY', date: d(ym, 6), accountId: bank, ledgerId: sysId('tdsPay'), taxMonth: prev, amount: tdsPrev.pending, challan: { bsr: '0510308', serial: String(between(10000, 99999)) }, narration: `TDS deposited for ${ymLabel(prev)}` });
        const tcsPrev = taxRegister('tcs', fyOf(prev + '-01')).months.find(m => m.ym === prev);
        if (tcsPrev?.pending > 0 && d(ym, 6)) sv({ type: 'PY', date: d(ym, 6), accountId: bank, ledgerId: sysId('tcsPay'), taxMonth: prev, amount: tcsPrev.pending, challan: { bsr: '0510308', serial: String(between(10000, 99999)) }, narration: `TCS deposited for ${ymLabel(prev)}` });
        if (gstDue[prev] && d(ym, 18)) {
            const g = gstDue[prev];
            [['outIgst', g.cash.iamt - g.rcm.iamt], ['outCgst', g.cash.camt - g.rcm.camt], ['outSgst', g.cash.samt - g.rcm.samt], ['rcmPay', g.rcm.iamt + g.rcm.camt + g.rcm.samt]].forEach(([k, amt]) => {
                if (r2(amt) > 0) sv({ type: 'PY', date: d(ym, 18), accountId: bank, ledgerId: sysId(k), amount: r2(amt), narration: `GST paid for ${ymLabel(prev)} (PMT-06)` });
            });
        }
        // ---- purchases ----
        const p1 = d(ym, 3);
        if (p1) sv({ type: 'PB', date: p1, partyId: C.ramesh, refNo: `RA/${ym.replace('-', '')}/${between(100, 199)}`, lines: [buyLine(I.bulb, between(600, 900)), buyLine(I.mcb, between(250, 400)), buyLine(I.pipe, between(400, 700))] });
        const p2 = d(ym, 12);
        if (p2) sv({ type: 'PB', date: p2, partyId: C.polycab, refNo: `WIL-${String(4000 + mi * 3).padStart(5, '0')}`, lines: [buyLine(I.wire, between(90, 140)), buyLine(I.fan, between(70, 100))] });
        const p3 = d(ym, 20);
        if (p3) sv({ type: 'PB', date: p3, partyId: C.ramesh, refNo: `RA/${ym.replace('-', '')}/${between(200, 299)}`, lines: [buyLine(I.bulb, between(300, 500)), buyLine(I.mcb, between(150, 250))] });
        if (mi % 3 === 0 && d(ym, 9)) sv({ type: 'PB', date: d(ym, 9), partyId: C.ramesh, refNo: `RA/${ym.replace('-', '')}/S${mi}`, lines: [buyLine(I.solar, between(3, 6))] });
        const rentDay = d(ym, 1);
        if (rentDay) sv({ type: 'PB', date: rentDay, partyId: C.landlord, refNo: `RENT-${ym}`, rcm: true, tds: { section: '194I-B' }, lines: [line(I.rent, 1, { rate: 60000 })] });
        if (d(ym, 25)) sv({ type: 'PB', date: d(ym, 25), partyId: C.airtel, refNo: `AIR${ym.replace('-', '')}${between(10, 99)}`, lines: [line(I.phone, 1, { rate: 2500 })] });
        if (mi % 2 === 0 && d(ym, 13)) sv({ type: 'PB', date: d(ym, 13), partyId: C.gta, refNo: `ST/${mi + 101}`, rcm: true, lines: [line(I.freight, 1, { rate: between(6, 12) * 1000 })] });
        if (mi % 3 === 1 && d(ym, 16)) sv({ type: 'PB', date: d(ym, 16), partyId: C.advocate, refNo: `SK/${ym}`, rcm: true, tds: { section: '194J-P' }, lines: [line(I.legal, 1, { rate: 25000 })] });

        // ---- sales ----
        const sale = (day, partyId, lines, extra = {}) => {
            const dt = d(ym, day);
            const L = lines.filter(Boolean);
            if (!dt || !L.length) return null;
            invCount++;
            return sv({ type: 'SI', date: dt, partyId, lines: L, ...extra });
        };
        [5, 11, 19, 24].forEach(day => sale(day, C.prakash, [sellLine(pick(goods), between(120, 260)), sellLine(I.wire, between(12, 25)), sellLine(I.pipe, between(80, 160)), rnd() < 0.5 ? line(I.install, between(16, 40)) : null]));
        [7, 16, 23].forEach(day => sale(day, C.sunrise, [sellLine(I.fan, between(15, 25)), sellLine(I.wire, between(10, 18)), sellLine(I.mcb, between(60, 110)), sellLine(I.bulb, between(100, 200))]));
        [4, 9, 13, 18, 22, 27].forEach(day => { const v = sale(day, C.walkin, [sellLine(pick(goods), between(10, 40))]); if (v) sv({ type: 'RC', date: v.date, accountId: sysId('cash'), partyId: C.walkin, amount: v.totals.total, alloc: [{ vid: v.id, amt: v.totals.total }], narration: `Cash sale ${v.no}` }); });
        if (mi % 3 === 2) sale(17, C.thomas, [sellLine(I.solar, 4), sellLine(I.fan, 20)]);
        if (mi % 3 === 0 && d(ym, 26)) { const v = sale(26, C.scrapCo, [line(I.scrap, between(150, 400))], { tcs: { section: 'scrap' } }); }
        if (mi % 4 === 1) sale(21, C.gulf, [sellLine(I.fan, 25), sellLine(I.bulb, 200)]);
        if (mi % 5 === 3 && d(ym, 26)) {
            const inv = co.vouchers.filter(v => v.type === 'SI' && v.partyId === C.prakash && ymOf(v.date) === ym && v.status !== 'cancelled' && outstanding(v) > 1000)[0];
            if (inv) { const l = inv.lines[0]; stock[l.itemId] += 5; sv({ type: 'CN', date: d(ym, 26), partyId: C.prakash, origId: inv.id, reason: 'Sales return', lines: [{ ...l, qty: 5 }] }); }
        }
        if (mi === 6 && d(ym, 27)) { const b = co.vouchers.filter(v => v.type === 'PB' && v.partyId === C.polycab && ymOf(v.date) === ym)[0]; if (b) { const l = b.lines[0]; stock[l.itemId] -= 3; sv({ type: 'DN', date: d(ym, 27), partyId: C.polycab, origId: b.id, reason: 'Sales return', lines: [{ ...l, qty: 3 }] }); } }

        // ---- receipts: customers settle earlier invoices ----
        const collect = (partyId, day, share) => {
            const dt = d(ym, day);
            if (!dt) return;
            const bills = openBills(partyId, 'SI').filter(b => daysBetween(b.v.date, dt) >= 20);
            const due = sum(bills, 'due');
            if (due < 1) return;
            const amt = r2(due * share);
            let left = amt;
            const alloc = [];
            bills.forEach(b => { if (left <= 0) return; const a = r2(Math.min(left, b.due)); alloc.push({ vid: b.v.id, amt: a }); left = r2(left - a); });
            sv({ type: 'RC', date: dt, accountId: bank, partyId, amount: amt, alloc, refNo: `NEFT${between(100000, 999999)}`, narration: 'Received by NEFT' });
        };
        collect(C.prakash, 10, 1); collect(C.scrapCo, 12, 1); collect(C.sunrise, 15, ym >= addMonths(ymOf(today), -2) ? 0.5 : 1); collect(C.thomas, 28, 1); collect(C.gulf, 28, 1);
        // ---- payments to suppliers ----
        const payOff = (partyId, day, minAge) => {
            const dt = d(ym, day);
            if (!dt) return;
            const bills = openBills(partyId, 'PB').filter(b => daysBetween(b.v.date, dt) >= minAge && !skipPay.has(b.v.id));
            if (!bills.length) return;
            const amt = sum(bills, 'due');
            sv({ type: 'PY', date: dt, accountId: bank, partyId, amount: amt, alloc: bills.map(b => ({ vid: b.v.id, amt: b.due })), refNo: `NEFT${between(100000, 999999)}` });
        };
        // One MSME bill is left unpaid on purpose so the 45-day alert shows
        if (ym === addMonths(ymOf(today), -2)) { const b = openBills(C.ramesh, 'PB').find(x => ymOf(x.v.date) === ym); if (b) skipPay.add(b.v.id); }
        payOff(C.ramesh, 26, 20); payOff(C.polycab, 28, 30); payOff(C.landlord, 5, 0); payOff(C.airtel, 28, 0); payOff(C.gta, 20, 3); payOff(C.advocate, 28, 5);
        if (mi === 0 && d(ym, 15)) { const op = Number(contactById(C.ramesh).openCr); sv({ type: 'PY', date: d(ym, 15), accountId: bank, partyId: C.ramesh, amount: op, narration: 'Opening balance cleared' }); sv({ type: 'RC', date: d(ym, 15), accountId: bank, partyId: C.prakash, amount: 120000, narration: 'Opening balance received' }); }
        // ---- running costs ----
        if (d(ym, 1)) sv({ type: 'PY', date: d(ym, 1), accountId: bank, ledgerId: sysId('salary'), amount: 90000, narration: `Salaries for ${ymLabel(prev)}` });
        if (d(ym, 10)) sv({ type: 'PY', date: d(ym, 10), accountId: bank, ledgerId: elec, amount: between(9, 16) * 1000, narration: 'TNPDCL electricity bill' });
        if (d(ym, 5)) { sv({ type: 'PY', date: d(ym, 5), accountId: bank, ledgerId: sysId('interest'), amount: 5000, narration: 'Term loan interest' }); sv({ type: 'PY', date: d(ym, 5), accountId: bank, ledgerId: loan, amount: 10000, narration: 'Term loan EMI principal' }); }
        if (d(ym, 29)) {
            const cashBal = balance(sysId('cash'), d(ym, 29));
            if (cashBal > 60000) sv({ type: 'CT', date: d(ym, 29), accountId: sysId('cash'), toId: bank, amount: Math.floor((cashBal - 40000) / 1000) * 1000, narration: 'Cash deposited in bank' });
        }
        if (mi % 3 === 2 && d(ym, 30)) sv({ type: 'PY', date: d(ym, 30), accountId: bank, ledgerId: sysId('bankCharges'), amount: 590, narration: 'Bank charges incl. GST' });
        ['06-15', '09-15', '12-15', '03-15'].forEach(md => { if (ym.slice(5) === md.slice(0, 2) && d(ym, 15)) sv({ type: 'PY', date: d(ym, 15), accountId: bank, ledgerId: advTax, amount: 60000, narration: 'Advance tax (challan 280)' }); });
        // ---- month end: GST set-off ----
        if (last) {
            const g = gstr3b(ym);
            try { postSetOff(ym); } catch (e) { /* no credit this month */ }
            gstDue[ym] = { cash: g.setoff.cash, rcm: g.rcmLiab };
        }
        // ---- year end: depreciation and tax provision ----
        if (ym.endsWith('-03') && last) {
            sv({ type: 'JV', date: last, jlines: [{ acc: sysId('depreciation'), dr: 95000, cr: 0 }, { acc: furn, dr: 0, cr: 35000 }, { acc: comp, dr: 0, cr: 60000 }], narration: 'Depreciation for the year (Schedule II useful lives, straight line)' });
            const pbt = plData(fyStart(fyOf(last)) < co.profile.booksFrom ? co.profile.booksFrom : fyStart(fyOf(last)), last).pbt;
            if (pbt > 0) sv({ type: 'JV', date: last, jlines: [{ acc: taxExp, dr: Math.round(pbt * 0.25168), cr: 0 }, { acc: taxProv, dr: 0, cr: Math.round(pbt * 0.25168) }], narration: 'Provision for income tax @ 25.168% (concessional regime, old section 115BAA)' });
        }
    });
    // e-Invoices for B2B / export invoices (turnover above ₹5 crore)
    co.vouchers.filter(v => einvoiceApplies(v) && !v.irn).forEach(v => { try { generateIrn(v.id); } catch (e) { /* skip */ } });
    // Returns filed up to two months back
    const cut = addMonths(ymOf(today), -1);
    months.filter(m => m < cut).forEach(m => {
        markFiled('GSTR-1', m, `AA33${m.replace('-', '')}${between(1000000, 9999999)}`, `${addMonths(m, 1)}-10`);
        markFiled('GSTR-3B', m, `AA33${m.replace('-', '')}${between(1000000, 9999999)}`, `${addMonths(m, 1)}-19`);
        if (tdsRegister(fyOf(m + '-01')).months.find(x => x.ym === m)?.deducted) markFiled('TDS-PAY', m, `CIN${between(10000000, 99999999)}`, `${addMonths(m, 1)}-06`);
        if (taxRegister('tcs', fyOf(m + '-01')).months.find(x => x.ym === m)?.deducted) markFiled('TCS-PAY', m, `CIN${between(10000000, 99999999)}`, `${addMonths(m, 1)}-06`);
    });
    [startFy, startFy + 1].forEach(fy => {
        [['Q1', `${fy}-07-31`], ['Q2', `${fy}-10-31`], ['Q3', `${fy + 1}-01-31`], ['Q4', `${fy + 1}-05-31`]].forEach(([q, due]) => { if (due < today) { markFiled('FORM-140', `${q}-${fy}`, `TOKEN${between(100000, 999999)}`, addDays(due, -5)); if (taxRegister('tcs', fy).rows.some(r => QUARTERS[q].includes(Number(r.month.slice(5))))) markFiled('FORM-143', `${q}-${fy}`, `TOKEN${between(100000, 999999)}`, addDays(due, -5)); } });
        [['15%', `${fy}-06-15`], ['45%', `${fy}-09-15`], ['75%', `${fy}-12-15`], ['100%', `${fy + 1}-03-15`]].forEach(([p, due]) => { if (due < today) markFiled('ADV-TAX', `${p}-${fy}`, `CIN${between(10000000, 99999999)}`, due); });
        if (`${fy + 1}-12-31` < today) markFiled('GSTR-9', `FY-${fy}`, 'ARN');
        if (`${fy}-10-31` < today) markFiled('MSME-1', `H1-${fy}`, 'SRN');
        if (`${fy + 1}-04-30` < today) markFiled('MSME-1', `H2-${fy}`, 'SRN');
    });
    // A bank statement for the last weeks, with one charge not yet in the books
    const recent = (book().entries.get(bank) || []).filter(e => e.date >= addDays(today, -25));
    recent.forEach((e, i) => { if (i % 6 !== 5) co.bankLines.push({ id: uid('bl'), accId: bank, date: addDays(e.date, i % 3 === 0 ? 1 : 0), desc: (vById(e.vid).narration || ledgerOf(vById(e.vid).partyId || vById(e.vid).ledgerId)?.name || 'Transfer').toUpperCase().slice(0, 40), amt: r2(e.dr - e.cr), ref: vById(e.vid).refNo || '', vid: '' }); });
    co.bankLines.push({ id: uid('bl'), accId: bank, date: addDays(today, -2), desc: 'SMS ALERT CHARGES', amt: -59, ref: '', vid: '' });
    if (`${startFy + 1}-09-30` < today) co.settings.lockDate = `${startFy + 1}-03-31`;   // last year audited and closed
    audit('Sample data loaded', { entity: 'Company', ref: co.profile.name, after: `${co.vouchers.length} vouchers` });
    saveCo();
    saveMeta();
    const created = co;
    if (savedCo) { co = savedCo; ver++; }
    return created;
}
