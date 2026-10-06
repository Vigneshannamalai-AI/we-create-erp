'use strict';
// ===================== We Create ERP · payroll =====================
// Employees and a monthly payroll that posts itself to the books:
//   Dr Salaries & Wages (gross)            Cr PF Payable (employee + employer share)
//   Dr Employer's PF / ESI contribution    Cr ESI Payable (employee + employer share)
//                                          Cr Professional Tax Payable · TDS on Salary Payable · Salary Advances
//                                          Cr Salary Payable (net pay)
// Paying the salaries clears Salary Payable from the bank; statutory dues are paid from their ledgers.
// So the Statement of Profit and Loss shows employee benefits expense, and the Balance Sheet shows what is still owed.

const PF_RATE = 12, PF_CEILING = 15000, ESI_EMP = 0.75, ESI_ER = 3.25, ESI_LIMIT = 21000;
// Tamil Nadu professional tax (Chennai Corporation, revised 2024), per half-year on half-yearly salary
const TN_PT = [[21000, 0], [30000, 180], [45000, 425], [60000, 930], [75000, 1025], [Infinity, 1250]];
const ptHalfYear = halfYearSalary => TN_PT.find(([lim]) => halfYearSalary <= lim)[1];

const empById = id => (co.employees || []).find(e => e.id === id);
const activeEmployees = ym => (co.employees || []).filter(e => (!e.doj || e.doj <= lastDay(ym)) && (!e.exitDate || e.exitDate >= `${ym}-01`) && e.status !== 'Inactive');
const SOURCE_LABEL = { manual: '', staybay: 'STAY BAY', ecopack: 'Eco Pack' };

function saveEmployee(e) {
    assertEdit();
    co.employees ||= [];
    const E = [];
    e.name = String(e.name || '').trim();
    e.pan = String(e.pan || '').toUpperCase().trim();
    if (!e.name) E.push('Name is required.');
    if (!(Number(e.salary) >= 0)) E.push('Monthly salary cannot be negative.');
    if (e.pan && !panValid(e.pan)) E.push('PAN is not valid.');
    if (e.uan && !/^\d{12}$/.test(e.uan)) E.push('UAN must be 12 digits.');
    if (e.exitDate && e.doj && e.exitDate < e.doj) E.push('Last working day cannot be before the joining date.');
    if (e.code && co.employees.some(x => x.id !== e.id && x.code === e.code)) E.push(`Employee code ${e.code} is already used.`);
    if (E.length) { const er = new Error(E.join('\n')); er.list = E; throw er; }
    e.salary = r2(e.salary);
    const old = e.id && empById(e.id);
    if (old) { audit('Employee edited', { entity: 'Employee', ref: e.name, after: diffFields(old, e, ['name', 'dept', 'desig', 'salary', 'pf', 'esi', 'tdsMonthly', 'status', 'exitDate']) }); Object.assign(old, e); }
    else {
        e.id = uid('em');
        e.code ||= `E${String(co.employees.length + 1).padStart(3, '0')}`;
        co.employees.push(e);
        audit('Employee added', { entity: 'Employee', ref: e.name, after: `${e.desig || ''} · ${inr(e.salary)} a month${e.source && e.source !== 'manual' ? ' · from ' + SOURCE_LABEL[e.source] : ''}` });
    }
    saveCo();
    return old || e;
}

// One employee's pay for a month (days absent without pay = lop)
function computePayRow(e, ym, lop = 0, adv = 0) {
    const days = daysIn(ym);
    const from = e.doj && e.doj > `${ym}-01` ? Number(e.doj.slice(8)) : 1;
    const to = e.exitDate && e.exitDate < lastDay(ym) ? Number(e.exitDate.slice(8)) : days;
    const employed = Math.max(0, to - from + 1);
    const paid = Math.max(0, employed - (Number(lop) || 0));
    const gross = Math.round((Number(e.salary) || 0) * paid / days);
    const basic = Math.round(gross * (Number(e.basicPct) || 50) / 100);
    const pfWage = Math.min(basic, PF_CEILING);
    const pf = e.pf !== false ? Math.round(pfWage * PF_RATE / 100) : 0;
    const erPf = pf;
    const esiOn = e.esi !== false && (Number(e.salary) || 0) <= ESI_LIMIT && gross > 0;
    const esi = esiOn ? Math.ceil(gross * ESI_EMP / 100) : 0;
    const erEsi = esiOn ? Math.ceil(gross * ESI_ER / 100) : 0;
    // Professional tax is due twice a year: deducted with the September and March salaries
    const pt = gross > 0 && ['09', '03'].includes(ym.slice(5)) ? (e.ptHalf !== undefined && e.ptHalf !== '' ? Number(e.ptHalf) : ptHalfYear((Number(e.salary) || 0) * 6)) : 0;
    const tds = gross > 0 ? Math.round(Number(e.tdsMonthly) || 0) : 0;
    adv = Math.min(Math.round(Number(adv) || 0), Math.max(0, gross - pf - esi - pt - tds));
    const net = gross - pf - esi - pt - tds - adv;
    return { days, paidDays: paid, lop: Number(lop) || 0, gross, basic, pf, erPf, esi, erEsi, pt, tds, adv, net };
}
const runOf = ym => (co.payroll ||= {})[ym];
function draftRun(ym) {
    co.payroll ||= {};
    const run = co.payroll[ym] ||= { status: 'draft', rows: {}, source: 'manual' };
    if (run.status === 'draft') activeEmployees(ym).forEach(e => {
        const prev = run.rows[e.id] || {};
        run.rows[e.id] = computePayRow(e, ym, prev.lop, prev.adv);
    });
    return run;
}
const runTotals = run => { const T = {}; Object.values(run?.rows || {}).forEach(r => Object.keys(r).forEach(k => { if (typeof r[k] === 'number') T[k] = r2((T[k] || 0) + r[k]); })); return T; };

// Posts the month's payroll as one journal dated the last day of the month
function postPayroll(ym, opts = {}) {
    assertEdit();
    const run = runOf(ym);
    if (!run || !Object.keys(run.rows).length) throw new Error('There is no payroll for this month.');
    if (run.jvId && vById(run.jvId)?.status !== 'cancelled') throw new Error('This month is already posted.');
    const T = runTotals(run);
    const L = [];
    const dr = (k, a) => { if (r2(a)) L.push({ acc: sysId(k), dr: r2(a), cr: 0 }); };
    const cr = (k, a) => { if (r2(a)) L.push({ acc: sysId(k), dr: 0, cr: r2(a) }); };
    dr('salary', T.gross); dr('erPf', T.erPf); dr('erEsi', T.erEsi);
    cr('pfPay', (T.pf || 0) + (T.erPf || 0)); cr('esiPay', (T.esi || 0) + (T.erEsi || 0)); cr('ptPay', T.pt); cr('tdsSalPay', T.tds); cr('salAdv', T.adv); cr('salPay', T.net);
    const date = lastDay(ym) > todayISO() ? todayISO() : lastDay(ym);
    const jv = saveVoucher({ type: 'JV', date: opts.date || date, jlines: L, narration: `Payroll for ${ymLabel(ym)}: ${Object.keys(run.rows).length} employee(s), gross ${inr(T.gross)}, net ${inr(T.net)}${run.source !== 'manual' ? ` (from ${SOURCE_LABEL[run.source]})` : ''}`, ext: opts.ext }, { source: opts.source || 'Payroll' });
    Object.assign(run, { status: 'posted', jvId: jv.id, postedOn: todayISO(), postedBy: me?.name });
    saveCo();
    return jv;
}
function paySalaries(ym, accountId, date, ref, opts = {}) {
    assertEdit();
    const run = runOf(ym);
    if (!run || run.status === 'draft') throw new Error('Post the payroll before paying it.');
    if (run.payId && vById(run.payId)?.status !== 'cancelled') throw new Error('Salaries for this month are already paid.');
    const T = runTotals(run);
    const v = saveVoucher({ type: 'PY', date, accountId, ledgerId: sysId('salPay'), amount: T.net, refNo: ref || '', narration: `Salaries paid for ${ymLabel(ym)}`, ext: opts.ext }, { source: opts.source || 'Payroll' });
    Object.assign(run, { status: 'paid', payId: v.id, paidOn: date });
    saveCo();
    return v;
}
function unpostPayroll(ym, reason) {
    const run = runOf(ym);
    if (!run) return;
    if (run.payId && vById(run.payId)?.status !== 'cancelled') throw new Error('Salaries are already paid. Cancel the payment first.');
    if (run.jvId) cancelVoucher(run.jvId, reason);
    Object.assign(run, { status: 'draft', jvId: '' });
    saveCo();
}

// Statutory dues month by month: what payroll created vs what has been paid
const STAT = {
    pf: { ledger: 'pfPay', label: 'PF (EPFO ECR)', due: ym => `${addMonths(ym, 1)}-15`, amt: T => (T.pf || 0) + (T.erPf || 0) },
    esi: { ledger: 'esiPay', label: 'ESI', due: ym => `${addMonths(ym, 1)}-15`, amt: T => (T.esi || 0) + (T.erEsi || 0) },
    tds: { ledger: 'tdsSalPay', label: 'TDS on salary (s.392)', due: ym => depositDue(ym), amt: T => T.tds || 0 },
    pt: { ledger: 'ptPay', label: 'Professional tax', due: ym => ym.endsWith('-09') ? `${ym.slice(0, 4)}-10-31` : ym.endsWith('-03') ? `${ym.slice(0, 4)}-04-30` : '', amt: T => T.pt || 0 }
};
function statDues(fy) {
    const pays = co.vouchers.filter(v => v.type === 'PY' && v.status !== 'cancelled');
    return fyMonths(fy).flatMap(ym => {
        const run = runOf(ym);
        if (!run || run.status === 'draft') return [];
        const T = runTotals(run);
        return Object.entries(STAT).map(([k, s]) => {
            const amount = r2(s.amt(T));
            if (!amount) return null;
            const paid = sum(pays.filter(v => v.ledgerId === sysId(s.ledger) && v.taxMonth === ym), 'amount');
            return { k, ym, label: s.label, amount, paid, due: s.due(ym), pending: r2(amount - paid) };
        }).filter(Boolean);
    });
}
function payStatutory(k, ym, amount) {
    F = null;
    viewVoucherForm({ type: 'PY', ledgerId: sysId(STAT[k].ledger), taxMonth: ym, amount: Math.round(amount), accountId: cashBankAccounts().find(a => a.group === 'bank')?.id || sysId('cash'), narration: `${STAT[k].label} for ${ymLabel(ym)}` });
    history.replaceState(null, '', '#/new/PY');
}

// ---------- screens ----------
let payTab = 'run', payMonth = '';
function viewPayroll() {
    co.employees ||= []; co.payroll ||= {};
    const months = fyMonths(state.fy).filter(m => m <= ymOf(todayISO()) && lastDay(m) >= co.profile.booksFrom);
    if (!months.includes(payMonth)) payMonth = months.at(-1) || ymOf(todayISO());
    const tabs = [['run', 'Monthly payroll'], ['emp', `Employees (${co.employees.filter(e => e.status !== 'Inactive').length})`], ['stat', 'PF, ESI, PT & TDS'], ['link', 'Connected dashboards']];
    const head = pageHead('Payroll', 'Add employees once; each month the payroll works out PF, ESI, professional tax and TDS, posts salary and employer contributions to the books, and records the payment. Employee benefits expense flows into the Profit and Loss, and unpaid salary and dues into the Balance Sheet.')
        + `<div class="tabs">${tabs.map(([k, l]) => `<button class="${payTab === k ? 'on' : ''}" onclick="payTab='${k}';route()">${l}</button>`).join('')}</div>`;
    let body = '';
    if (payTab === 'emp') {
        const list = co.employees.slice().sort((a, b) => (a.status === 'Inactive') - (b.status === 'Inactive') || a.name.localeCompare(b.name));
        body = `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:12px"><input placeholder="Filter" oninput="filterRows(this,'#emT')" style="flex:1;max-width:320px">${canEdit() ? '<button class="btn btn-p" onclick="employeeForm()">+ Add employee</button>' : ''}</div>
            <div class="tw"><table class="t" id="emT"><thead><tr><th>Employee</th><th class="hide-m">Department</th><th class="n">Monthly salary</th><th class="hide-m">PF / ESI</th><th class="hide-m">Joined</th><th>Status</th><th></th></tr></thead><tbody>
            ${list.map(e => `<tr><td><b>${esc(e.name)}</b><div class="note">${esc(e.code)} · ${esc(e.desig || '')}${e.source && e.source !== 'manual' ? ` <span class="badge info">${SOURCE_LABEL[e.source]}</span>` : ''}</div></td><td class="hide-m">${esc(e.dept || '')}</td><td class="n">${num(e.salary)}</td><td class="hide-m">${e.pf !== false ? 'PF' : '—'} · ${e.esi !== false && e.salary <= ESI_LIMIT ? 'ESI' : '—'}</td><td class="hide-m">${fmtDate(e.doj)}</td><td><span class="badge ${e.status === 'Inactive' || e.exitDate ? '' : 'good'}">${e.exitDate ? 'Left ' + fmtDate(e.exitDate) : e.status || 'Active'}</span></td><td>${canEdit() ? `<button class="link" onclick="employeeForm('${e.id}')">Edit</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted" style="text-align:center;padding:20px">No employees yet. Add them here, or connect STAY BAY / Eco Pack.</td></tr>'}
            </tbody></table></div></div>`;
    } else if (payTab === 'stat') {
        const dues = statDues(state.fy);
        body = `<div class="card"><h2>Statutory dues from payroll · FY ${fyLabel(state.fy)}</h2><div class="tw"><table class="t"><thead><tr><th>Month</th><th>Due</th><th class="n">Amount</th><th class="n">Paid</th><th>Due by</th><th></th></tr></thead><tbody>
            ${dues.map(d => `<tr><td>${ymLabel(d.ym)}</td><td>${esc(d.label)}</td>${amtCell(d.amount)}${amtCell(d.paid)}<td>${d.due ? fmtDate(d.due) : '—'} ${d.pending > 0.5 && d.due && d.due < todayISO() ? '<span class="badge bad">overdue</span>' : d.pending <= 0.5 ? '<span class="badge good">paid</span>' : ''}</td><td>${d.pending > 0.5 && canEdit() ? `<button class="btn btn-s btn-sm" onclick="payStatutory('${d.k}','${d.ym}',${d.pending})">Pay ${inr0(d.pending)}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted" style="text-align:center;padding:20px">Post a payroll to see its dues.</td></tr>'}
            </tbody></table></div>
            <p class="note" style="margin-top:8px">PF: pay through the EPFO Unified Portal (ECR) by the 15th. ESI: ESIC portal by the 15th. TDS on salary: by the 7th (March: 30 April), quarterly return Form 138 (old 24Q). Tamil Nadu professional tax: twice a year with the September and March salaries.</p>
            <div class="row" style="margin-top:10px">${['Q1', 'Q2', 'Q3', 'Q4'].map(q => `<button class="btn btn-s btn-sm" onclick="download('Form138_${q}_TY${fyLabel(state.fy)}.csv','\\ufeff'+form138Csv(${state.fy},'${q}'),'text/csv')">${ic('dl')} Form 138 ${q}</button>`).join('')}<button class="btn btn-s btn-sm" onclick="download('ECR_${payMonth}.txt', ecrText('${payMonth}'), 'text/plain')">${ic('dl')} PF ECR file · ${ymLabel(payMonth)}</button></div></div>`;
    } else if (payTab === 'link') {
        body = connectionsHtml();
    } else {
        const run = runOf(payMonth);
        const draft = !run || run.status === 'draft';
        const r = draft && canEdit() ? draftRun(payMonth) : run;
        const rows = Object.entries(r?.rows || {}).map(([id, x]) => ({ e: empById(id), x })).filter(z => z.e);
        const T = runTotals(r);
        const steps = [['draft', 'Prepare'], ['posted', 'Posted to books'], ['paid', 'Salaries paid']];
        const at = steps.findIndex(s => s[0] === (r?.status || 'draft'));
        body = `<div class="card"><div class="row" style="justify-content:space-between"><div class="row"><select onchange="payMonth=this.value;route()">${months.map(m => opt(m, ymLabel(m), payMonth)).join('')}</select>
            ${steps.map((s, i) => `<span class="badge ${i < at ? 'good' : i === at ? 'brand' : ''}">${i + 1}. ${s[1]}</span>`).join('')}${r?.source && r.source !== 'manual' ? `<span class="badge info">From ${SOURCE_LABEL[r.source]}</span>` : ''}</div>
            <div class="row">${canEdit() && rows.length ? (draft ? `<button class="btn btn-p" onclick="doPostPayroll('${payMonth}')">Post payroll to books</button>` : r.status === 'posted' ? `<button class="btn btn-g btn-sm" onclick="doUnpost('${payMonth}')">Re-open</button><button class="btn btn-p" onclick="doPaySalaries('${payMonth}')">Pay salaries ${inr0(T.net)}</button>` : `<a class="btn btn-s btn-sm" href="#/v/${r.payId}">Payment ${esc(vById(r.payId)?.no || '')}</a>`) : ''}${r?.jvId ? `<a class="btn btn-s btn-sm" href="#/v/${r.jvId}">Journal ${esc(vById(r.jvId)?.no || '')}</a>` : ''}</div></div></div>
            <div class="grid g4" style="margin-bottom:14px">${[['Gross salary', T.gross, '#4338ca'], ['Employee deductions', (T.pf || 0) + (T.esi || 0) + (T.pt || 0) + (T.tds || 0) + (T.adv || 0), '#c62828'], ['Net pay', T.net, '#0f9d63'], ['Employer PF + ESI', (T.erPf || 0) + (T.erEsi || 0), '#b45309']].map(([l, v, c]) => `<div class="kpi" style="--c:${c}"><div class="v">${inr0(v || 0)}</div><div class="l">${l}</div></div>`).join('')}</div>
            <div class="card"><div class="tw"><table class="t" id="prT"><thead><tr><th>Employee</th><th class="n">Days paid</th><th class="n">LOP days</th><th class="n">Gross</th><th class="n hide-m">PF</th><th class="n hide-m">ESI</th><th class="n hide-m">PT</th><th class="n hide-m">TDS</th><th class="n">Advance</th><th class="n">Net pay</th><th class="n hide-m">Employer PF+ESI</th></tr></thead><tbody>
            ${rows.map(({ e, x }) => `<tr><td><b>${esc(e.name)}</b><div class="note">${esc(e.desig || e.dept || '')}</div></td><td class="n">${x.paidDays ?? '—'}</td><td class="n">${draft && canEdit() ? `<input type="number" min="0" max="31" step="0.5" value="${x.lop || 0}" style="width:72px" onchange="setPayInput('${payMonth}','${e.id}','lop',this.value)">` : (x.lop || 0)}</td>${amtCell(x.gross)}<td class="n hide-m">${num(x.pf)}</td><td class="n hide-m">${num(x.esi)}</td><td class="n hide-m">${num(x.pt)}</td><td class="n hide-m">${num(x.tds)}</td><td class="n">${draft && canEdit() ? `<input type="number" min="0" step="100" value="${x.adv || 0}" style="width:90px" onchange="setPayInput('${payMonth}','${e.id}','adv',this.value)">` : num(x.adv || 0)}</td><td class="n"><b>${num(x.net)}</b></td><td class="n hide-m">${num((x.erPf || 0) + (x.erEsi || 0))}</td></tr>`).join('') || '<tr><td colspan="11" class="muted" style="text-align:center;padding:20px">No employees for this month. Add employees or connect a dashboard.</td></tr>'}
            </tbody>${rows.length ? `<tfoot><tr><td>Total (${rows.length})</td><td></td><td></td>${amtCell(T.gross)}<td class="n hide-m">${num(T.pf)}</td><td class="n hide-m">${num(T.esi)}</td><td class="n hide-m">${num(T.pt)}</td><td class="n hide-m">${num(T.tds)}</td>${amtCell(T.adv)}<td class="n">${num(T.net)}</td><td class="n hide-m">${num((T.erPf || 0) + (T.erEsi || 0))}</td></tr></tfoot>` : ''}</table></div>
            <p class="note" style="margin-top:8px">PF 12% of basic (capped at ₹15,000) from employee and employer; ESI 0.75% + 3.25% for salaries up to ₹21,000; Tamil Nadu professional tax with the September and March salaries; TDS as set on each employee. "Advance" recovers a salary advance (pay advances to the ledger "Salary Advances to Staff").</p></div>`;
    }
    $('#view').innerHTML = head + body;
}
function setPayInput(ym, id, k, v) {
    const run = draftRun(ym);
    const prev = run.rows[id] || {};
    prev[k] = Number(v) || 0;
    run.rows[id] = computePayRow(empById(id), ym, prev.lop, prev.adv);
    saveCo(); route();
}
function doPostPayroll(ym) {
    try { draftRun(ym); const jv = postPayroll(ym); toast(`Payroll posted as ${jv.no}.`); route(); } catch (e) { alert(e.message); }
}
async function doUnpost(ym) {
    const reason = await ask({ title: 'Re-open payroll', message: `Cancel the journal for ${ymLabel(ym)} so the figures can be changed?`, input: 'Reason', ok: 'Re-open' });
    if (reason === null) return;
    try { unpostPayroll(ym, reason); route(); } catch (e) { alert(e.message); }
}
function doPaySalaries(ym) {
    const T = runTotals(runOf(ym));
    modal({
        title: `Pay salaries · ${ymLabel(ym)}`,
        body: `<div id="psErr"></div><p style="margin-bottom:12px">Net pay <b>${inr(T.net)}</b> to ${Object.keys(runOf(ym).rows).length} employee(s).</p><div class="fg"><label class="f">Paid from<select id="ps_acc">${cashBankAccounts().map(a => opt(a.id, a.name, cashBankAccounts().find(x => x.group === 'bank')?.id)).join('')}</select></label><label class="f">Date<input id="ps_date" type="date" value="${todayISO() < lastDay(ym) ? todayISO() : (ym < ymOf(todayISO()) ? `${addMonths(ym, 1)}-01` : todayISO())}"></label><label class="f">Reference (bulk transfer / UTR)<input id="ps_ref"></label></div>`,
        foot: `<button class="btn btn-s" onclick="closeModal()">Cancel</button><button class="btn btn-p" id="psOk">Record payment</button>`,
        onOpen: () => $('#psOk').onclick = () => { try { const v = paySalaries(ym, val('ps_acc'), val('ps_date'), val('ps_ref')); closeModal(); toast(`Salaries paid (${v.no}).`); route(); } catch (e) { showErr('#psErr', e); } }
    });
}
function employeeForm(id) {
    const e = id ? { ...empById(id) } : { pf: true, esi: true, basicPct: 50, status: 'Active', doj: todayISO(), source: 'manual' };
    const linked = e.source && e.source !== 'manual';
    modal({
        title: id ? `Edit ${e.name}` : 'Add employee', wide: true,
        body: `<div id="emErr"></div>${linked ? `<div class="warns" style="background:var(--info-soft);color:var(--info)">Comes from ${SOURCE_LABEL[e.source]}. Changes there come across on the next sync; payroll for months paid there is imported as paid.</div>` : ''}<div class="fg">
            <label class="f">Name *<input id="em_name" value="${esc(e.name)}"></label><label class="f">Employee code<input id="em_code" value="${esc(e.code)}"></label>
            <label class="f">Department<input id="em_dept" value="${esc(e.dept)}"></label><label class="f">Designation<input id="em_desig" value="${esc(e.desig)}"></label>
            <label class="f">Monthly gross salary (₹) *<input id="em_sal" type="number" min="0" step="100" value="${e.salary ?? ''}"></label><label class="f">Basic (% of gross)<input id="em_basic" type="number" min="1" max="100" value="${e.basicPct || 50}"></label>
            <label class="f">Joining date<input id="em_doj" type="date" value="${esc(e.doj)}"></label><label class="f">Last working day<input id="em_exit" type="date" value="${esc(e.exitDate)}"></label>
            <label class="f">PAN<input id="em_pan" maxlength="10" style="text-transform:uppercase" value="${esc(e.pan)}"></label><label class="f">UAN (PF)<input id="em_uan" maxlength="12" inputmode="numeric" value="${esc(e.uan)}"></label>
            <label class="f">ESI IP number<input id="em_esino" value="${esc(e.esiNo)}"></label><label class="f">TDS per month (₹) <span class="hint">From the employee's projected tax</span><input id="em_tds" type="number" min="0" value="${e.tdsMonthly || 0}"></label>
            <label class="f">Professional tax per half-year (₹) <span class="hint">Blank = Tamil Nadu slab</span><input id="em_pt" type="number" min="0" value="${e.ptHalf ?? ''}"></label>
            <label class="f">Bank account<input id="em_bank" value="${esc(e.bankAcc)}"></label>
            <label class="chk"><input type="checkbox" id="em_pf" ${e.pf !== false ? 'checked' : ''}> PF applies</label><label class="chk"><input type="checkbox" id="em_esi" ${e.esi !== false ? 'checked' : ''}> ESI applies (salary up to ₹21,000)</label>
            <label class="chk"><input type="checkbox" id="em_inact" ${e.status === 'Inactive' ? 'checked' : ''}> Inactive (not in payroll)</label></div>`,
        foot: `<button class="btn btn-s" onclick="closeModal()">Cancel</button><button class="btn btn-p" id="emOk">Save</button>`,
        onOpen: () => $('#emOk').onclick = () => {
            try { saveEmployee({ ...e, name: val('em_name'), code: val('em_code'), dept: val('em_dept'), desig: val('em_desig'), salary: numv('em_sal'), basicPct: numv('em_basic') || 50, doj: val('em_doj'), exitDate: val('em_exit'), pan: val('em_pan'), uan: val('em_uan'), esiNo: val('em_esino'), tdsMonthly: numv('em_tds'), ptHalf: val('em_pt') === '' ? undefined : numv('em_pt'), bankAcc: val('em_bank'), pf: chk('em_pf'), esi: chk('em_esi'), status: chk('em_inact') ? 'Inactive' : 'Active' }); closeModal(); route(); toast('Employee saved.'); }
            catch (err) { showErr('#emErr', err); }
        }
    });
}
// Form 138 (old 24Q) data: salary paid and TDS per employee for the quarter
function form138Csv(fy, q) {
    const months = QUARTERS[q].map(m => `${m >= 4 ? fy : fy + 1}-${String(m).padStart(2, '0')}`);
    const rows = [];
    months.forEach(ym => { const run = runOf(ym); if (!run || run.status === 'draft') return; Object.entries(run.rows).forEach(([id, r]) => { const e = empById(id); if (e && (r.tds || r.gross)) rows.push([e.pan || 'PANNOTAVBL', e.name, e.code, ymLabel(ym), r.gross, r.tds]); }); });
    return toCSV([['Employee PAN', 'Name', 'Code', 'Month', 'Salary paid', 'TDS (s.392)'], ...rows]);
}
// EPFO ECR text file: UAN#~#Name#~#Gross#~#EPF wages#~#EPS wages#~#EDLI wages#~#EE share#~#EPS#~#ER diff#~#NCP days#~#Refund
function ecrText(ym) {
    const run = runOf(ym);
    if (!run) return '';
    return Object.entries(run.rows).map(([id, r]) => {
        const e = empById(id);
        if (!e || !r.pf) return null;
        const wage = Math.min(r.basic || 0, PF_CEILING), eps = Math.round(wage * 8.33 / 100);
        return [e.uan || '000000000000', e.name.toUpperCase(), r.gross, r.basic, wage, wage, r.pf, eps, r.erPf - eps, Math.round(r.lop || 0), 0].join('#~#');
    }).filter(Boolean).join('\n');
}
