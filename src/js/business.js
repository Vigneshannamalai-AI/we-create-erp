'use strict';
// ===================== We Create ERP · business profile =====================
// The ERP first learns what the business does and how big it is, then works out which GST rates, input credit
// rules, returns, income-tax, company-law and labour rules apply — and sets the books up for them.
// Rates as per GST 2.0 (from 22 Sep 2025) and the Income-tax Act 2025 (old 1961 section numbers shown in brackets).
// These are the general rules; special cases (notifications, exemptions, state rules) should be confirmed with a CA.

// Supplies: { name, hsn, rate, itc: input credit allowed on this supply, type, note, exempt, eco95 }
const sup = (name, hsn, rate, itc, note = '', x = {}) => ({ name, hsn, rate, itc, type: String(hsn).startsWith('99') ? 'service' : 'goods', note, ...x });

const INDUSTRIES = {
    hotel: {
        name: 'Hotel, lodge or homestay', icon: '🏨', sells: 'services', comp: 'services',
        q: ['maxTariff', 'hasRestaurant', 'specifiedOpt', 'hallHire'],
        supplies: b => {
            const hi = Number(b.maxTariff) > 7500, spec = hi || b.specifiedOpt;
            const L = [sup('Room – tariff up to ₹7,500 a night', '996311', 5, false, 'GST 2.0: 5% without input credit. The rate depends on the amount actually charged per room per night (not a declared tariff).')];
            if (hi) L.push(sup('Room – tariff above ₹7,500 a night', '996311', 18, true, '18% with input credit.'));
            if (b.hasRestaurant) L.push(spec
                ? sup('Restaurant in the hotel (specified premises)', '996331', 18, true, 'A hotel that charged above ₹7,500 for any room last year (or opted in) is "specified premises": its restaurant charges 18% with credit.')
                : sup('Restaurant in the hotel', '996331', 5, false, '5% without input credit (not specified premises).'));
            if (b.hallHire) L.push(sup('Hall / room hire for meetings (no food)', '997212', 18, true));
            if (b.hasRestaurant) L.push(sup('Banquet / outdoor catering', '996334', spec ? 18 : 5, spec, spec ? '18% with credit in specified premises.' : '5% without credit.'));
            return L;
        },
        rules: b => [
            ['Industry', 'info', 'Room rate decides GST', 'Every bill is taxed by the price per room per night: up to ₹7,500 → 5% without input credit; above ₹7,500 → 18% with credit. There is no longer an exemption below ₹1,000.'],
            itcPolicyOf(b) === 'mixed'
                ? ['Industry', 'must', 'Mixed supplies: reverse common credit (Rule 42)', 'You make both 5%-without-credit and 18%-with-credit supplies (rooms above ₹7,500, hall hire, or a restaurant in specified premises). Credit on purchases used only for 18% supplies can be claimed; credit on common purchases is reversed in proportion to the 5% turnover every month. The ERP calculates this in GSTR-3B table 4(B)(1).']
                : ['Industry', 'must', 'No input tax credit', 'All your supplies are at 5% without credit, so GST paid on purchases (including reverse charge) cannot be claimed; it becomes part of the cost. The ERP marks every purchase "credit not eligible" automatically.'],
            ['Industry', 'option', 'Specified premises declaration', 'To charge 18% with credit on the restaurant even with rooms below ₹7,500, file the opt-in declaration on the GST portal between 1 January and 31 March for the next year.'],
            ['Industry', 'info', 'TDS by corporate guests', 'Companies that book rooms regularly deduct TDS on rent (10%, old 194-I). Record it as TDS receivable when you get the payment and match it with Form 26AS / AIS before filing your return.'],
            ['Industry', 'info', 'Licences', 'Trade licence, fire NOC, police (Form C for foreign guests), FSSAI for food, and a bar licence if liquor is served (liquor is outside GST; state VAT applies).']
        ]
    },
    restaurant: {
        name: 'Restaurant, café, sweet shop or cloud kitchen', icon: '🍽', sells: 'services', comp: 'restaurant',
        q: ['aggregator', 'inSpecified'],
        supplies: b => [
            b.inSpecified ? sup('Food & beverages (in specified premises)', '996331', 18, true, '18% with credit: restaurant inside a hotel that charged above ₹7,500 for a room.')
                : sup('Food & beverages – dine-in / takeaway / delivery', '996331', 5, false, '5% without input credit.'),
            ...(b.aggregator ? [sup('Orders through Swiggy / Zomato', '996331', 5, false, 'The app collects and pays this GST under section 9(5); your invoice to the app shows no tax. Reported separately in GSTR-1 and GSTR-3B table 3.1.1.', { eco95: true })] : []),
            sup('Outdoor catering', '996334', b.inSpecified ? 18 : 5, Boolean(b.inSpecified))
        ],
        rules: b => [
            ['Industry', 'must', 'No input tax credit', 'Restaurant service at 5% is without credit: GST on rent, ingredients, equipment and reverse charge is a cost. The ERP marks purchases "credit not eligible" automatically.'],
            ...(b.aggregator ? [['Industry', 'info', 'Food apps pay the GST', 'Swiggy / Zomato collect 5% from customers and pay it themselves (section 9(5)). You still report these sales (without tax) — use the "Orders through Swiggy / Zomato" item so they land in the right table.']] : []),
            ['Industry', 'info', 'Licences', 'FSSAI registration or licence (by turnover), trade licence, fire NOC; liquor is outside GST (state VAT and excise).']
        ]
    },
    trader: {
        name: 'Shop, trader or wholesaler (goods)', icon: '🛒', sells: 'goods', comp: 'goods', q: ['b2bShare'],
        supplies: () => [sup('Goods – standard rate', '8536', 18, true, 'Most goods are 18% after GST 2.0; luxury and sin goods 40%. Set the HSN and rate on each item.', { ref: true }), sup('Goods – merit rate (daily-use items)', '1905', 5, true, 'Food items, essentials and many daily-use goods are 5%; fresh milk, vegetables and unbranded cereals are nil.', { ref: true })],
        rules: () => [['Industry', 'info', 'E-way bills', 'Needed before goods worth above ₹50,000 move (some states set a higher limit within the state). The ERP reminds you on invoices above that value.']]
    },
    manufacturer: {
        name: 'Manufacturer or factory', icon: '🏭', sells: 'goods', comp: 'goods', q: ['excludedGoods', 'b2bShare', 'investment'],
        supplies: () => [sup('Finished goods – standard rate', '3923', 18, true, 'Set HSN and rate on each product.', { ref: true })],
        rules: b => [
            ['Industry', 'info', 'Production and costing', 'Record production (materials consumed → finished goods) so stock is valued at cost and the P&L shows cost of materials consumed and change in inventories (Schedule III).'],
            ['Industry', 'info', 'Job work', `Goods sent to a job worker: file ITC-04 ${nz(b.turnoverLast) > 50000000 ? 'half-yearly (25 Oct, 25 Apr)' : 'yearly (25 April)'}; inputs not returned within 1 year (capital goods 3 years) are treated as supplied.`],
            ['Industry', 'info', 'E-way bills', 'Needed for every movement of goods above ₹50,000, including to job workers.']
        ]
    },
    professional: {
        name: 'Professional or consultant (CA, IT, architect, freelancer, advocate)', icon: '💼', sells: 'services', comp: 'services', presumptive: 'profession', q: ['advocate', 'exports'],
        supplies: b => [
            b.advocate ? sup('Legal services to a business (reverse charge)', '998212', 18, true, 'The business client pays the GST under reverse charge; your invoice shows no tax.', { rcmOut: true })
                : sup('Professional / consulting services', '998311', 18, true),
            ...(b.exports ? [sup('Export of services (under LUT)', '998311', 18, true, 'Zero-rated: no GST under LUT if paid in foreign currency.')] : [])
        ],
        rules: b => [
            ...(b.advocate ? [['Industry', 'info', 'Advocates do not register for GST', 'Legal services to businesses are under reverse charge (the client pays); services to individuals are exempt. You usually need no GST registration.']] : []),
            ...(b.exports ? [['Industry', 'must', 'LUT for exports', 'File the LUT (GST RFD-11) every year before the first export invoice, so exports go out without IGST.']] : [])
        ]
    },
    healthcare: {
        name: 'Clinic, hospital, diagnostic lab or pharmacy', icon: '🏥', sells: 'both', comp: null, q: ['pharmacy', 'roomsAbove5000'],
        supplies: b => [
            sup('Health care services (doctor, hospital, diagnostics)', '999311', 0, false, 'Exempt: no GST charged, no input credit.', { exempt: true }),
            ...(b.roomsAbove5000 ? [sup('Hospital room above ₹5,000 a day (non-ICU)', '999311', 5, false, '5% without input credit.')] : []),
            ...(b.pharmacy ? [sup('Medicines (pharmacy)', '3004', 5, true, 'Most medicines are 5% after GST 2.0 (some life-saving drugs nil).')] : [])
        ],
        rules: b => [['Industry', 'must', b.pharmacy ? 'Mixed supplies: reverse common credit (Rule 42)' : 'No input tax credit', b.pharmacy ? 'Credit on medicines bought for the pharmacy is claimed; credit on common costs is reversed in proportion to exempt health-care turnover each month.' : 'Health care is exempt, so GST on purchases cannot be claimed. A hospital with only exempt services need not register for GST.']]
    },
    education: {
        name: 'School, college or coaching centre', icon: '🎓', sells: 'services', comp: 'services', q: ['coaching'],
        supplies: b => [sup('School education (pre-school to higher secondary, recognised courses)', '999210', 0, false, 'Exempt.', { exempt: true }), ...(b.coaching ? [sup('Coaching / training', '999293', 18, true)] : [])],
        rules: b => [['Industry', 'must', b.coaching ? 'Mixed supplies: reverse common credit (Rule 42)' : 'No input tax credit', b.coaching ? 'Credit on common costs is reversed in proportion to exempt education turnover.' : 'Recognised education is exempt: no GST on fees and no credit on purchases.']]
    },
    transport: {
        name: 'Transport (goods transport agency, cabs, buses)', icon: '🚚', sells: 'services', comp: 'services', presumptive: 'transport', q: ['gtaOption', 'vehicles'],
        supplies: b => [
            b.gtaOption === 'fwd18' ? sup('Goods transport (GTA) – forward charge', '996511', 18, true, '18% with credit (opted).')
                : b.gtaOption === 'fwd5' ? sup('Goods transport (GTA) – forward charge', '996511', 5, false, '5% without credit (opted).')
                : sup('Goods transport (GTA) – customer pays (reverse charge)', '996511', 5, false, 'For business customers the customer pays 5% under reverse charge; your consignment note shows no tax.', { rcmOut: true }),
            sup('Passenger transport / cab with fuel', '996412', 5, false, '5% without credit.')
        ],
        rules: () => [['Industry', 'option', 'GTA forward charge', 'A GTA may choose to pay GST itself at 5% (no credit) or 18% (with credit) by filing Annexure V before 31 March for the next year. Otherwise business customers pay under reverse charge.']]
    },
    construction: {
        name: 'Construction or real estate', icon: '🏗', sells: 'services', comp: 'services', q: [],
        supplies: () => [sup('Works contract (commercial / industrial)', '995411', 18, true), sup('Residential apartments (not affordable)', '995411', 5, false, '5% without credit; one-third of the price is deemed land value, so the effective rate is lower. Affordable housing has an effective 1% rate.')],
        rules: () => [['Industry', 'info', 'Real estate conditions', 'Residential projects at the concessional rate must buy at least 80% of inputs from registered suppliers, otherwise they pay tax on the shortfall under reverse charge at 18%. Works contracts for others are 18% with credit. A builder with both commercial and residential projects reverses common credit under Rule 42.']]
    },
    wellness: {
        name: 'Salon, spa, gym or yoga centre', icon: '💇', sells: 'services', comp: 'services', q: [],
        supplies: () => [sup('Salon / beauty / gym / yoga services', '999721', 5, false, 'GST 2.0: 5% without input credit.')],
        rules: () => [['Industry', 'must', 'No input tax credit', 'Your services are at 5% without credit, so GST on purchases cannot be claimed.']]
    },
    tour: {
        name: 'Travel agent or tour operator', icon: '✈', sells: 'services', comp: 'services', q: [],
        supplies: () => [sup('Tour package', '998552', 5, false, '5% without input credit (excluding air fare if shown separately).'), sup('Ticket booking commission / service fee', '998551', 18, true)],
        rules: () => [['Industry', 'must', 'Mixed supplies: reverse common credit (Rule 42)', 'Credit on common costs is reversed in proportion to tour-package turnover.'], ['Industry', 'info', 'TCS on overseas tour packages', 'Collect TCS on overseas tour packages (section 394, old 206C(1G)) and file Form 143 quarterly.']]
    },
    ecommerce: {
        name: 'Online seller (Amazon, Flipkart, Meesho…)', icon: '📦', sells: 'goods', comp: 'goods', q: ['b2bShare'],
        supplies: () => [sup('Goods sold online – standard rate', '8536', 18, true, 'Set HSN and rate on each item.', { ref: true })],
        rules: () => [['Industry', 'must', 'TCS and TDS by the marketplace', 'The marketplace collects 0.5% GST TCS (claim it in your cash ledger after it shows in GSTR-2B/TCS credit) and deducts 0.1% income-tax TDS (old 194-O). Match the monthly settlement reports with your sales.'],
            ['GST', 'must', 'GST registration', 'Selling through a marketplace needs GST registration whatever the turnover, except small sellers selling only within the state under the enrolment scheme.']]
    },
    textiles: {
        name: 'Garments, textiles or footwear', icon: '👕', sells: 'goods', comp: 'goods', q: ['b2bShare'],
        supplies: () => [sup('Garments / footwear – up to ₹2,500 a piece', '6109', 5, true, 'GST 2.0: 5% when the sale value per piece is up to ₹2,500.'), sup('Garments / footwear – above ₹2,500 a piece', '6109', 18, true), sup('Fabric', '5208', 5, true)],
        rules: () => [['Industry', 'info', 'Rate by price', 'The rate on garments and footwear depends on the value per piece; a discount that brings the price to ₹2,500 or less changes the rate to 5%.']]
    },
    jewellery: {
        name: 'Jeweller', icon: '💍', sells: 'goods', comp: 'goods', q: [],
        supplies: () => [sup('Gold / silver jewellery', '7113', 3, true), sup('Making charges on customer’s gold (job work)', '998892', 5, true)],
        rules: () => [['Industry', 'info', 'Cash and KYC', 'Cash sales of ₹2 lakh or more need the buyer’s PAN; cash receipts of ₹2 lakh or more in one transaction are prohibited (old 269ST). Hallmarking (HUID) is compulsory.']]
    },
    rental: {
        name: 'Property rental', icon: '🏢', sells: 'services', comp: 'services', q: [],
        supplies: () => [sup('Commercial rent', '997212', 18, true), sup('Residential rent to individuals for living', '997211', 0, false, 'Exempt.', { exempt: true })],
        rules: () => [['Industry', 'info', 'Residential to a business', 'Residential property rented to a GST-registered business: the tenant pays 18% under reverse charge.']]
    },
    other: { name: 'Other business', icon: '🧾', sells: 'both', comp: 'goods', q: ['b2bShare'], supplies: () => [], rules: () => [] }
};

// What we ask about the business; each question appears only for the industries that need it
const BIZ_Q = {
    maxTariff: ['Highest room rate charged per night (₹)', 'number'],
    hasRestaurant: ['Restaurant or food service in the hotel', 'bool'],
    hallHire: ['Rent out halls / meeting rooms (no food)', 'bool'],
    specifiedOpt: ['Opted to be "specified premises" (restaurant at 18% with credit)', 'bool'],
    aggregator: ['Sell through Swiggy / Zomato', 'bool'],
    inSpecified: ['Restaurant is inside a hotel that charges above ₹7,500 a room', 'bool'],
    excludedGoods: ['Make ice cream, pan masala, tobacco or aerated water', 'bool'],
    advocate: ['Advocate / legal services', 'bool'],
    pharmacy: ['Has a pharmacy', 'bool'],
    roomsAbove5000: ['Hospital rooms above ₹5,000 a day (non-ICU)', 'bool'],
    coaching: ['Also run coaching / non-recognised courses', 'bool'],
    gtaOption: ['GST on goods transport', 'select', [['rcm', 'Customer pays (reverse charge)'], ['fwd5', 'We pay 5% (no credit)'], ['fwd18', 'We pay 18% (with credit)']]],
    vehicles: ['Number of goods vehicles owned', 'number'],
    b2bShare: ['Sales to GST-registered businesses (%)', 'number'],
    investment: ['Investment in plant & machinery / equipment (₹)', 'number'],
    exports: ['Export services / goods', 'bool']
};
const SPECIAL_GOODS_20L = ['12', '14', '17', '15', '13', '34', '11', '36', '16', '05'];   // states that kept ₹20 lakh for goods
const SPECIAL_SVC_10L = ['14', '15', '13', '16'];
const COMP_75L = ['12', '14', '17', '15', '13', '11', '16', '02'];
const nz = x => Number(x) || 0;
const lakh = x => x >= 10000000 ? `₹${+(x / 10000000).toFixed(2)} crore` : `₹${+(x / 100000).toFixed(2)} lakh`;

function bizDefaults() {
    const p = co.profile, b = p.biz || {};
    return { industry: '', turnoverLast: p.aato || 0, turnoverExp: 0, interstate: false, ecommerce: false, exports: false, employees: (co.employees || []).filter(e => e.status !== 'Inactive').length, cashPct: 10, paidUp: 0, netWorth: 0, netProfit: 0, borrowings: 0, investment: 0, maxTariff: 3000, gtaOption: 'rcm', b2bShare: 50, scheme: p.gstType || 'regular', freq: p.gstFreq || 'monthly', ...b };
}

// ---------- the rules engine ----------
function businessRules(b, profile = co.profile) {
    const ind = INDUSTRIES[b.industry] || INDUSTRIES.other;
    const R = [], add = (area, level, title, text) => R.push({ area, level, title, text });
    const st = profile.state, ent = profile.entity || 'Proprietorship';
    const T = Math.max(nz(b.turnoverLast), nz(b.turnoverExp));
    const supplies = ind.supplies(b);
    const company = /Ltd/.test(ent), llp = ent === 'LLP', indiv = ['Proprietorship', 'HUF'].includes(ent);
    const services = ind.sells !== 'goods';

    // --- GST registration ---
    const limit = services ? (SPECIAL_SVC_10L.includes(st) ? 1000000 : 2000000) : (SPECIAL_GOODS_20L.includes(st) ? 2000000 : 4000000);
    const allExempt = supplies.length && supplies.every(s => s.exempt || s.rcmOut);
    const compulsory = [b.interstate && !services && 'inter-state sale of goods', b.ecommerce && 'selling through e-commerce'].filter(Boolean);
    if (allExempt) add('GST', 'info', 'GST registration may not be needed', 'All your supplies are exempt or taxed under reverse charge in the customer’s hands. Registration is needed only if you also make taxable supplies above the limit.');
    else if (compulsory.length) add('GST', 'must', 'GST registration compulsory', `Required whatever the turnover because of ${compulsory.join(' and ')}.`);
    else if (T > limit) add('GST', 'must', 'GST registration compulsory', `Turnover ${lakh(T)} is above the ${lakh(limit)} limit for ${services ? 'services' : 'goods'} in ${stateName(st)}.`);
    else add('GST', 'option', 'GST registration optional', `Turnover is within the ${lakh(limit)} limit. Registering voluntarily lets business customers claim credit and you claim credit on purchases${supplies.some(s => !s.itc) ? ' (not for your no-credit supplies)' : ''}.`);

    // --- composition ---
    const comp = compositionOf(b, profile);
    if (comp.eligible) add('GST', comp.recommended ? 'good' : 'option', `Composition scheme available (${comp.rate}% of turnover)`, `${comp.why} ${comp.recommended ? 'Recommended: most of your sales are to consumers, so a lower price without GST helps.' : 'Not recommended for you: business customers cannot claim credit on your bills and you lose credit on purchases.'} Opt in with CMP-02 before 31 March for the next year.`);
    else if (comp.reason) add('GST', 'info', 'Composition scheme not available', comp.reason);

    // --- returns ---
    if (b.scheme === 'composition' && comp.eligible) {
        add('GST', 'must', 'Returns: CMP-08 quarterly and GSTR-4 yearly', 'Pay tax on turnover with CMP-08 by the 18th after each quarter and file GSTR-4 by 30 June. Issue "Bill of supply" (no GST) and display "Composition taxable person" at the shop.');
    } else {
        add('GST', T <= 50000000 ? 'option' : 'must', T <= 50000000 ? 'Monthly or quarterly returns (QRMP)' : 'Monthly GSTR-1 and GSTR-3B', T <= 50000000 ? 'Turnover up to ₹5 crore may file GSTR-1 and GSTR-3B quarterly and pay tax monthly by PMT-06 (25th). Monthly filing suits you if business customers want their credit quickly.' : 'GSTR-1 by the 11th and GSTR-3B by the 20th.');
        add('GST', T > 20000000 ? 'must' : 'option', T > 20000000 ? 'GSTR-9 annual return' : 'GSTR-9 optional', T > 20000000 ? 'File GSTR-9 by 31 December.' : 'Turnover up to ₹2 crore: the annual return is optional.');
        if (T > 50000000) add('GST', 'must', 'GSTR-9C reconciliation', 'Turnover above ₹5 crore: self-certified reconciliation of books with returns along with GSTR-9.');
    }
    const pol = itcPolicyOf(b);
    if (nz(profile.aato) > 50000000 || nz(b.turnoverLast) > 50000000) add('GST', 'must', 'E-invoicing', `Generate an IRN for every B2B invoice and credit note${nz(b.turnoverLast) >= 100000000 ? ' within 30 days of the invoice date' : ''}. Invoices show 6-digit HSN.`);
    else add('GST', 'info', 'HSN on invoices', 'Turnover up to ₹5 crore: 4-digit HSN / SAC on B2B invoices.');
    if (pol === 'mixed') add('GST', 'must', 'Common credit reversal every month', 'Rule 42: credit on common purchases × (no-credit and exempt turnover ÷ total turnover) is reversed in GSTR-3B 4(B)(1). The ERP calculates and posts it with the set-off journal.');

    // --- income tax ---
    const presumptiveOk = indiv || ent === 'Partnership';
    const lowCash = nz(b.cashPct) <= 5;
    if (ind.presumptive === 'profession') {
        const lim = lowCash ? 7500000 : 5000000;
        if (presumptiveOk && T <= lim) add('Income tax', 'option', 'Presumptive tax for professionals (old 44ADA)', `Receipts up to ${lakh(lim)}: declare 50% of receipts as profit, no books or audit needed; advance tax in one instalment by 15 March.`);
        add('Income tax', T > 5000000 ? 'must' : 'info', T > 5000000 ? 'Tax audit' : 'Tax audit not needed', T > 5000000 ? 'Professional receipts above ₹50 lakh: accounts must be audited by a CA before 30 September.' : 'Receipts up to ₹50 lakh (unless you declare less than the presumptive profit).');
    } else {
        if (ind.presumptive === 'transport' && presumptiveOk && nz(b.vehicles) && nz(b.vehicles) <= 10) add('Income tax', 'option', 'Presumptive tax for transporters (old 44AE)', `Up to 10 goods vehicles: profit taken as ₹7,500 a vehicle a month (heavy vehicles ₹1,000 a tonne a month) — about ${inr0(nz(b.vehicles) * 7500 * 12)} a year for ${nz(b.vehicles)}.`);
        const lim = lowCash ? 30000000 : 20000000;
        if (presumptiveOk && T <= lim) add('Income tax', 'option', 'Presumptive tax for business (old 44AD)', `Turnover up to ${lakh(lim)}${lowCash ? ' (cash receipts within 5%)' : ''}: declare 8% of turnover (6% of digital receipts) as profit; no audit; advance tax in one instalment by 15 March. Not for LLPs or companies.`);
        const auditLim = lowCash ? 100000000 : 10000000;
        add('Income tax', T > auditLim ? 'must' : 'info', T > auditLim ? 'Tax audit' : 'Tax audit not needed', T > auditLim ? `Turnover ${lakh(T)} is above ${lakh(auditLim)}${lowCash ? '' : ' (₹10 crore applies only if cash receipts and payments are each within 5%)'}: accounts audited by a CA before 30 September.` : `Turnover is within ${lakh(auditLim)}${company ? ' (companies still have the statutory audit)' : ''}.`);
    }
    if (company) add('Income tax', 'option', 'Company tax rate', 'Domestic company: 25% (turnover up to ₹400 crore) or 22% under the concessional regime (old 115BAA) without most deductions and without MAT.');
    if (company || llp || ent === 'Partnership' || ent === 'Trust / Society' || nz(b.turnoverLast) > (ind.presumptive === 'profession' ? 5000000 : 10000000)) add('Income tax', 'must', 'Deduct TDS on payments', 'Rent, contractors, professionals, commission and salaries: deduct TDS, deposit by the 7th and file quarterly returns. Get a TAN.');
    else add('Income tax', 'info', 'TDS on business payments not needed', 'Individuals / HUFs with last year’s turnover up to ₹1 crore (professions ₹50 lakh) need not deduct TDS on business payments (salary TDS still applies above the exemption).');
    add('Income tax', 'must', 'Pay small suppliers on time (old 43B(h))', 'Amounts due to micro and small enterprises must be paid within 45 days (15 days without an agreement); otherwise the expense is allowed only in the year paid. The ERP flags MSME vendors past due.');

    // --- company / LLP law ---
    if (company) {
        const small = ent === 'Private Ltd' && nz(b.paidUp) <= 40000000 && T <= 400000000;
        add('Company law', 'info', small ? 'Small company' : 'Not a small company', small ? 'Paid-up capital up to ₹4 crore and turnover up to ₹40 crore: a cash flow statement is not mandatory, CARO 2020 does not apply, two board meetings a year are enough and the short annual return MGT-7A is filed.' : 'Prepare a cash flow statement and follow full board and filing requirements.');
        const caroFree = small || (ent === 'Private Ltd' && nz(b.paidUp) + nz(b.netWorth) <= 10000000 && nz(b.borrowings) <= 10000000 && T <= 100000000);
        if (!small) add('Company law', caroFree ? 'info' : 'must', caroFree ? 'CARO 2020 not applicable' : 'CARO 2020 report', caroFree ? 'Private company with capital + reserves and borrowings each within ₹1 crore and revenue within ₹10 crore.' : 'The auditor reports on fixed assets, inventory, loans, statutory dues and more; keep registers ready.');
        add('Company law', 'info', nz(b.netWorth) >= 2500000000 ? 'Ind AS applies' : 'Accounting Standards (Division I)', nz(b.netWorth) >= 2500000000 ? 'Net worth of ₹250 crore or more: prepare Ind AS financial statements.' : 'Schedule III Division I and the Accounting Standards — the format this ERP uses.');
        if (nz(b.netWorth) >= 5000000000 || T >= 10000000000 || nz(b.netProfit) >= 50000000) add('Company law', 'must', 'CSR', 'Spend 2% of the average net profit of the last three years on CSR and report it in the board report.');
        add('Company law', 'must', 'Annual filings', 'Statutory audit, AGM by 30 September, AOC-4 within 30 days and MGT-7/7A within 60 days of the AGM, DIR-3 KYC, and MSME-1 twice a year if dues to small suppliers are older than 45 days.');
    } else if (llp) add('Company law', T > 4000000 ? 'must' : 'info', T > 4000000 ? 'LLP audit and filings' : 'LLP filings', `${T > 4000000 ? 'Turnover above ₹40 lakh: accounts must be audited. ' : ''}Form 11 by 30 May, Form 8 by 30 October.`);
    else add('Company law', 'info', 'Books of account', 'Keep books of account and bills for 8 years (GST: 72 months from the annual return due date).');

    // --- labour (Tamil Nadu values where state-specific) ---
    const n = nz(b.employees);
    add('Labour', n >= 20 ? 'must' : 'info', n >= 20 ? 'Provident Fund (EPF) compulsory' : 'Provident Fund', n >= 20 ? '20 or more employees: 12% of basic (up to ₹15,000) from employee and employer, ECR by the 15th.' : `Compulsory from 20 employees (you have ${n}); voluntary coverage is allowed.`);
    add('Labour', n >= 10 ? 'must' : 'info', n >= 10 ? 'ESI compulsory' : 'ESI', n >= 10 ? '10 or more employees: 0.75% employee + 3.25% employer on wages up to ₹21,000, paid by the 15th.' : 'Applies from 10 employees.');
    if (n >= 10) add('Labour', 'must', 'Gratuity', 'Payable on leaving after 5 years of service (fixed-term staff after 1 year under the Code on Social Security): 15 days’ wages for each year. Provide for it in the accounts.');
    if (n >= 20) add('Labour', 'must', 'Bonus', 'Employees earning up to ₹21,000 a month: bonus of 8.33% to 20% of wages each year.');
    if (n) add('Labour', 'info', 'Labour codes', 'The four labour codes apply: "wages" must be at least 50% of pay for PF, gratuity and bonus, appointment letters are compulsory and wages are paid by the 7th.');
    if (st === '33' && n) add('Labour', 'must', 'Tamil Nadu professional tax and welfare fund', 'Professional tax deducted half-yearly (September and March); Labour Welfare Fund ₹20 employee + ₹40 employer by 31 January.');

    // --- MSME ---
    const inv = nz(b.investment);
    const cls = inv <= 25000000 && T <= 100000000 ? 'Micro' : inv <= 250000000 && T <= 1000000000 ? 'Small' : inv <= 1250000000 && T <= 5000000000 ? 'Medium' : '';
    if (cls) add('MSME', 'good', `${cls} enterprise — register on Udyam`, `By investment (${lakh(inv)}) and turnover (${lakh(T)}). Free Udyam registration gives payment protection: ${cls === 'Medium' ? 'priority lending and scheme benefits' : 'your buyers must pay within 45 days or pay interest at three times the bank rate'}.`);

    (ind.rules(b) || []).forEach(r => add(...r));
    return R;
}
function compositionOf(b, profile = co.profile) {
    const ind = INDUSTRIES[b.industry] || INDUSTRIES.other;
    const T = Math.max(nz(b.turnoverLast), nz(b.turnoverExp));
    const kind = ind.comp;
    if (!kind) return { eligible: false, reason: 'Exempt or mixed health-care supplies: composition is not useful.' };
    if (b.interstate || b.exports) return { eligible: false, reason: 'Composition dealers cannot sell outside the state or export.' };
    if (b.excludedGoods) return { eligible: false, reason: 'Manufacturers of ice cream, pan masala, tobacco and aerated water cannot opt for composition.' };
    if (kind === 'services') {
        if (T > 5000000) return { eligible: false, reason: `Service providers can opt only up to ₹50 lakh turnover (you: ${lakh(T)}).` };
        return { eligible: true, rate: 6, kind, why: 'Service providers up to ₹50 lakh can pay 6% of turnover (section 10(2A)) instead of charging GST.', recommended: false };
    }
    const lim = COMP_75L.includes(profile.state) ? 7500000 : 15000000;
    if (T > lim) return { eligible: false, reason: `Turnover ${lakh(T)} is above the ${lakh(lim)} limit.` };
    const rate = kind === 'restaurant' ? 5 : 1;
    return { eligible: true, rate, kind, why: `${kind === 'restaurant' ? 'Restaurants' : b.industry === 'manufacturer' ? 'Manufacturers' : 'Traders'} up to ${lakh(lim)} can pay ${rate}% of turnover.`, recommended: kind === 'goods' && nz(b.b2bShare) < 30 };
}
// 'full' (claim credit), 'none' (no supply allows credit), 'mixed' (Rule 42 reversal)
function itcPolicyOf(b) {
    if (b.scheme === 'composition' && compositionOf(b).eligible) return 'none';
    const S = (INDUSTRIES[b.industry] || INDUSTRIES.other).supplies(b).filter(s => !s.rcmOut);
    if (!S.length) return 'full';
    const yes = S.some(s => s.itc && !s.exempt), no = S.some(s => !s.itc || s.exempt);
    return yes && no ? 'mixed' : no ? 'none' : 'full';
}
const bizPolicy = () => co?.profile?.itcPolicy || 'full';

// ---------- applying the profile to the books ----------
function applyBusinessProfile(b, opts = {}) {
    assertEdit();
    if (!INDUSTRIES[b.industry]) throw new Error('Choose what your business does.');
    const p = co.profile, before = `${p.biz?.industry || '—'} · ${p.gstType || 'regular'} · ${p.itcPolicy || 'full'}`;
    const comp = compositionOf(b);
    const scheme = b.scheme === 'composition' && comp.eligible ? 'composition' : 'regular';
    const from = opts.from || todayISO();
    p.biz = { ...b, scheme, appliedOn: todayISO() };
    if (nz(b.turnoverLast)) p.aato = nz(b.turnoverLast);
    p.gstType = scheme;
    p.compRate = scheme === 'composition' ? comp.rate : 0;
    p.gstFreq = scheme === 'composition' ? 'quarterly' : (b.freq || p.gstFreq || 'monthly');
    p.itcPolicy = itcPolicyOf({ ...b, scheme });
    p.itcPolicyFrom = from;
    const added = [];
    if (opts.items !== false) (INDUSTRIES[b.industry].supplies(b)).filter(s => !s.ref).forEach(s => {
        if (co.items.some(i => i.bizSupply === s.name || i.name.toLowerCase() === s.name.toLowerCase())) return;
        saveItem({ name: s.name, type: s.type, hsn: s.hsn, gstRate: s.rate, unit: s.type === 'service' ? 'OTH' : 'NOS', rate: 0, purchaseRate: 0, trackStock: false, openQty: 0, openValue: 0, noItc: !s.itc, exempt: Boolean(s.exempt), eco95: Boolean(s.eco95), rcmOut: Boolean(s.rcmOut), bizSupply: s.name });
        added.push(s.name);
    });
    audit('Business profile applied', { entity: 'Company', ref: p.name, before, after: `${INDUSTRIES[b.industry].name} · ${scheme}${scheme === 'composition' ? ` ${p.compRate}%` : ''} · input credit ${p.itcPolicy} from ${fmtDate(from)}${added.length ? ` · ${added.length} rate item(s) added` : ''}` });
    ver++;
    saveCo();
    return { scheme, policy: p.itcPolicy, added };
}

// ---------- composition: CMP-08 (quarterly) and GSTR-4 (yearly) ----------
function cmp08(fy, q) {
    const months = QUARTERS[q].map(m => `${m >= 4 ? fy : fy + 1}-${String(m).padStart(2, '0')}`);
    const V = co.vouchers.filter(v => v.status !== 'cancelled' && months.includes(ymOf(v.date)));
    const exemptTaxable = v => sum((v.lines || []).filter(l => itemById(l.itemId)?.exempt), 'taxable');
    const turnover = r2(sum(V.filter(v => v.type === 'SI'), v => v.totals.taxable - exemptTaxable(v)) - sum(V.filter(v => v.type === 'CN'), v => v.totals.taxable - exemptTaxable(v)));
    const rate = nz(co.profile.compRate) || 1;
    const tax = Math.round(turnover * rate / 100);
    const rcm = r2(sum(V.filter(v => v.type === 'PB' && v.rcm), v => v.totals.tax));
    const last = months[2], due = `${addMonths(last, 1)}-18`;
    const posted = co.vouchers.find(v => v.ext === `cmp08:${fy}:${q}` && v.status !== 'cancelled');
    return { fy, q, months, turnover, rate, tax, cgst: r2(tax / 2), sgst: r2(tax - r2(tax / 2)), rcm, due, posted, exempt: r2(sum(V.filter(v => v.type === 'SI'), exemptTaxable)) };
}
function postCompositionTax(fy, q) {
    const c = cmp08(fy, q);
    if (c.posted) throw new Error(`Composition tax for ${q} is already posted (${c.posted.no}).`);
    if (!c.tax) throw new Error('No turnover in this quarter.');
    return saveVoucher({ type: 'JV', date: lastDay(c.months[2]), ext: `cmp08:${fy}:${q}`, jlines: [{ acc: sysId('compTax'), dr: c.tax, cr: 0 }, { acc: sysId('compPay'), dr: 0, cr: c.tax }], narration: `Composition tax ${c.rate}% on turnover ${inr(c.turnover)} for ${q} FY ${fyLabel(fy)} (CMP-08)` }, { source: 'CMP-08' });
}
function gstr4(fy) {
    const Q = Object.keys(QUARTERS).map(q => cmp08(fy, q));
    const V = co.vouchers.filter(v => v.status !== 'cancelled' && fyOf(v.date) === fy && v.type === 'PB');
    const inward = (f) => V.filter(f).reduce((a, v) => ({ txval: a.txval + v.totals.taxable, tax: a.tax + v.totals.tax }), { txval: 0, tax: 0 });
    return { quarters: Q, turnover: r2(sum(Q, 'turnover')), tax: r2(sum(Q, 'tax')), rcm: r2(sum(Q, 'rcm')), fromReg: inward(v => !v.rcm && isRegistered(contactById(v.partyId))), fromUnreg: inward(v => !isRegistered(contactById(v.partyId)) && !v.rcm), rcmIn: inward(v => v.rcm), due: `${fy + 1}-06-30` };
}
function compositionHtml() {
    const fy = state.fy, g = gstr4(fy);
    const rows = g.quarters.map(c => `<tr><td>${c.q}</td><td>${c.months.map(m => ymLabel(m).slice(0, 3)).join(' – ')}</td>${amtCell(c.turnover)}<td class="n">${c.rate}%</td>${amtCell(c.tax)}${amtCell(c.rcm)}<td>${fmtDate(c.due)}</td><td>${c.posted ? `<a href="#/v/${c.posted.id}" class="badge good">Posted ${esc(c.posted.no)}</a>` : c.tax && c.months[2] < ymOf(todayISO()) && canEdit() ? `<button class="btn btn-p btn-sm" onclick="try{postCompositionTax(${fy},'${c.q}');toast('Composition tax posted.');route()}catch(e){alert(e.message)}">Post tax</button>` : '—'}</td></tr>`).join('');
    return `<div class="card"><h2>CMP-08 · composition tax by quarter</h2><p class="note" style="margin-bottom:10px">You pay ${nz(co.profile.compRate)}% of turnover (exempt supplies excluded) from your own pocket — customers are not charged GST — plus any reverse-charge tax. Post the tax, pay it by the 18th with the CMP-08 challan, then mark it filed in Due dates.</p>
        <div class="tbl"><table class="t"><thead><tr><th>Quarter</th><th>Months</th><th class="n">Turnover</th><th class="n">Rate</th><th class="n">Tax</th><th class="n">Reverse charge</th><th>Due</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>
        <div class="card"><h2>GSTR-4 · FY ${fyLabel(fy)} (due ${fmtDate(g.due)})</h2><table class="t"><tbody>
        <tr><td>Outward supplies (turnover)</td>${amtCell(g.turnover)}</tr><tr><td>Composition tax paid through CMP-08</td>${amtCell(g.tax)}</tr>
        <tr><td>Inward supplies from registered suppliers (table 4A)</td>${amtCell(g.fromReg.txval)}</tr><tr><td>Inward supplies from unregistered suppliers</td>${amtCell(g.fromUnreg.txval)}</tr>
        <tr><td>Inward supplies under reverse charge (table 4B/4C) — tax</td>${amtCell(g.rcmIn.tax)}</tr></tbody></table></div>`;
}

// ---------- screen ----------
let bizDraft = null;
function viewBusiness() {
    bizDraft ||= bizDefaults();
    const b = bizDraft, p = co.profile;
    const cards = Object.entries(INDUSTRIES).map(([k, x]) => `<button type="button" class="ind ${b.industry === k ? 'on' : ''}" onclick="bizSet('industry','${k}')"><span>${x.icon}</span>${esc(x.name)}</button>`).join('');
    $('#view').innerHTML = pageHead('Business profile', 'Tell the ERP what your business does and how big it is. It works out the GST rates, input credit, returns, income-tax, company-law and labour rules that apply, and sets up your books for them.')
        + (p.biz ? `<div class="card" style="border-left:4px solid var(--good)"><b>Applied on ${fmtDate(p.biz.appliedOn)}:</b> ${esc(INDUSTRIES[p.biz.industry]?.name || '')} · ${p.gstType === 'composition' ? `composition ${p.compRate}%` : 'regular GST'} · input credit: ${{ full: 'claimed', none: 'not claimed (no-credit supplies)', mixed: 'claimed with Rule 42 reversal' }[p.itcPolicy || 'full']}. Change anything below and apply again.</div>` : '')
        + `<div class="card"><h2>1. What does the business do?</h2><div class="inds">${cards}</div></div>
        <div class="card" id="bizQ"></div><div id="bizOut"></div>`;
    drawBizQ(); drawBizOut();
}
function bizSet(k, v) { bizDraft[k] = v; if (k === 'industry') { viewBusiness(); return; } drawBizOut(); }
function drawBizQ() {
    const b = bizDraft, ind = INDUSTRIES[b.industry];
    if (!ind) { $('#bizQ').innerHTML = '<p class="note">Choose the nearest match above to continue.</p>'; return; }
    const company = /Ltd/.test(co.profile.entity);
    const field = (k, label, type, extra) => {
        if (type === 'bool') return `<label class="chk"><input type="checkbox" ${b[k] ? 'checked' : ''} onchange="bizSet('${k}',this.checked)"> ${label}</label>`;
        if (type === 'select') return `<label class="f">${label}<select onchange="bizSet('${k}',this.value)">${extra.map(([v, l]) => opt(v, l, b[k])).join('')}</select></label>`;
        return `<label class="f">${label}<input type="number" min="0" value="${esc(b[k] ?? '')}" oninput="bizSet('${k}',this.value)"></label>`;
    };
    const specific = ind.q.map(k => field(k, ...BIZ_Q[k]));
    $('#bizQ').innerHTML = `<h2>2. Size and how you sell</h2><p class="note" style="margin-bottom:10px">${esc(co.profile.entity)} in ${esc(stateName(co.profile.state))} (change in Company details). Rough figures are fine.</p>
        <div class="fg">${field('turnoverLast', 'Turnover last year (₹)')}${field('turnoverExp', 'Expected turnover this year (₹)')}${field('employees', 'Number of employees')}${field('cashPct', 'Cash receipts (% of sales)')}
        ${company ? field('paidUp', 'Paid-up share capital (₹)') + field('netWorth', 'Net worth (₹)') + field('borrowings', 'Borrowings (₹)') + field('netProfit', 'Net profit last year (₹)') : ''}
        ${ind.q.includes('investment') ? '' : field('investment', 'Investment in plant, machinery / equipment (₹)')}
        ${specific.filter(h => !h.includes('class="chk"')).join('')}</div>
        <div class="grid g2" style="margin-top:10px">${field('interstate', 'Sell to customers in other states', 'bool')}${field('ecommerce', 'Sell through Amazon / Flipkart / other marketplaces', 'bool')}${ind.q.includes('exports') ? '' : field('exports', 'Export or supply to SEZ', 'bool')}${specific.filter(h => h.includes('class="chk"')).join('')}</div>`;
}
function drawBizOut() {
    const b = bizDraft, ind = INDUSTRIES[b.industry];
    if (!ind) { $('#bizOut').innerHTML = ''; return; }
    const S = ind.supplies(b), R = businessRules(b), comp = compositionOf(b), pol = itcPolicyOf(b);
    const AREAS = ['GST', 'Industry', 'Income tax', 'Company law', 'Labour', 'MSME'];
    const badge = { must: '<span class="badge bad">Must</span>', option: '<span class="badge warn">Option</span>', good: '<span class="badge good">Benefit</span>', info: '<span class="badge">Info</span>' };
    const rates = S.length ? `<div class="tbl"><table class="t"><thead><tr><th>Supply</th><th>HSN / SAC</th><th class="n">GST</th><th>Input credit</th><th>Note</th></tr></thead><tbody>${S.map(s => `<tr><td><b>${esc(s.name)}</b></td><td>${s.hsn}</td><td class="n">${s.exempt ? 'Exempt' : s.rate + '%'}</td><td>${s.exempt ? '—' : s.itc ? '<span class="badge good">Yes</span>' : '<span class="badge bad">No</span>'}</td><td style="white-space:normal;min-width:220px" class="note">${esc(s.note)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">Rates depend on each item’s HSN — set them on your items.</p>';
    $('#bizOut').innerHTML = `<div class="card"><h2>3. Your GST rates</h2>${rates}
        <p class="note" style="margin-top:8px">Input credit on purchases: <b>${{ full: 'claimed in full', none: 'not claimed — every purchase is booked with GST as cost', mixed: 'claimed, with common credit reversed under Rule 42 each month' }[pol]}</b>.</p></div>
        <div class="card"><h2>4. Rules that apply to you</h2>${AREAS.map(a => { const L = R.filter(r => r.area === a); return L.length ? `<h4 style="margin:12px 0 6px">${a}</h4><ul class="rules">${L.map(r => `<li>${badge[r.level]} <b>${esc(r.title)}</b><div class="note">${esc(r.text)}</div></li>`).join('')}</ul>` : ''; }).join('')}</div>
        <div class="card"><h2>5. Apply to my books</h2><div class="fg">
            <label class="f">GST scheme<select onchange="bizDraft.scheme=this.value;drawBizOut()">${opt('regular', 'Regular (charge GST, claim credit)', b.scheme)}${comp.eligible ? opt('composition', `Composition — ${comp.rate}% of turnover${comp.recommended ? ' (recommended)' : ''}`, b.scheme) : ''}</select></label>
            ${b.scheme !== 'composition' ? `<label class="f">Return filing<select onchange="bizDraft.freq=this.value">${opt('monthly', 'Monthly', b.freq)}${Math.max(nz(b.turnoverLast), nz(b.turnoverExp)) <= 50000000 ? opt('quarterly', 'Quarterly (QRMP)', b.freq) : ''}</select></label>` : ''}
            <label class="f">Apply from<input type="date" id="biz_from" value="${co.profile.itcPolicyFrom || todayISO()}"></label></div>
            <label class="chk" style="margin-top:10px"><input type="checkbox" id="biz_items" checked> Add the rates above as items (ready to pick on invoices)</label>
            <p class="note" style="margin-top:8px">Earlier entries are not changed. A change of scheme normally takes effect from 1 April (composition opt-in by 31 March).</p>
            ${canEdit() ? `<div class="row" style="margin-top:12px"><button class="btn btn-p" onclick="doApplyBiz()">Apply to my books</button></div>` : ''}</div>`;
}
function doApplyBiz() {
    try {
        const r = applyBusinessProfile(bizDraft, { items: $('#biz_items').checked, from: $('#biz_from').value || todayISO() });
        bizDraft = null;
        toast(`Applied: ${r.scheme === 'composition' ? 'composition scheme' : 'regular GST'}, input credit ${r.policy}${r.added.length ? `, ${r.added.length} rate item(s) added` : ''}.`);
        route();
    } catch (e) { alert(e.message); }
}
