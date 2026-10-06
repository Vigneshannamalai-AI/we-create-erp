'use strict';
// ===================== We Create ERP · demo dashboard data =====================
// When the sample workspace is created, STAY BAY and Eco Pack get their own companies, connected to their
// dashboards. If a dashboard's real data is in this browser it is used; otherwise these built-in demo copies
// (same format as the dashboards save) are used, so the connections can be tried anywhere. The demo grows
// month by month like a live dashboard; syncing again adds only the new months.

function demoRnd(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const demoMonths = () => { const fy = fyOf(todayISO()); return fyMonths(fy).filter(m => m < ymOf(todayISO())); };

function demoStayBay() {
    const months = demoMonths();
    const staff = [
        ['SBY001', 'Ravi Kumar', 'Front Office', 'Front Office Manager', 32000, 'ABCPR1234K', 300], ['SBY002', 'Lakshmi Narayanan', 'Accounts', 'Accountant', 26000, 'BXKPL4471M', 0],
        ['SBY003', 'Selvi R', 'Housekeeping', 'Room Attendant', 15000, '', 0], ['SBY004', 'Murali K', 'Housekeeping', 'Housekeeping Supervisor', 19000, '', 0],
        ['SBY005', 'Anitha S', 'Front Office', 'Receptionist', 17000, '', 0], ['SBY006', 'Prakash D', 'Maintenance', 'Electrician', 18500, '', 0],
        ['SBY007', 'Karthik V', 'Security', 'Security Guard', 14000, '', 0], ['SBY008', 'Revathi M', 'Housekeeping', 'Laundry Attendant', 13500, '', 0]
    ];
    const rnd = demoRnd(7301);
    const employees = staff.map(([code, name, department, designation, salary, pan, tds], i) => {
        const payments = {};
        months.forEach(ym => {
            const lop = rnd() < 0.15 ? 1 + Math.floor(rnd() * 2) : 0;
            const adv = i === 2 && ym === months[1] ? 2000 : 0;
            const r = computePayRow({ salary, pf: true, esi: true, basicPct: 50, tdsMonthly: tds }, ym, lop, adv);
            payments[ym] = { paidOn: `${addMonths(ym, 1)}-0${1 + (i % 5)}`, snapshot: { gross: salary, lop: r2(salary - r.gross), earnedGross: r.gross, earnedBasic: r.basic, pf: r.pf, esi: r.esi, pt: r.pt, tds: r.tds, advance: r.adv, loan: 0, net: r.net, employerPf: r.erPf, employerEsi: r.erEsi } };
        });
        return { id: `sb${i + 1}`, code, name, department, designation, salary, doj: `20${18 + (i % 6)}-0${1 + (i % 9)}-10`, status: 'Active', pan, epf: `TNMAS00${54321 + i}`, salaryConfig: { pfEnabled: true, esiEnabled: true, basicPct: 50 }, payments };
    });
    return { employees, employer: { name: 'STAY BAY Business Hotels', address: 'No. 12, GST Road, Guindy', place: 'Chennai' }, from: 'built-in demo data' };
}

function demoEcoPack() {
    const months = demoMonths(), today = todayISO(), fy = fyOf(today);
    const rnd = demoRnd(4409);
    const products = [
        { id: 'garb', name: 'Garbage Bag (Black)', unit: 'kg', wt: 1, rate: 128, recipe: { hdpe: 0.6, rec: 0.4 } },
        { id: 'shop', name: 'Shopping Bag (W-cut)', unit: 'kg', wt: 1, rate: 150, recipe: { lldpe: 0.7, hdpe: 0.3 } },
        { id: 'bubble', name: 'Air Bubble Roll', unit: 'kg', wt: 1, rate: 172, recipe: { ldpe: 1 } }
    ];
    const materials = [{ id: 'hdpe', name: 'HDPE Granules', rate: 100 }, { id: 'rec', name: 'Reprocessed Granules', rate: 60 }, { id: 'lldpe', name: 'LLDPE Granules', rate: 105 }, { id: 'ldpe', name: 'LDPE Granules', rate: 110 }];
    const customers = [
        { id: 'c1', name: 'Sri Lakshmi Traders', city: 'Chennai', state: 'Tamil Nadu', gstin: makeGstin('33', 'AAKFS2210L'), creditDays: 30 },
        { id: 'c2', name: 'Deccan Electronics', city: 'Bengaluru', state: 'Karnataka', gstin: makeGstin('29', 'AADCD4410E'), creditDays: 45 },
        { id: 'c3', name: 'Coastal Fresh Mart', city: 'Puducherry', state: 'Puducherry', gstin: makeGstin('34', 'AAJFC7781M'), creditDays: 30 },
        { id: 'c4', name: 'Annai Supermarket', city: 'Madurai', state: 'Tamil Nadu', creditDays: 15 }
    ];
    const vendors = { hdpe: 'Polymer distributor, Ambattur', lldpe: 'Polymer distributor, Ambattur', ldpe: 'Reliance polymers dealer, Guindy', rec: 'Reprocessed granules supplier, Padi' };
    const start = `${fy}-04-01`;
    const moves = [
        ...materials.map(m => ({ date: start, type: 'rm', item: m.id, qty: 1500, rate: m.rate, kind: 'Opening' })),
        ...products.map(p => ({ date: start, type: 'fg', item: p.id, qty: 400, rate: Math.round(p.rate * 0.72), kind: 'Opening' }))
    ];
    const production = [], orders = [], maintenance = [];
    const buy = { hdpe: 2700, rec: 1350, lldpe: 1500, ldpe: 1650 };
    let inv = 0;
    months.forEach((ym, mi) => {
        materials.forEach((m, i) => moves.push({ date: `${ym}-0${3 + i}`, type: 'rm', item: m.id, qty: buy[m.id], rate: m.rate + Math.round(rnd() * 4), kind: 'Purchase', party: vendors[m.id], bill: `PB-${ym.slice(2).replace('-', '')}-${m.id.toUpperCase()}` }));
        ['08', '14', '20', '26'].forEach(d => products.forEach(p => production.push({ date: `${ym}-${d}`, productId: p.id, qty: { garb: 750, shop: 500, bubble: 375 }[p.id], scrap: { garb: 15, shop: 10, bubble: 8 }[p.id] })));
        for (let k = 0; k < 6; k++) {
            const p = products[k % 3], c = customers[(k + mi) % 4];
            const dd = String(10 + k * 3).padStart(2, '0'), date = `${ym}-${dd}`;
            const qty = { garb: 450, shop: 300, bubble: 220 }[p.id] + Math.round(rnd() * 40);
            const no = `EP/${fyLabel(fy)}/${String(++inv).padStart(4, '0')}`;
            const intra = c.state === 'Tamil Nadu';
            const total = Math.round(qty * p.rate * 1.18);
            const paidOn = addDays(date, c.creditDays);
            orders.push({ id: `o-${ym}-${k}`, no: `SO-${inv}`, date: addDays(date, -2), customerId: c.id, productId: p.id, qty, rate: p.rate, status: 'Dispatched', dispatch: { date, invoiceNo: no, vehicle: intra ? 'TN 01 AB 1234' : 'TN 02 CD 5678' }, payments: paidOn < today ? [{ date: paidOn, amount: total, mode: 'NEFT' }] : [] });
        }
        maintenance.push({ id: `mt-${ym}`, machineId: 'bf2', date: `${ym}-17`, type: mi % 2 ? 'Preventive' : 'Breakdown', issue: mi % 2 ? 'Die cleaning and calibration' : 'Heater band replaced', cost: 3500 + Math.round(rnd() * 3000), status: 'Closed' });
    });
    const emps = [['EP001', 'Murugan S', 'Extrusion', 'Extrusion Operator', 19500], ['EP002', 'Divya K', 'Quality', 'QC Inspector', 22000], ['EP003', 'Senthil R', 'Cutting & Sealing', 'Machine Operator', 17500], ['EP004', 'Arul P', 'Stores', 'Storekeeper', 18000], ['EP005', 'Kavitha M', 'Admin', 'Accounts Executive', 25000]];
    const employees = emps.map(([code, name, dept, desig, salary], i) => ({ id: `e${i + 1}`, code, unit: 'porur', name, dept, desig, salary, pf: true, esi: salary <= 21000, doj: `201${5 + i}-06-01`, status: 'Active' }));
    const pay = {};
    months.forEach(ym => {
        pay[ym] = {};
        employees.forEach((e, i) => {
            const r = computePayRow({ salary: e.salary, pf: true, esi: e.esi, basicPct: 50 }, ym, 0);
            pay[ym][e.id] = { paidOn: `${addMonths(ym, 1)}-0${2 + (i % 3)}`, snap: { gross: r.gross, basic: r.basic, pf: r.pf, esi: r.esi, pt: r.pt, ded: r.pf + r.esi + r.pt, net: r.net, erPf: r.erPf, erEsi: r.erEsi, lopDays: 0 } };
        });
    });
    return { db: { sample: true, company: { name: 'Eco Pack Private Limited', gstin: makeGstin('33', 'AAACE1734G'), stateCode: '33', address: 'Arcot Road, Porur, Chennai' }, units: [{ id: 'porur', short: 'Porur' }], machines: [{ id: 'bf2', name: 'Blown Film Extruder 2' }], products, materials, customers, moves, production, orders, maintenance, employees, pay }, from: 'built-in demo data', vendorGstin: { [vendors.hdpe]: makeGstin('33', 'AAAFP4100K'), [vendors.ldpe]: makeGstin('33', 'AABCR5521D'), [vendors.rec]: makeGstin('33', 'AAAFR4107K') } };
}
const demoSource = k => k === 'staybay' ? demoStayBay() : demoEcoPack();

// Business profiles for the two connected companies (what the ERP needs to know to apply the right rules)
const LINKED_BIZ = {
    staybay: { industry: 'hotel', maxTariff: 3500, hasRestaurant: false, specifiedOpt: false, turnoverLast: 14500000, turnoverExp: 16000000, employees: 8, cashPct: 20, investment: 30000000, scheme: 'regular', freq: 'monthly' },
    ecopack: { industry: 'manufacturer', excludedGoods: false, b2bShare: 90, turnoverLast: 60000000, turnoverExp: 72000000, employees: 5, cashPct: 2, investment: 40000000, paidUp: 5000000, netWorth: 30000000, borrowings: 15000000, interstate: true, scheme: 'regular', freq: 'monthly' }
};
