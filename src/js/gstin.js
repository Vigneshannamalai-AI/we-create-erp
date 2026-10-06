'use strict';
// ===================== We Create ERP · reading a GSTIN =====================
// A GSTIN carries the state (digits 1–2), the full PAN (3–12), the registration number under that PAN in the state
// (13) and a check digit (15). The PAN's 4th letter tells the kind of taxpayer. That much is decoded here, offline.
// Name, address, constitution and "nature of business activities" live on the GST portal: they need a GST lookup
// service (a GSP / GST API provider) set in Settings → GST & TDS. Without one, the nature of business is suggested
// from the business name.

const PAN_HOLDER = {
    P: ['Individual', 'Proprietorship'], C: ['Company', 'Private Ltd'], F: ['Firm / LLP', 'Partnership'], H: ['Hindu Undivided Family', 'HUF'],
    A: ['Association of Persons', 'Trust / Society'], T: ['Trust', 'Trust / Society'], B: ['Body of Individuals', 'Trust / Society'],
    L: ['Local authority', 'Trust / Society'], J: ['Artificial juridical person', 'Trust / Society'], G: ['Government', 'Trust / Society']
};
const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

function decodeGstin(g) {
    g = String(g || '').toUpperCase().trim();
    if (!gstinValid(g)) return null;
    const pan = g.slice(2, 12), h = PAN_HOLDER[pan[3]] || ['Other', ''];
    const n = /\d/.test(g[12]) ? Number(g[12]) : g.charCodeAt(12) - 55;   // 1–9, then A = 10 …
    return { gstin: g, state: g.slice(0, 2), stateName: STATES[g.slice(0, 2)], pan, holder: h[0], entity: h[1], regNo: n, text: `${STATES[g.slice(0, 2)]} · PAN ${pan} · ${h[0]} · ${ordinal(n)} registration under this PAN in the state` };
}

// ---------- lookup service (optional) ----------
const gstLookupCfg = () => meta.gstLookup || {};
const gstLookupReady = () => /\{gstin\}/.test(gstLookupCfg().url || '');
// Accepts the GSTN "search taxpayer" record as returned by GSP / API providers, at the root or wrapped in
// taxpayerInfo / data / result.
function parseGstRecord(j) {
    const find = o => { if (!o || typeof o !== 'object') return null; if (o.lgnm || o.tradeNam) return o; for (const k of ['taxpayerInfo', 'data', 'result', 'response']) { const r = find(o[k]); if (r) return r; } return null; };
    const r = find(j);
    if (!r) return null;
    const a = r.pradr?.addr || {};
    const street = [a.flno, a.bno, a.bnm, a.st, a.loc].filter(Boolean).join(', ');
    const CTB = { 'Proprietorship': 'Proprietorship', 'Partnership': 'Partnership', 'Limited Liability Partnership': 'LLP', 'Private Limited Company': 'Private Ltd', 'Public Limited Company': 'Public Ltd', 'Hindu Undivided Family': 'HUF', 'Society/ Club/ Trust/ AOP': 'Trust / Society' };
    const nba = Array.isArray(r.nba) ? r.nba : r.nba ? [r.nba] : [];
    return {
        legalName: r.lgnm || '', tradeName: r.tradeNam || r.lgnm || '', status: r.sts || '', since: r.rgdt || '', type: r.dty || '', constitution: r.ctb || '',
        entity: CTB[r.ctb] || '', nba, address: street || r.pradr?.adr || '', city: a.dst || a.city || a.loc || '', pincode: a.pncd || '', state: a.stcd || ''
    };
}
async function fetchGstin(g) {
    const c = gstLookupCfg();
    if (!gstLookupReady()) throw new Error('No GST lookup service is set up. Add one in Settings → GST & TDS.');
    const headers = {};
    if (c.header && c.key) headers[c.header] = c.key;
    const res = await fetch(c.url.replace('{gstin}', encodeURIComponent(g)).replace('{key}', encodeURIComponent(c.key || '')), { headers });
    if (!res.ok) throw new Error(`The lookup service answered ${res.status}.`);
    const rec = parseGstRecord(await res.json());
    if (!rec) throw new Error('The lookup service did not return taxpayer details for this GSTIN.');
    return rec;
}

// ---------- nature of business: from the GST record's business activities, or the name ----------
const NAME_HINTS = [
    ['hotel', /\b(hotels?|lodge|residency|inn|resorts?|homestay|guest ?house|suites|stay)\b/i],
    ['restaurant', /\b(restaurant|cafe|café|bakery|bakes|sweets?|foods?|kitchen|biryani|mess|caterers?|catering|dhaba|bhavan|juice)\b/i],
    ['healthcare', /\b(hospitals?|clinic|medical|pharma|pharmacy|medicals|diagnostics?|labs?|healthcare|dental|nursing|scans?)\b/i],
    ['education', /\b(school|academy|college|educational|institute|tuition|coaching|vidyalaya|matriculation)\b/i],
    ['transport', /\b(transports?|logistics|cargo|roadways|carriers|movers|freight|couriers?)\b/i],
    ['tour', /\b(tours|travels|holidays|tourism)\b/i],
    ['construction', /\b(builders?|constructions?|developers|infra|infrastructure|realty|estates?|promoters)\b/i],
    ['wellness', /\b(salon|spa|fitness|gym|beauty|parlou?r|yoga|wellness)\b/i],
    ['textiles', /\b(textiles?|garments?|fashions?|silks?|apparels?|readymades?|footwear|tailors?|boutique)\b/i],
    ['jewellery', /\b(jewell?ers?|jewell?ery|gold|thanga|maaligai|diamonds?)\b/i],
    ['professional', /\b(consultants?|consultancy|advocates?|associates|chartered|solutions|technologies|infotech|software|systems|services llp|architects?|legal|& co\.?)\b/i],
    ['manufacturer', /\b(industries|manufactur\w*|mills?|factory|udyog|polymers?|plastics?|pack|packaging|engineering works|fabricators?|steels?)\b/i],
    ['ecommerce', /\b(online|e-?commerce|ecom)\b/i],
    ['rental', /\b(properties|leasing|rentals?)\b/i],
    ['trader', /\b(traders?|trading|stores?|agencies|enterprises|distributors?|suppliers?|marts?|super ?market|wholesale|electricals|hardwares?|provisions|depot|emporium)\b/i]
];
function guessIndustry({ name = '', nba = [], type = '' } = {}) {
    const acts = nba.join(' | ');
    const byName = NAME_HINTS.find(([, re]) => re.test(name))?.[0];
    let id = byName || '', why = byName ? `the name "${name}"` : '';
    // The GST record's business activities settle goods vs services when the name does not
    if (/Factory|Manufactur/i.test(acts) && (!id || ['trader', 'other'].includes(id))) { id = 'manufacturer'; why = 'the GST registration (factory / manufacturing)'; }
    else if (/Wholesale|Retail/i.test(acts) && !id) { id = 'trader'; why = 'the GST registration (wholesale / retail business)'; }
    else if (/Leasing/i.test(acts) && !id) { id = 'rental'; why = 'the GST registration (leasing business)'; }
    else if (/Supplier of Services/i.test(acts) && !id) { id = 'professional'; why = 'the GST registration (supplier of services)'; }
    if (!id) return null;
    return { industry: id, why, composition: /Composition/i.test(type) };
}
// What a GSTIN tells us, as a short line for forms
function gstinHintHtml(g, name = '') {
    if (!g) return '';
    const d = decodeGstin(g);
    if (!d) return '<span style="color:var(--bad)">Not a valid GSTIN yet</span>';
    const gi = guessIndustry({ name });
    return `✓ ${esc(d.text)}${gi ? ` · looks like <b>${esc(INDUSTRIES[gi.industry].name)}</b>` : ''}`;
}

// ---------- settings card ----------
function gstLookupSettingsHtml() {
    const c = gstLookupCfg();
    return `<div class="card"><h2>GSTIN lookup service</h2>
        <p class="note" style="margin-bottom:10px">Every GSTIN is decoded here without internet: state, PAN, type of taxpayer and registration number. The legal and trade name, address, constitution and nature of business are held by GSTN; the public search on gst.gov.in needs a captcha, so fetching them automatically needs a GST data service (a GSP or GST API provider) and its key. Enter its address with <code>{gstin}</code> where the number goes (and <code>{key}</code> if the key goes in the address).</p>
        <div class="fg"><label class="f">Service address<input id="gl_url" value="${esc(c.url || '')}" placeholder="https://provider.example/search?gstin={gstin}&key={key}"></label>
        <label class="f">Key goes in header <span class="hint">leave blank if in the address</span><input id="gl_header" value="${esc(c.header || '')}" placeholder="e.g. x-api-key"></label>
        <label class="f">API key<input id="gl_key" type="password" value="${esc(c.key || '')}"></label></div>
        ${isAdmin() ? `<div class="row" style="margin-top:10px"><button class="btn btn-p btn-sm" onclick="saveGstLookup()">Save</button>${gstLookupReady() ? '<span class="badge good">Lookup on</span>' : '<span class="badge">Not set — names are suggested from the GSTIN and business name only</span>'}</div>` : ''}</div>`;
}
function saveGstLookup() {
    const url = $('#gl_url').value.trim();
    if (url && !/^https:\/\/.+\{gstin\}/.test(url)) return alert('The address must start with https:// and contain {gstin}.');
    meta.gstLookup = { url, header: $('#gl_header').value.trim(), key: $('#gl_key').value.trim() };
    auditMeta('GSTIN lookup service changed', { entity: 'Settings', ref: url ? new URL(url.replace(/\{\w+\}/g, 'x')).host : 'removed' });
    saveMeta(); toast(url ? 'GSTIN lookup saved.' : 'GSTIN lookup removed.'); route();
}
// Fill a form from the GST record. map: { field: inputId }
async function fetchGstinInto(gInput, map, after) {
    const g = $(gInput).value.toUpperCase().trim();
    if (!gstinValid(g)) return alert('Enter a valid GSTIN first.');
    try {
        toast('Fetching from the GST lookup service…');
        const r = await fetchGstin(g);
        Object.entries(map).forEach(([k, id]) => { const el = $(id); if (el && r[k]) el.value = r[k]; });
        after?.(r);
        toast(`${r.tradeName || r.legalName}: ${r.status || 'details'} filled in.`);
    } catch (e) { alert(e.message); }
}
