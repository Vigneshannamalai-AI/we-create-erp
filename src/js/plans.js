'use strict';
// ===================== We Create ERP · plans, feature locks, billing =====================
// Prices are placeholders to be confirmed. What is never locked on any plan: entering vouchers, GST / TDS / TCS
// calculation, every report and financial statement, the audit trail, the user manual, backup and data export —
// a business must always be able to keep legal books and take its own data away.

const PLAN_ORDER = ['starter', 'standard', 'professional', 'enterprise'];
const PLANS = {
    starter: { name: 'Starter', price: { m: 0, y: 0 }, users: 1, companies: 1, scans: 10, blurb: 'Free for a small business keeping its own books.' },
    standard: { name: 'Standard', price: { m: 499, y: 4990 }, users: 3, companies: 1, scans: 100, blurb: 'GST filing, e-invoice and e-way bill, WhatsApp, imports.' },
    professional: { name: 'Professional', price: { m: 999, y: 9990 }, users: 10, companies: 5, scans: 500, blurb: 'Reconciliations, TDS / TCS returns, auditor access, several companies.' },
    enterprise: { name: 'Enterprise', price: { m: 2499, y: 24990 }, users: Infinity, companies: Infinity, scans: Infinity, blurb: 'For CA firms and groups: unlimited companies, users and scans.' }
};
const FEATURES = {
    gstFiling: { label: 'GSTR-1 JSON, GST set-off & payment, mark returns filed', plan: 'standard' },
    einvoice: { label: 'e-Invoice (IRN) and e-invoice JSON', plan: 'standard' },
    ewaybill: { label: 'e-Way bill', plan: 'standard' },
    whatsapp: { label: 'WhatsApp invoices and payment reminders', plan: 'standard' },
    import: { label: 'Import customers, vendors and items from Excel / CSV', plan: 'standard' },
    invoiceDesign: { label: 'Logo, signature and UPI payment QR on invoices', plan: 'standard' },
    recon2b: { label: 'GSTR-2B / IMS matching', plan: 'professional' },
    bankRecon: { label: 'Bank statement import and reconciliation', plan: 'professional' },
    taxReturns: { label: 'TDS / TCS quarterly returns (Forms 140, 143)', plan: 'professional' },
    auditor: { label: 'Auditor (read-only) user role', plan: 'professional' }
};
const ALWAYS = ['Sales, purchase, receipt, payment, journal and note entries', 'GST, TDS and TCS worked out on every entry', 'All reports: P&L, Balance Sheet, Cash Flow, ledgers, GST returns view', 'Audit trail, backup and full data export', 'User manual and due-date calendar'];
const rank = p => PLAN_ORDER.indexOf(p);

function subscription() {
    meta.sub ||= { plan: 'professional', trial: true, trialEnds: addDays(todayISO(), 14), history: [] };
    meta.sub.history ||= [];
    return meta.sub;
}
// The plan actually in force today (a lapsed trial or subscription drops to Starter; data stays)
function currentPlan() {
    const s = subscription();
    if (s.trial && todayISO() > s.trialEnds) return 'starter';
    if (!s.trial && s.plan !== 'starter' && s.renews && todayISO() > s.renews) return 'starter';
    return s.plan;
}
const planLimits = () => PLANS[currentPlan()];
const hasFeature = k => !FEATURES[k] || rank(currentPlan()) >= rank(FEATURES[k].plan);
const scansThisMonth = () => (meta.scans || {})[ymOf(todayISO())] || 0;
function planStatus() {
    const s = subscription(), p = currentPlan();
    if (s.trial && p !== 'starter') return `${PLANS[p].name} trial · ${daysBetween(todayISO(), s.trialEnds)} days left`;
    if (s.trial) return 'Trial ended · Starter';
    return `${PLANS[p].name}${s.renews && p !== 'starter' ? ` · renews ${fmtDate(s.renews)}` : ''}`;
}
// Returns true when allowed; otherwise explains which plan has it
function gate(k) {
    if (hasFeature(k)) return true;
    upgradePrompt(FEATURES[k].label, FEATURES[k].plan);
    return false;
}
function limitReached(kind) {
    const L = planLimits();
    if (kind === 'users') return meta.users.filter(u => u.active !== false).length >= L.users;
    if (kind === 'companies') return meta.companies.length >= L.companies;
    if (kind === 'scans') return scansThisMonth() >= L.scans;
    return false;
}
function upgradePrompt(what, plan) {
    const next = plan || PLAN_ORDER[Math.min(rank(currentPlan()) + 1, PLAN_ORDER.length - 1)];
    modal({
        title: 'Upgrade to unlock',
        body: `<p style="margin-bottom:10px"><b>${esc(what)}</b> is part of the <b>${PLANS[next].name}</b> plan. You are on <b>${esc(planStatus())}</b>.</p>
            <p class="note">Your data, entries and reports stay available on every plan.</p>`,
        foot: `<button class="btn btn-s" onclick="closeModal()">Not now</button><button class="btn btn-p" onclick="closeModal();go('#/billing')">See plans</button>`
    });
}
const lockedPage = (k) => `${pageHead(FEATURES[k].label, '')}<div class="empty"><div style="font-size:28px">🔒</div><b style="display:block;margin:6px 0">Available in the ${PLANS[FEATURES[k].plan].name} plan</b><p class="note" style="margin-bottom:12px">You are on ${esc(planStatus())}. Everything you have entered stays safe and visible.</p><a class="btn btn-p" href="#/billing">See plans</a></div>`;

// ---------- billing page ----------
let billCycle = 'y';
function viewBilling() {
    const s = subscription(), cur = currentPlan(), L = planLimits();
    const bar = (label, used, max) => { const pct = max === Infinity ? 5 : Math.min(100, used / max * 100); return `<div style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><span class="note">${label}</span><b style="font-size:13px">${used} / ${max === Infinity ? 'Unlimited' : max}</b></div><div class="progress" style="margin-top:4px"><i style="width:${pct}%;${pct >= 100 ? 'background:var(--bad)' : ''}"></i></div></div>`; };
    const price = p => PLANS[p].price[billCycle];
    $('#view').innerHTML = pageHead('Plan & billing', 'Choose the plan that fits. Upgrade or downgrade any time; your books are never locked away.',
        `<div class="mode"><button class="${billCycle === 'm' ? 'on' : ''}" onclick="billCycle='m';route()">Monthly</button><button class="${billCycle === 'y' ? 'on' : ''}" onclick="billCycle='y';route()">Yearly · 2 months free</button></div>`)
        + `<div class="grid g3" style="margin-bottom:16px"><div class="card" style="grid-column:span 2"><h2>Current plan</h2><div style="font-size:22px;font-weight:800">${esc(planStatus())}</div>
            <p class="note" style="margin:6px 0 14px">${s.trial && cur !== 'starter' ? 'Every Professional feature is open during the trial. Choose a plan before it ends, or you move to Starter automatically (nothing is deleted).' : esc(PLANS[cur].blurb)}</p>
            ${isAdmin() ? '' : '<p class="note">Only the owner can change the plan.</p>'}</div>
            <div class="card"><h2>Usage</h2>${bar('Active users', meta.users.filter(u => u.active !== false).length, L.users)}${bar('Companies', meta.companies.length, L.companies)}${bar(`Bill scans in ${MONTHS[new Date().getMonth()]}`, scansThisMonth(), L.scans)}</div></div>
        <div class="grid g4" style="margin-bottom:16px">${PLAN_ORDER.map(p => `<div class="card" style="${p === cur ? 'border:2px solid var(--brand)' : ''};display:flex;flex-direction:column">
            <div class="row" style="justify-content:space-between"><b style="font-size:16px">${PLANS[p].name}</b>${p === cur ? '<span class="badge brand">Current</span>' : p === 'professional' ? '<span class="badge good">Popular</span>' : ''}</div>
            <div style="font-size:26px;font-weight:800;margin:8px 0 2px">${price(p) ? inr0(price(p)) : 'Free'}</div><div class="note">${price(p) ? `per ${billCycle === 'y' ? 'year' : 'month'} + 18% GST` : 'forever'}</div>
            <p class="note" style="margin:10px 0;flex:1">${esc(PLANS[p].blurb)}</p>
            <div class="note" style="margin-bottom:12px">${PLANS[p].users === Infinity ? 'Unlimited' : PLANS[p].users} user(s) · ${PLANS[p].companies === Infinity ? 'unlimited' : PLANS[p].companies} compan${PLANS[p].companies === 1 ? 'y' : 'ies'} · ${PLANS[p].scans === Infinity ? 'unlimited' : PLANS[p].scans} scans a month</div>
            ${isAdmin() ? (p === cur && !s.trial ? '<button class="btn btn-s" disabled>Your plan</button>' : rank(p) > rank(cur) || (s.trial && p !== 'starter') ? `<button class="btn btn-p" onclick="checkout('${p}')">${s.trial && p === s.plan ? 'Buy now' : 'Upgrade'}</button>` : `<button class="btn btn-s" onclick="downgrade('${p}')">Switch to ${PLANS[p].name}</button>`) : ''}
        </div>`).join('')}</div>
        <div class="card"><h2>Compare plans</h2><div class="tw"><table class="t"><thead><tr><th>Feature</th>${PLAN_ORDER.map(p => `<th style="text-align:center">${PLANS[p].name}</th>`).join('')}</tr></thead><tbody>
            ${ALWAYS.map(f => `<tr><td>${esc(f)}</td>${PLAN_ORDER.map(() => '<td style="text-align:center" class="yes">✓</td>').join('')}</tr>`).join('')}
            ${Object.values(FEATURES).map(f => `<tr><td>${esc(f.label)}</td>${PLAN_ORDER.map(p => `<td style="text-align:center">${rank(p) >= rank(f.plan) ? '<span style="color:var(--good);font-weight:700">✓</span>' : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div></div>
        <div class="card"><h2>Payments</h2>${s.history.length ? `<div class="tw"><table class="t"><thead><tr><th>Date</th><th>Plan</th><th>Period</th><th>Method</th><th>Reference</th><th class="n">Amount</th><th class="n">GST</th><th class="n">Total</th><th></th></tr></thead><tbody>${s.history.slice().reverse().map(h => `<tr><td>${fmtDate(h.date)}</td><td>${PLANS[h.plan].name}</td><td>${fmtDate(h.date)} – ${fmtDate(h.until)}</td><td>${esc(h.method)}</td><td>${esc(h.ref)}</td><td class="n">${num(h.amount)}</td><td class="n">${num(h.gst)}</td><td class="n"><b>${num(h.total)}</b></td><td><button class="link" onclick="printSubInvoice('${h.ref}')">Invoice</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="note">No payments yet.</p>'}
        <p class="note" style="margin-top:10px">Test build: payments are simulated and no money is taken. The live version will take payment through a gateway (Razorpay / PayU) with UPI, cards and net banking.</p></div>`;
}
function checkout(plan) {
    if (!isAdmin()) return toast('Only the owner can change the plan.');
    const base = PLANS[plan].price[billCycle];
    modal({
        title: `Upgrade to ${PLANS[plan].name}`,
        body: `<div id="coErr"></div><div class="fg" style="grid-template-columns:1fr 1fr">
            <label class="f">Billing period<select id="co_cycle">${opt('m', `Monthly · ${inr0(PLANS[plan].price.m)}`, billCycle)}${opt('y', `Yearly · ${inr0(PLANS[plan].price.y)} (2 months free)`, billCycle)}</select></label>
            <label class="f">Your GSTIN for the invoice <span class="hint">Optional — lets you claim the GST</span><input id="co_gstin" maxlength="15" style="text-transform:uppercase" value="${esc(co?.profile.gstin || '')}"></label>
            <label class="f wide">Pay with<select id="co_method"><option>UPI</option><option>Credit / debit card</option><option>Net banking</option></select></label></div>
            <div class="totals" style="width:100%;margin-top:14px" id="co_sum"></div>`,
        foot: `<button class="btn btn-s" onclick="closeModal()">Cancel</button><button class="btn btn-p" id="coPay">Pay (test mode)</button>`,
        onOpen: () => {
            const calc = () => {
                const c = val('co_cycle'), amt = PLANS[plan].price[c];
                const st = (val('co_gstin') || '33').slice(0, 2);
                const gst = r2(amt * 0.18);
                $('#co_sum').innerHTML = `<div><span>${PLANS[plan].name} · ${c === 'y' ? '1 year' : '1 month'}</span><span>${inr(amt)}</span></div>${st === '33' ? `<div><span>CGST 9%</span><span>${inr(gst / 2)}</span></div><div><span>SGST 9%</span><span>${inr(gst / 2)}</span></div>` : `<div><span>IGST 18%</span><span>${inr(gst)}</span></div>`}<div class="big"><span>Total</span><span>${inr(amt + gst)}</span></div>`;
                return { c, amt, gst };
            };
            $('#co_cycle').onchange = calc; $('#co_gstin').oninput = calc; calc();
            $('#coPay').onclick = () => {
                const g = val('co_gstin').toUpperCase();
                if (g && !gstinValid(g)) return showErr('#coErr', 'GSTIN is not valid.');
                const { c, amt, gst } = calc();
                const s = subscription();
                const start = todayISO();
                const until = c === 'y' ? addDays(addMonths(ymOf(start), 12) + start.slice(7), -1) : addDays(addMonths(ymOf(start), 1) + start.slice(7), -1);
                const ref = `TEST-${Date.now().toString(36).toUpperCase()}`;
                s.history.push({ date: start, until, plan, cycle: c, amount: amt, gst, total: r2(amt + gst), method: val('co_method'), ref, gstin: g, state: (g || '33').slice(0, 2) });
                Object.assign(s, { plan, trial: false, renews: until, cycle: c });
                auditMeta('Plan changed', { entity: 'Subscription', ref, before: planStatus(), after: `${PLANS[plan].name} until ${fmtDate(until)} · ${inr(amt + gst)} (test payment)` });
                saveMeta(); closeModal(); route(); toast(`You are now on ${PLANS[plan].name}.`);
            };
        }
    });
}
async function downgrade(plan) {
    if (!isAdmin()) return;
    const L = PLANS[plan];
    const over = [];
    if (meta.users.filter(u => u.active !== false).length > L.users) over.push(`${meta.users.filter(u => u.active !== false).length} active users (limit ${L.users}) — disable some first`);
    if (meta.companies.length > L.companies) over.push(`${meta.companies.length} companies (limit ${L.companies}) — the extra ones become read-only`);
    if (!await ask({ title: `Switch to ${PLANS[plan].name}?`, message: `Features outside ${PLANS[plan].name} will lock. Your data stays.${over.length ? '\n\nPlease note:\n• ' + over.join('\n• ') : ''}`, ok: 'Switch' })) return;
    const s = subscription();
    auditMeta('Plan changed', { entity: 'Subscription', before: planStatus(), after: PLANS[plan].name });
    Object.assign(s, { plan, trial: false, renews: plan === 'starter' ? '' : s.renews });
    saveMeta(); route();
}
function printSubInvoice(ref) {
    const h = subscription().history.find(x => x.ref === ref);
    if (!h) return;
    const intra = h.state === '33';
    printHtml(`<div class="inv"><h1>TAX INVOICE</h1><table class="nob"><tr><td><b style="font-size:16px">We Create</b><br>Software subscription · Chennai, Tamil Nadu<br>GSTIN: (to be added)</td><td class="n">Invoice: <b>${esc(h.ref)}</b><br>Date: ${fmtDate(h.date)}</td></tr></table><br>
        <table><tr><td><b>Billed to</b><br>${esc(co?.profile.legalName || co?.profile.name || me.name)}<br>GSTIN: ${esc(h.gstin || 'Unregistered')}</td><td>Place of supply: ${esc(stateName(h.state))}</td></tr></table>
        <table style="margin-top:6px"><thead><tr><th>Description</th><th>SAC</th><th class="n">Amount</th></tr></thead><tbody><tr><td>We Create ERP ${PLANS[h.plan].name} plan, ${fmtDate(h.date)} to ${fmtDate(h.until)}</td><td>997331</td><td class="n">${num(h.amount)}</td></tr>
        ${intra ? `<tr><td colspan="2" class="n">CGST 9%</td><td class="n">${num(h.gst / 2)}</td></tr><tr><td colspan="2" class="n">SGST 9%</td><td class="n">${num(h.gst / 2)}</td></tr>` : `<tr><td colspan="2" class="n">IGST 18%</td><td class="n">${num(h.gst)}</td></tr>`}
        <tr><td colspan="2" class="n"><b>Total</b></td><td class="n"><b>₹ ${num(h.total)}</b></td></tr></tbody></table><p style="margin-top:8px">${esc(inWords(h.total))}</p>
        <p style="text-align:center;font-size:10px;color:#666;margin-top:14px">TEST PAYMENT — no money was taken. Paid via ${esc(h.method)}.</p></div>`);
}
