'use strict';
// ===================== We Create ERP · vouchers: lists, forms, view, print, scan =====================

const LIST_TYPES = { sales: ['SI'], purchases: ['PB'], notes: ['CN', 'DN'], receipts: ['RC'], payments: ['PY'], journals: ['JV', 'CT'] };
const LIST_TITLE = { sales: 'Sales invoices', purchases: 'Purchase bills', notes: 'Credit & debit notes', receipts: 'Receipts', payments: 'Payments', journals: 'Journal & contra' };
let listFilter = { month: '', status: '' };
let F = null;              // the voucher being edited
let pendingDraft = null;   // a voucher prepared by the bill scanner

// ---------- lists ----------
function billStatus(v) {
    if (v.status === 'cancelled') return '<span class="badge">Cancelled</span>';
    if (!['SI', 'PB'].includes(v.type)) return '<span class="badge good">Posted</span>';
    const o = outstanding(v);
    if (o <= 0.009) return '<span class="badge good">Paid</span>';
    if (dueDate(v) < todayISO()) return `<span class="badge bad">Overdue ${daysBetween(dueDate(v), todayISO())}d</span>`;
    return o < billDue(v) ? '<span class="badge warn">Part paid</span>' : '<span class="badge info">Open</span>';
}
function viewVoucherList(kind) {
    const types = LIST_TYPES[kind];
    const fy = state.fy;
    const months = fyMonths(fy);
    let list = co.vouchers.filter(v => types.includes(v.type) && fyOf(v.date) === fy);
    if (listFilter.month) list = list.filter(v => ymOf(v.date) === listFilter.month);
    if (listFilter.status === 'open') list = list.filter(v => v.status !== 'cancelled' && ['SI', 'PB'].includes(v.type) && outstanding(v) > 0.009);
    if (listFilter.status === 'cancelled') list = list.filter(v => v.status === 'cancelled');
    list.sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
    const itemish = types.some(t => ITEM_TYPES.includes(t));
    const act = list.filter(v => v.status !== 'cancelled');
    const newBtns = types.map(t => `<a class="btn ${t === types[0] ? 'btn-p' : 'btn-s'}" href="#/new/${t}">${ic('plus')} ${VTYPES[t].short} <kbd>${VTYPES[t].key}</kbd></a>`).join('');
    $('#view').innerHTML = pageHead(LIST_TITLE[kind], {
        sales: 'Tax invoices with GST worked out from the place of supply. Each one posts to the customer, sales and output GST ledgers and appears in GSTR-1.',
        purchases: 'Supplier bills. Input GST, reverse charge and TDS are calculated and posted automatically; bills are matched against GSTR-2B.',
        notes: 'Credit notes reduce a sale (returns, discounts); debit notes reduce a purchase. They must point to the original document.',
        receipts: 'Money received, settled against open invoices bill by bill.', payments: 'Money paid, settled against open bills; pay TDS and GST here too.',
        journals: 'Adjustments (depreciation, provisions, transfers) and cash ↔ bank movements.'
    }[kind], canEdit() ? `${kind === 'purchases' ? `<a class="btn btn-s adv" href="#/scan">${ic('cam')} Scan bill</a>` : ''}${newBtns}` : '')
        + `<div class="card"><div class="row" style="margin-bottom:12px">
            <select onchange="listFilter.month=this.value;route()">${opt('', `All of FY ${fyLabel(fy)}`, listFilter.month)}${months.map(m => opt(m, ymLabel(m), listFilter.month)).join('')}</select>
            <select onchange="listFilter.status=this.value;route()">${opt('', 'All', listFilter.status)}${['SI', 'PB'].some(t => types.includes(t)) ? opt('open', 'Unpaid only', listFilter.status) : ''}${opt('cancelled', 'Cancelled', listFilter.status)}</select>
            <input placeholder="Filter by number, party, amount" oninput="filterRows(this,'#vlT')" style="flex:1;max-width:300px">
            <button class="btn btn-s btn-sm" onclick="tableCSV($('#vlT'),'${kind}')">${ic('dl')} CSV</button></div>
        <div class="tw m-cards"><table class="t" id="vlT"><thead><tr><th>Date</th><th>Number</th>${types.length > 1 ? '<th>Type</th>' : ''}<th>Party / ledger</th>${kind === 'purchases' ? '<th class="hide-m">Supplier inv.</th>' : ''}${itemish ? '<th class="n hide-m">Taxable</th><th class="n hide-m">GST</th>' : ''}<th class="n">Total</th>${['SI', 'PB'].some(t => types.includes(t)) ? '<th class="n">Due</th>' : ''}<th>Status</th></tr></thead><tbody>
        ${list.map(v => `<tr class="click ${v.status === 'cancelled' ? 'cancel' : ''}" onclick="go('#/v/${v.id}')"><td class="c-date">${fmtDate(v.date)}</td><td class="c-no"><b>${esc(v.no)}</b>${v.irn ? ' <span class="badge info keep">IRN</span>' : ''}${v.attachment ? ' 📎' : ''}</td>${types.length > 1 ? `<td class="c-type">${VTYPES[v.type].short}</td>` : ''}
            <td class="c-party">${esc(ledgerOf(v.partyId || v.ledgerId || v.toId)?.name || (v.type === 'JV' ? (v.narration || '').slice(0, 40) : ''))}</td>${kind === 'purchases' ? `<td class="hide-m">${esc(v.refNo || '')}</td>` : ''}
            ${itemish ? `<td class="n hide-m">${num(v.totals.taxable)}</td><td class="n hide-m">${num(v.totals.tax)}${v.rcm ? ' <span class="badge warn keep">RCM</span>' : ''}</td>` : ''}<td class="n c-total"><b>${num(v.totals.total)}</b></td>
            ${['SI', 'PB'].some(t => types.includes(t)) ? `<td class="n c-due">${v.status === 'cancelled' ? '—' : `<span class="m-only">Due </span>${num(outstanding(v))}`}</td>` : ''}<td class="keep c-status">${billStatus(v)}</td></tr>`).join('') || `<tr><td colspan="10" class="muted" style="text-align:center;padding:24px">Nothing here yet.${canEdit() ? ` Press <kbd>${VTYPES[types[0]].key}</kbd> to add one.` : ''}</td></tr>`}
        </tbody>${act.length ? `<tfoot><tr><td colspan="${2 + (types.length > 1) + 1 + (kind === 'purchases')}">${act.length} active</td>${itemish ? `<td class="n hide-m">${num(sum(act, v => v.totals.taxable))}</td><td class="n hide-m">${num(sum(act, v => v.totals.tax))}</td>` : ''}<td class="n">${num(sum(act, v => v.totals.total))}</td>${['SI', 'PB'].some(t => types.includes(t)) ? `<td class="n">${num(sum(act, v => outstanding(v)))}</td>` : ''}<td></td></tr></tfoot>` : ''}</table></div></div>`;
}

// ---------- forms ----------
function blankLine() { return { itemId: '', desc: '', hsn: '', qty: 1, unit: 'NOS', rate: 0, disc: 0, gstRate: 18, accId: '' }; }
function viewVoucherForm(src) {
    if (!src) return go('#/dashboard');
    if (!canEdit()) { $('#view').innerHTML = errorsHtml('Your role is read-only.'); return; }
    const editing = Boolean(src.id);
    if (editing) {
        const errs = src.status === 'cancelled' ? ['A cancelled voucher cannot be edited.'] : [];
        if (src.irn && !src.irnCancelled) errs.push('This invoice has an IRN; it cannot be edited. Issue a credit note instead.');
        if (errs.length) { $('#view').innerHTML = errorsHtml(errs.join('\n')) + `<a class="btn btn-s" href="#/v/${src.id}">Back</a>`; return; }
    }
    F = JSON.parse(JSON.stringify(src));
    if (!editing && pendingDraft && pendingDraft.v.type === F.type) { F = pendingDraft.v; F.attachmentFile = pendingDraft.file; pendingDraft = null; }
    F.date ||= todayISO() < fyStart(state.fy) || todayISO() > fyEnd(state.fy) ? fyEnd(state.fy) : todayISO();
    if (ITEM_TYPES.includes(F.type)) { F.lines = F.lines?.length ? F.lines : [blankLine()]; if (F.itc === undefined) F.itc = true; }
    if (F.type === 'JV') F.jlines = F.jlines?.length ? F.jlines.map(l => ({ ...l })) : [{ acc: '', dr: 0, cr: 0 }, { acc: '', dr: 0, cr: 0 }];
    const T = VTYPES[F.type];
    const head = `<div class="page-head"><div><h1>${editing ? `Edit ${esc(F.no)}` : `New ${T.name}`}</h1><p>${editing ? 'Every change is recorded in the audit trail with the old and new values.' : `Number <b>${esc(previewNumber(F.type, F.date))}</b> is given when you save (numbers never skip). <span class="hide-m">Shortcut <kbd>${T.key}</kbd> · save with <kbd>Ctrl</kbd>+<kbd>S</kbd>.</span>`}</p></div></div>`;
    $('#view').innerHTML = head + `<div class="vform"><div id="vErr"></div>${ITEM_TYPES.includes(F.type) ? itemFormHtml() : F.type === 'JV' ? journalFormHtml() : moneyFormHtml()}
        <div id="vWarn"></div>
        <div class="form-foot"><a class="btn btn-s" href="${editing ? `#/v/${F.id}` : 'javascript:history.back()'}">Cancel</a>${editing ? '' : '<button class="btn btn-s" id="vSaveNew">Save & new</button>'}<button class="btn btn-p" id="vSave">Save <kbd style="background:transparent;color:#fff;border-color:rgba(255,255,255,.4)">Ctrl S</kbd></button></div></div>`;
    wireForm();
    $('#vSave').onclick = () => submitVoucher(false);
    if ($('#vSaveNew')) $('#vSaveNew').onclick = () => submitVoucher(true);
}

function itemFormHtml() {
    const t = F.type, buy = t === 'PB' || t === 'DN';
    const partyTypes = buy ? ['vendor'] : ['customer'];
    const origType = t === 'CN' ? 'SI' : t === 'DN' ? 'PB' : null;
    return `<div class="card"><div class="fg">
        <label class="f">${buy ? 'Vendor' : 'Customer'} *<div class="row" style="flex-wrap:nowrap"><select id="f_party" style="flex:1">${contactOptions(partyTypes, F.partyId)}</select><button class="btn btn-s btn-sm" type="button" onclick="contactForm('${partyTypes[0]}',null,null,c=>{F.partyId=c.id;$('#f_party').innerHTML=contactOptions(['${partyTypes[0]}'],c.id);onParty()})">+</button></div><span class="hint" id="f_partyHint"></span></label>
        <label class="f">${t === 'PB' ? 'Bill date (as on supplier invoice)' : 'Date'} *<input id="f_date" type="date" value="${F.date}"></label>
        ${t === 'PB' ? `<label class="f">Supplier invoice no. *<input id="f_ref" value="${esc(F.refNo)}"></label>` : ''}
        ${origType ? `<label class="f">Against ${origType === 'SI' ? 'invoice' : 'bill'}<select id="f_orig"></select></label>
            <label class="f">Reason<select id="f_reason">${['Sales return', 'Post-sale discount', 'Rate difference', 'Deficiency in service', 'Correction in invoice'].map(r => opt(r, r, F.reason)).join('')}</select></label>` : ''}
        <label class="f">Place of supply<select id="f_pos">${stateOptions(F.pos || '')}</select><span class="hint" id="f_posHint"></span></label>
        ${t === 'SI' ? `<label class="f">TCS <span class="hint">Section 394 payment code</span><select id="f_tcs">${opt('', 'No TCS', F.tcs?.section)}${Object.keys(TCS_SECTIONS).map(k => opt(k, tcsName(k), F.tcs?.section)).join('')}</select><span class="hint" id="f_tcsHint"></span></label>` : ''}
        ${t === 'PB' ? `<label class="f">TDS payment code<select id="f_tds">${opt('', 'No TDS', F.tds?.section)}${Object.keys(TDS_SECTIONS).map(k => opt(k, tdsName(k), F.tds?.section)).join('')}</select><span class="hint" id="f_tdsHint"></span></label>
            <label class="chk"><input type="checkbox" id="f_rcm" ${F.rcm ? 'checked' : ''}> Reverse charge (we pay the GST)</label>
            <label class="chk"><input type="checkbox" id="f_itc" ${F.itc !== false ? 'checked' : ''}> Input tax credit eligible <span class="muted">(untick for blocked credit, s.17(5))</span></label>` : ''}
        ${t === 'SI' ? `<label class="chk" id="f_payWrap" hidden><input type="checkbox" id="f_withpay" ${F.zeroWithPay ? 'checked' : ''}> Export / SEZ with payment of IGST (refund route)</label>` : ''}
        ${!F.id && (t === 'SI' || t === 'PB') ? `<label class="f">${t === 'SI' ? 'Received now in' : 'Paid now from'} <span class="hint">Optional: records the ${t === 'SI' ? 'receipt' : 'payment'} too</span><select id="f_now">${opt('', 'Not yet (on credit)', F.nowAcc)}${cashBankAccounts().map(a => opt(a.id, a.name, F.nowAcc)).join('')}</select></label>` : ''}
        <label class="f wide">Narration<input id="f_narr" value="${esc(F.narration)}" placeholder="Optional note printed on the voucher"></label>
    </div></div>
    <div class="card"><div class="tw" style="border:none"><table class="lines"><thead><tr><th style="width:18%">Item</th><th>Description</th><th style="width:90px">HSN/SAC</th><th style="width:70px" class="num">Qty</th><th style="width:72px">Unit</th><th style="width:100px" class="num">Rate</th><th style="width:60px" class="num">Disc %</th><th style="width:76px">GST</th><th class="adv" style="width:14%">Ledger</th><th class="num">Taxable</th><th class="num">GST ₹</th><th class="num">Amount</th><th></th></tr></thead><tbody id="f_lines"></tbody></table></div>
    <div class="row" style="justify-content:space-between;align-items:flex-start;margin-top:12px"><div><button class="btn btn-s btn-sm" type="button" onclick="F.lines.push(blankLine());drawLines()">+ Add line</button> <button class="btn btn-g btn-sm" type="button" onclick="itemForm(null,i=>{drawLines()})">+ New item</button>
        ${t === 'PB' ? `<div style="margin-top:12px"><label class="f">Attach the bill (photo or PDF) <span class="hint">Kept with the voucher as the original document</span><input type="file" id="f_file" accept="image/*,application/pdf"></label><div class="note" id="f_fileHint">${F.attachmentFile ? `Attached: ${esc(F.attachmentFile.name)}` : F.attachment ? `On file: ${esc(F.attachment.name)}` : ''}</div></div>` : ''}</div>
    <div class="totals" id="f_totals"></div></div></div>`;
}
function moneyFormHtml() {
    const t = F.type;
    const counter = id => ledgerOf(id) && !['bank', 'cash'].includes(ledgerOf(id).group);
    return `<div class="card"><div class="fg">
        <label class="f">Date *<input id="f_date" type="date" value="${F.date}"></label>
        <label class="f">${t === 'CT' ? 'From' : t === 'RC' ? 'Received in' : 'Paid from'} *<select id="f_acc">${opt('', 'Choose cash / bank…', F.accountId)}${cashBankAccounts().map(a => opt(a.id, `${a.name} · ${drcr(balance(a.id))}`, F.accountId)).join('')}</select></label>
        ${t === 'CT' ? `<label class="f">To *<select id="f_to">${opt('', 'Choose cash / bank…', F.toId)}${cashBankAccounts().map(a => opt(a.id, a.name, F.toId)).join('')}</select></label>`
        : `<label class="f">${t === 'RC' ? 'Received from' : 'Paid to'} *<select id="f_who">${ledgerOptions(F.partyId || F.ledgerId, counter)}</select><span class="hint" id="f_whoHint"></span></label>`}
        <label class="f">Amount (₹) *<input id="f_amt" type="number" min="0" step="0.01" value="${F.amount || ''}"></label>
        ${t === 'RC' ? `<label class="f">TDS deducted by customer (₹) <span class="hint">Shows in your Form 26AS / AIS</span><input id="f_rtds" type="number" min="0" step="1" value="${F.tds?.amount || ''}"></label>` : ''}
        ${t === 'PY' ? `<label class="f tax-dep" hidden>Tax deducted / collected in<select id="f_taxMonth">${fyMonths(fyOf(addDays(F.date, -10))).map(m => opt(m, ymLabel(m), F.taxMonth || addMonths(ymOf(F.date), -1))).join('')}</select></label>
            <label class="f tax-dep" hidden>Challan BSR code <span class="hint">7 digits, on the challan receipt</span><input id="f_bsr" maxlength="7" inputmode="numeric" value="${esc(F.challan?.bsr)}"></label>
            <label class="f tax-dep" hidden>Challan serial no.<input id="f_cser" maxlength="5" inputmode="numeric" value="${esc(F.challan?.serial)}"></label>` : ''}
        <label class="f">Reference <span class="hint">Cheque / UTR / UPI ref</span><input id="f_ref" value="${esc(F.refNo)}"></label>
        <label class="f wide">Narration<input id="f_narr" value="${esc(F.narration)}"></label>
    </div></div>
    ${t !== 'CT' ? '<div class="card" id="f_allocCard" hidden><h2>Settle against bills</h2><div id="f_alloc"></div></div>' : ''}`;
}
function journalFormHtml() {
    return `<div class="card"><div class="fg"><label class="f">Date *<input id="f_date" type="date" value="${F.date}"></label><label class="f wide">Narration * <span class="hint">Explain the adjustment (auditors read this)</span><input id="f_narr" value="${esc(F.narration)}"></label></div></div>
    <div class="card"><table class="lines"><thead><tr><th>Ledger</th><th class="num" style="width:160px">Debit</th><th class="num" style="width:160px">Credit</th><th style="width:30px"></th></tr></thead><tbody id="f_jl"></tbody></table>
    <div class="row" style="justify-content:space-between;margin-top:12px"><button class="btn btn-s btn-sm" type="button" onclick="F.jlines.push({acc:'',dr:0,cr:0});drawJournal()">+ Add line</button><div class="totals" id="f_jt" style="width:340px"></div></div><div id="f_jAlert"></div></div>`;
}

function wireForm() {
    const on = (id, ev, fn) => { const el = $('#' + id); if (el) el[ev] = fn; };
    on('f_date', 'onchange', e => { F.date = e.target.value; refresh(); });
    on('f_narr', 'oninput', e => { F.narration = e.target.value; });
    on('f_ref', 'oninput', e => { F.refNo = e.target.value; });
    if (ITEM_TYPES.includes(F.type)) {
        on('f_party', 'onchange', e => { F.partyId = e.target.value; F.pos = ''; onParty(); });
        on('f_pos', 'onchange', e => { F.pos = e.target.value; refresh(); });
        on('f_orig', 'onchange', e => { F.origId = e.target.value; copyOriginal(); });
        on('f_reason', 'onchange', e => { F.reason = e.target.value; });
        on('f_tcs', 'onchange', e => { F.tcs = e.target.value ? { section: e.target.value } : null; F.tcsTouched = true; refresh(); });
        on('f_tds', 'onchange', e => { F.tds = e.target.value ? { section: e.target.value } : null; F.tdsTouched = true; refresh(); });
        on('f_rcm', 'onchange', e => { F.rcm = e.target.checked; refresh(); });
        on('f_itc', 'onchange', e => { F.itc = e.target.checked; refresh(); });
        on('f_withpay', 'onchange', e => { F.zeroWithPay = e.target.checked; refresh(); });
        on('f_now', 'onchange', e => { F.nowAcc = e.target.value; });
        on('f_file', 'onchange', e => { F.attachmentFile = e.target.files[0]; $('#f_fileHint').textContent = F.attachmentFile ? `Attached: ${F.attachmentFile.name}` : ''; });
        onParty(true);
        drawLines();
    } else if (F.type === 'JV') drawJournal();
    else {
        on('f_acc', 'onchange', e => { F.accountId = e.target.value; refresh(); });
        on('f_to', 'onchange', e => { F.toId = e.target.value; });
        on('f_amt', 'oninput', e => { F.amount = Number(e.target.value) || 0; autoAlloc(); });
        on('f_rtds', 'oninput', e => { F.tds = Number(e.target.value) ? { amount: Number(e.target.value) } : null; autoAlloc(); });
        on('f_taxMonth', 'onchange', e => { F.taxMonth = e.target.value; });
        on('f_bsr', 'oninput', e => { F.challan = { ...(F.challan || {}), bsr: e.target.value.trim() }; });
        on('f_cser', 'oninput', e => { F.challan = { ...(F.challan || {}), serial: e.target.value.trim() }; });
        on('f_who', 'onchange', e => { const l = ledgerOf(e.target.value); F.partyId = l?.kind === 'contact' ? l.id : ''; F.ledgerId = l?.kind === 'account' ? l.id : ''; F.alloc = []; drawAlloc(); refresh(); });
        drawAlloc();
        refresh();
    }
}
function onParty(first) {
    const p = contactById(F.partyId);
    const hint = $('#f_partyHint');
    if (hint) hint.textContent = p ? `${p.gstin ? 'Registered · ' + p.gstin : 'Unregistered'} · ${STATES[p.state] || ''}${p.msme ? ' · MSME' : ''} · balance ${drcr(balance(p.id))}` : '';
    if (p && !F.pos) F.pos = (F.type === 'PB' || F.type === 'DN') ? companyState() : (p.state === '96' ? '96' : p.state);
    if ($('#f_pos')) $('#f_pos').value = F.pos || '';
    if (F.type === 'SI' && p && !first && !F.tcsTouched) { F.tcs = p.tcsSection ? { section: p.tcsSection } : null; if ($('#f_tcs')) $('#f_tcs').value = p.tcsSection || ''; }
    if (F.type === 'PB' && p && !first && !F.tdsTouched) { const s = p.tdsSection; F.tds = s ? { section: s } : null; if ($('#f_tds')) $('#f_tds').value = s || ''; }
    if (F.type === 'PB' && p && !first && p.lastAcc) F.lines.forEach(l => { if (!l.itemId && !l.accId) l.accId = p.lastAcc; });
    const sel = $('#f_orig');
    if (sel) {
        const docs = co.vouchers.filter(v => v.type === (F.type === 'CN' ? 'SI' : 'PB') && v.partyId === F.partyId && v.status !== 'cancelled');
        sel.innerHTML = opt('', docs.length ? 'Choose…' : 'No documents for this party', F.origId) + docs.map(v => opt(v.id, `${v.no}${v.refNo ? ' (' + v.refNo + ')' : ''} · ${fmtDate(v.date)} · ${inr(billDue(v))} · open ${inr(outstanding(v, F.id))}`, F.origId)).join('');
    }
    const wrap = $('#f_payWrap');
    if (wrap) wrap.hidden = !(p && (p.state === '96' || p.sez));
    if (!first) drawLines(); else refresh();
}
function copyOriginal() {
    const o = vById(F.origId);
    if (o && (!F.lines.some(l => l.itemId || l.desc) || confirm('Copy the lines from the original document?'))) {
        F.lines = o.lines.map(l => ({ itemId: l.itemId, desc: l.desc, hsn: l.hsn, qty: l.qty, unit: l.unit, rate: l.rate, disc: l.disc, gstRate: l.gstRate, accId: l.accId }));
        F.pos = o.pos;
        if ($('#f_pos')) $('#f_pos').value = F.pos;
        drawLines();
    }
}
function drawLines() {
    const buy = F.type === 'PB' || F.type === 'DN';
    const accFilter = buy ? (l => ['purchase', 'direxp', 'indexp', 'fixed', 'empexp', 'fincost', 'curassets', 'loansadv'].includes(l.group)) : (l => ['sales', 'dirinc', 'indinc'].includes(l.group));
    const itemOpts = sel => opt('', '—', sel) + co.items.map(i => opt(i.id, i.name, sel)).join('');
    $('#f_lines').innerHTML = F.lines.map((l, i) => `<tr data-i="${i}">
        <td class="wide" data-l="Item ${i + 1}"><select data-k="itemId">${itemOpts(l.itemId)}</select></td>
        <td class="wide" data-l="Description"><input data-k="desc" value="${esc(l.desc)}"></td>
        <td class="half" data-l="HSN / SAC"><input data-k="hsn" value="${esc(l.hsn)}" maxlength="8" inputmode="numeric"></td>
        <td data-l="Qty"><input data-k="qty" class="num" type="number" min="0" step="0.001" inputmode="decimal" value="${l.qty}"></td>
        <td data-l="Unit"><select data-k="unit">${UNITS.map(u => opt(u, u, l.unit)).join('')}</select></td>
        <td class="half" data-l="Rate (₹)"><input data-k="rate" class="num" type="number" min="0" step="0.01" inputmode="decimal" value="${l.rate}"></td>
        <td data-l="Disc %"><input data-k="disc" class="num" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${l.disc || 0}"></td>
        <td data-l="GST"><select data-k="gstRate">${GST_RATES.map(r => opt(r, r + '%', l.gstRate)).join('')}</select></td>
        <td class="adv wide" data-l="Ledger"><select data-k="accId">${ledgerOptions(l.accId, accFilter, 'Default')}</select></td>
        <td class="calc half" data-l="Taxable" data-c="taxable"></td><td class="calc" data-l="GST ₹" data-c="tax"></td><td class="calc" data-l="Amount" data-c="amount"></td>
        <td class="del"><button class="btn btn-g btn-sm" type="button" title="Remove line" onclick="F.lines.splice(${i},1);if(!F.lines.length)F.lines.push(blankLine());drawLines()">×</button></td></tr>`).join('');
    $$('#f_lines [data-k]').forEach(el => {
        const ev = el.tagName === 'SELECT' ? 'onchange' : 'oninput';
        el[ev] = () => {
            const i = Number(el.closest('tr').dataset.i), k = el.dataset.k, L = F.lines[i];
            L[k] = ['qty', 'rate', 'disc', 'gstRate'].includes(k) ? Number(el.value) || 0 : el.value;
            if (k === 'itemId') {
                const it = itemById(el.value);
                if (it) { Object.assign(L, { desc: it.name, hsn: it.hsn, unit: it.unit, rate: (buy ? it.purchaseRate : it.rate) || L.rate, gstRate: it.gstRate, accId: '' }); drawLines(); return; }
            }
            refresh();
        };
        el.onkeydown = e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const all = $$('#f_lines input, #f_lines select').filter(x => x.offsetParent);
            const idx = all.indexOf(el);
            if (idx === all.length - 1) { F.lines.push(blankLine()); drawLines(); $$('#f_lines tr').at(-1).querySelector('select').focus(); }
            else all[idx + 1].focus();
        };
    });
    refresh();
}
function drawJournal() {
    $('#f_jl').innerHTML = F.jlines.map((l, i) => `<tr data-i="${i}"><td class="wide" data-l="Ledger ${i + 1}"><select data-k="acc">${ledgerOptions(l.acc)}</select></td><td class="half" data-l="Debit (₹)"><input data-k="dr" class="num" type="number" min="0" step="0.01" inputmode="decimal" value="${l.dr || ''}"></td><td class="half" data-l="Credit (₹)"><input data-k="cr" class="num" type="number" min="0" step="0.01" inputmode="decimal" value="${l.cr || ''}"></td><td class="del"><button class="btn btn-g btn-sm" type="button" onclick="F.jlines.splice(${i},1);drawJournal()">×</button></td></tr>`).join('');
    $$('#f_jl [data-k]').forEach(el => { el[el.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => { const L = F.jlines[Number(el.closest('tr').dataset.i)]; L[el.dataset.k] = el.dataset.k === 'acc' ? el.value : Number(el.value) || 0; refresh(); }; });
    refresh();
}
function drawAlloc() {
    const card = $('#f_allocCard');
    if (!card) return;
    const p = contactById(F.partyId);
    const billType = F.type === 'RC' ? 'SI' : 'PB';
    const bills = p ? openBills(p.id, billType, F.id) : [];
    // When editing, keep bills already settled by this voucher visible
    (F.alloc || []).forEach(a => { if (!bills.some(b => b.v.id === a.vid) && vById(a.vid)) bills.push({ v: vById(a.vid), due: outstanding(vById(a.vid), F.id) }); });
    card.hidden = !bills.length;
    if (!bills.length) return;
    F.alloc ||= [];
    $('#f_alloc').innerHTML = `<div class="tw"><table class="t"><thead><tr><th>Bill</th><th>Date</th><th>Due date</th><th class="n">Open</th><th class="n" style="width:150px">Settle now</th></tr></thead><tbody>${bills.map(b => {
        const a = F.alloc.find(x => x.vid === b.v.id);
        return `<tr><td>${esc(b.v.no)}${b.v.refNo ? ` <span class="muted">${esc(b.v.refNo)}</span>` : ''}</td><td>${fmtDate(b.v.date)}</td><td>${fmtDate(dueDate(b.v))}</td><td class="n">${num(b.due)}</td><td><input class="num" style="width:100%" type="number" min="0" step="0.01" data-vid="${b.v.id}" value="${a ? a.amt : ''}"></td></tr>`;
    }).join('')}</tbody></table></div><p class="note" style="margin-top:8px">Filled oldest-first automatically when you type the amount (FIFO). Any balance stays "on account".</p>`;
    $$('#f_alloc input').forEach(el => el.oninput = () => { F.alloc = F.alloc.filter(x => x.vid !== el.dataset.vid); if (Number(el.value) > 0) F.alloc.push({ vid: el.dataset.vid, amt: Number(el.value) }); refresh(); });
}
function autoAlloc() {
    const p = contactById(F.partyId);
    if (!p) return refresh();
    let left = r2((Number(F.amount) || 0) + (F.tds?.amount || 0));
    F.alloc = [];
    openBills(p.id, F.type === 'RC' ? 'SI' : 'PB', F.id).forEach(b => { if (left <= 0) return; const amt = r2(Math.min(left, b.due)); F.alloc.push({ vid: b.v.id, amt }); left = r2(left - amt); });
    drawAlloc();
    refresh();
}
function refresh() {
    const v = JSON.parse(JSON.stringify(F));
    delete v.attachmentFile;
    let warn = [];
    try { computeVoucher(v); warn = voucherWarnings(v); } catch (e) { console.warn(e); }
    if (ITEM_TYPES.includes(F.type)) {
        $$('#f_lines tr').forEach((tr, i) => { const l = v.lines[i]; if (!l) return; tr.querySelector('[data-c=taxable]').textContent = num(l.taxable); tr.querySelector('[data-c=tax]').textContent = num(l.cgst + l.sgst + l.igst); tr.querySelector('[data-c=amount]').textContent = num(l.amount); });
        const t = v.totals;
        const party = contactById(v.partyId);
        if ($('#f_tcsHint')) $('#f_tcsHint').textContent = v.tcs?.amount ? `₹${num(v.tcs.amount)} on ₹${num(v.tcs.base)} at ${v.tcs.rate}%${!party?.pan ? ' (no PAN: higher rate)' : ''}` : '';
        const ph = $('#f_posHint');
        if (ph) ph.textContent = !party ? '' : v.kind === 'EXP' || v.kind === 'SEZ' ? (v.zeroWithPay ? 'Zero-rated with IGST' : 'Zero-rated under LUT (no tax)') : t.inter ? 'Inter-state → IGST' : 'Intra-state → CGST + SGST';
        if (F.type === 'PB') {
            const s = tdsSuggested(v);
            $('#f_tdsHint').textContent = v.tds?.amount ? `Code ${tdsName(v.tds.section, true)} · ₹${num(v.tds.amount)} on ₹${num(v.tds.base)} at ${v.tds.rate}%${!party?.pan ? ' (no PAN: higher rate)' : ''}` : s ? `Threshold crossed: deduct under ${tdsName(s, true)}` : '';
            if (party && !isRegistered(party) && !v.rcm) warn.unshift('Unregistered supplier: no GST is charged on this bill, so no input credit.');
        }
        $('#f_totals').innerHTML = `<div><span>Taxable value</span><b>${num(t.taxable)}</b></div>
            ${t.cgst ? `<div><span>CGST</span><span>${num(t.cgst)}</span></div><div><span>SGST</span><span>${num(t.sgst)}</span></div>` : ''}${t.igst ? `<div><span>IGST</span><span>${num(t.igst)}</span></div>` : ''}
            ${v.rcm ? `<div><span>GST under reverse charge (paid by you)</span><span>${num(t.tax)}</span></div>` : ''}
            ${t.roundOff ? `<div><span>Round off</span><span>${num(t.roundOff)}</span></div>` : ''}
            <div class="big"><span>Total</span><span>${inr(t.total)}</span></div>
            ${v.tcs?.amount ? `<div><span>Add TCS ${esc(tcsName(v.tcs.section, true))} @ ${v.tcs.rate}%</span><span>${num(v.tcs.amount)}</span></div><div class="big"><span>Receivable</span><span>${inr(t.receivable)}</span></div>` : ''}
            ${v.tds?.amount ? `<div><span>Less TDS</span><span>−${num(v.tds.amount)}</span></div><div class="big"><span>Payable to vendor</span><span>${inr(t.payable)}</span></div>` : ''}
            <div class="note" style="border:none">${esc(inWords(t.total))}</div>`;
    } else if (F.type === 'JV') {
        const d = sum(F.jlines, l => Number(l.dr) || 0), c = sum(F.jlines, l => Number(l.cr) || 0);
        $('#f_jAlert').innerHTML = Math.abs(d - c) > 0.004 && (d || c) ? `<div class="errors" style="margin:12px 0 0">⚠ <b>${d > c ? 'Debit' : 'Credit'} exceeds ${d > c ? 'credit' : 'debit'} by ${inr(Math.abs(d - c))}.</b> Add ${inr(Math.abs(d - c))} on the ${d > c ? 'credit' : 'debit'} side or correct a line — the journal cannot be saved until it balances.</div>` : '';
        $('#f_jt').innerHTML = `<div><span>Total debit</span><b>${num(d)}</b></div><div><span>Total credit</span><b>${num(c)}</b></div><div class="big"><span>Difference</span><span style="color:${Math.abs(d - c) < 0.005 ? 'var(--good)' : 'var(--bad)'}">${num(d - c)}</span></div>`;
    } else {
        const wh = $('#f_whoHint');
        const l = ledgerOf(F.partyId || F.ledgerId);
        if (wh) wh.textContent = l ? `Balance ${drcr(balance(l.id))}` : '';
        const isTax = [sysId('tdsPay'), sysId('tcsPay')].includes(F.ledgerId);
        $$('.tax-dep').forEach(el => { el.hidden = !isTax; });
        if (isTax && !F.taxMonth) F.taxMonth = val('f_taxMonth');
    }
    if (F.type === 'JV') warn = warn.filter(w => !/exceeds (credit|debit) by/.test(w));   // shown under the totals instead
    $('#vWarn').innerHTML = warn.length ? `<div class="warns">${warn.map(w => `⚠ ${esc(w)}`).join('<br>')}</div>` : '';
}
async function submitVoucher(andNew) {
    const btn = $('#vSave');
    if (btn.disabled) return;
    if (F.type === 'JV') {
        const d = sum(F.jlines, l => Number(l.dr) || 0), c = sum(F.jlines, l => Number(l.cr) || 0);
        if (Math.abs(d - c) > 0.004) {
            modal({ title: 'Debit and credit do not match', body: `<p style="margin-bottom:10px">Total debit is <b>${inr(d)}</b> and total credit is <b>${inr(c)}</b>.</p><p><b>${d > c ? 'Debit' : 'Credit'} exceeds ${d > c ? 'credit' : 'debit'} by ${inr(Math.abs(d - c))}.</b> Add that amount on the ${d > c ? 'credit' : 'debit'} side or correct a line. A journal must balance before it can be saved.</p>`, foot: '<button class="btn btn-p" onclick="closeModal()">OK, I will fix it</button>' });
            return;
        }
    }
    if (F.type === 'JV' && (co.settings.prefs?.warnLargeJv ?? true)) {
        const limit = co.settings.prefs?.largeJv ?? 500000, d = sum(F.jlines, l => Number(l.dr) || 0);
        if (d > limit && !await ask({ title: 'Large journal', message: `This journal is for ${inr(d)}, above your limit of ${inr(limit)}. Journals of this size are usually checked by the auditor. Save it?`, ok: 'Yes, save' })) return;
    }
    const input = JSON.parse(JSON.stringify(F));
    const file = F.attachmentFile;
    delete input.attachmentFile;
    const nowAcc = input.nowAcc; delete input.nowAcc; delete input.tdsTouched;
    if (input.type === 'PY' && ![sysId('tdsPay'), sysId('tcsPay')].includes(input.ledgerId)) { delete input.taxMonth; delete input.challan; }
    else if (input.type === 'PY') input.taxMonth ||= val('f_taxMonth');
    delete input.tcsTouched;
    let reason = '';
    if (input.id) { reason = await ask({ title: 'Reason for change', message: 'Why is this entry being changed? It is recorded in the audit trail.', input: 'Reason', ok: 'Save change' }); if (reason === null) return; }
    btn.disabled = true;
    try {
        const v = saveVoucher(input, { reason, source: input.source || '' });
        if (file) {
            await files.put(`att:${v.id}`, file);
            v.attachment = { name: file.name, type: file.type, size: file.size };
            audit('Bill attached', { entity: 'Voucher', ref: v.no, after: file.name });
            saveCo();
        }
        if (nowAcc && (v.type === 'SI' || v.type === 'PB')) {
            const amt = billDue(v);
            const pv = saveVoucher({ type: v.type === 'SI' ? 'RC' : 'PY', date: v.date, accountId: nowAcc, partyId: v.partyId, amount: amt, alloc: [{ vid: v.id, amt }], narration: `Against ${v.no}` }, { source: 'Paid with the bill' });
            toast(`${v.no} saved with ${pv.no}.`);
        } else toast(`${v.no} saved.`);
        F = null;
        andNew ? viewVoucherForm({ type: v.type }) : go(`#/v/${v.id}`);
    } catch (err) {
        showErr('#vErr', err);
    } finally { if ($('#vSave')) $('#vSave').disabled = false; }
}

// ---------- voucher view ----------
function viewVoucher(id) {
    const v = vById(id);
    if (!v) { $('#view').innerHTML = errorsHtml('Voucher not found.'); return; }
    const T = VTYPES[v.type];
    const party = contactById(v.partyId);
    const P = postingsOf(v);
    const hist = co.audit.filter(a => a.ref === v.no).slice().reverse();
    const settlements = co.vouchers.filter(x => x.status !== 'cancelled' && ((x.alloc || []).some(a => a.vid === v.id) || x.origId === v.id));
    const actions = [];
    if (canEdit() && v.status !== 'cancelled') {
        if (!v.irn || v.irnCancelled) actions.push(`<a class="btn btn-s" href="#/edit/${v.id}">Edit</a>`);
        if (v.type === 'SI' && outstanding(v) > 0) actions.push(`<button class="btn btn-s" onclick="quickSettle('${v.id}')">Record receipt</button>`);
        if (v.type === 'PB' && outstanding(v) > 0) actions.push(`<button class="btn btn-s" onclick="quickSettle('${v.id}')">Record payment</button>`);
        if (v.type === 'SI') actions.push(`<button class="btn btn-s adv" onclick="noteFrom('${v.id}')">Credit note</button>`);
        if (v.type === 'PB') actions.push(`<button class="btn btn-s adv" onclick="noteFrom('${v.id}')">Debit note</button>`);
        if (einvoiceApplies(v) && !v.irn) actions.push(`<button class="btn btn-s" onclick="doIrn('${v.id}')">Generate IRN</button>`);
        if (ewbNeeded(v) && !v.ewb) actions.push(`<button class="btn btn-s" onclick="ewbForm('${v.id}')">e-Way bill</button>`);
        actions.push(`<button class="btn btn-g" onclick="doCancel('${v.id}')">Cancel</button>`);
    }
    if (['SI', 'CN'].includes(v.type) && ['B2B', 'SEZ', 'EXP'].includes(v.kind)) actions.push(`<button class="btn btn-s adv" onclick="if (gate('einvoice')) download('${v.no.replace(/\//g, '-')}-einvoice.json', JSON.stringify(einvoiceJson(vById('${v.id}')), null, 2), 'application/json')">${ic('dl')} e-Invoice JSON</button>`);
    if (party?.phone && ['SI', 'CN', 'RC'].includes(v.type)) actions.push(`<a class="btn btn-s" target="_blank" rel="noopener" onclick="return gate('whatsapp')" href="https://wa.me/91${party.phone}?text=${encodeURIComponent(waText(v))}">${ic('msg')} WhatsApp</a>`);
    actions.push(`<button class="btn btn-p" onclick="printVoucher('${v.id}')">${ic('print')} Print / PDF</button>`);
    const t = v.totals;
    $('#view').innerHTML = `<div class="page-head"><div><h1>${esc(T.name)} ${esc(v.no)} ${v.status === 'cancelled' ? '<span class="badge bad">Cancelled</span>' : billStatus(v)}</h1>
        <p>${fmtDate(v.date)} · ${esc(ledgerOf(v.partyId || v.ledgerId || v.toId)?.name || '')}${v.refNo ? ` · Ref ${esc(v.refNo)}` : ''} · created by ${esc(v.createdBy || '')}${v.updatedBy ? `, last changed by ${esc(v.updatedBy)}` : ''}</p></div><div class="row">${actions.join('')}</div></div>
        ${v.status === 'cancelled' ? `<div class="errors">Cancelled on ${fmtDate((v.cancelledAt || '').slice(0, 10))} by ${esc(v.cancelledBy || '')}: ${esc(v.cancelReason)}. The number is kept and reported in GSTR-1 as cancelled; it has no effect on the books.</div>` : ''}
        ${v.irn ? `<div class="warns" style="background:var(--info-soft);color:var(--info)"><b>IRN${v.irnTest ? ' (TEST — not registered with the government)' : ''}:</b> <span style="word-break:break-all">${esc(v.irn)}</span><br>Ack no. ${esc(v.ackNo)} · ${esc(new Date(v.ackDt).toLocaleString('en-IN'))}${v.irnCancelled ? ' · IRN CANCELLED' : ''}</div>` : ''}
        ${v.ewb ? `<div class="warns" style="background:var(--info-soft);color:var(--info)"><b>e-Way bill${v.ewb.test ? ' (TEST)' : ''}:</b> ${esc(v.ewb.no)} · ${esc(v.ewb.vehicle)} · ${v.ewb.distance} km · valid till ${fmtDate(v.ewb.validUpto)}</div>` : ''}
        <div class="grid g3">
        <div class="card" style="grid-column:span 2">
            ${ITEM_TYPES.includes(v.type) ? `<div class="tw"><table class="t"><thead><tr><th class="hide-m">#</th><th>Item / description</th><th class="hide-m">HSN</th><th class="n">Qty</th><th class="n hide-m">Rate</th><th class="n hide-m">Taxable</th><th class="n hide-m">GST</th><th class="n hide-m">Tax</th><th class="n">Amount</th></tr></thead><tbody>
                ${v.lines.map((l, i) => `<tr><td class="hide-m">${i + 1}</td><td style="white-space:normal">${esc(l.desc || itemById(l.itemId)?.name || '')}</td><td class="hide-m">${esc(l.hsn)}</td><td class="n">${l.qty} ${esc(l.unit)}</td><td class="n hide-m">${num(l.rate)}</td><td class="n hide-m">${num(l.taxable)}</td><td class="n hide-m">${l.effRate ?? l.gstRate}%</td><td class="n hide-m">${num(l.cgst + l.sgst + l.igst)}</td><td class="n">${num(l.amount)}</td></tr>`).join('')}
                </tbody></table></div>
                <div class="totals" style="margin-top:12px"><div><span>Taxable</span><b>${num(t.taxable)}</b></div>${t.cgst ? `<div><span>CGST</span><span>${num(t.cgst)}</span></div><div><span>SGST</span><span>${num(t.sgst)}</span></div>` : ''}${t.igst ? `<div><span>IGST</span><span>${num(t.igst)}</span></div>` : ''}${t.roundOff ? `<div><span>Round off</span><span>${num(t.roundOff)}</span></div>` : ''}<div class="big"><span>Total</span><span>${inr(t.total)}</span></div>${v.tcs?.amount ? `<div><span>TCS ${esc(tcsName(v.tcs.section, true))} @ ${v.tcs.rate}%</span><span>${num(v.tcs.amount)}</span></div><div class="big"><span>Receivable</span><span>${inr(t.receivable)}</span></div>` : ''}${v.tds?.amount ? `<div><span>TDS ${esc(tdsName(v.tds.section, true))} @ ${v.tds.rate}%</span><span>−${num(v.tds.amount)}</span></div>` : ''}</div>
                <p class="note" style="margin-top:8px">${esc({ B2B: 'B2B supply', B2C: 'B2C supply', EXP: 'Export', SEZ: 'Supply to SEZ' }[v.kind] || '')} · Place of supply ${esc(stateName(v.pos))} · ${t.inter ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}${v.rcm ? ' · Reverse charge' : ''}${v.itc === false ? ' · ITC not claimed' : ''}${v.origId ? ` · Against ${esc(vById(v.origId)?.no || '')}` : ''}${v.reason ? ` · ${esc(v.reason)}` : ''}</p>`
            : `<div class="found"><dt>Amount</dt><dd><b>${inr(v.amount ?? t.total)}</b> (${esc(inWords(v.amount ?? t.total))})</dd>${v.tds?.amount ? `<dt>TDS deducted by customer</dt><dd>${inr(v.tds.amount)}</dd>` : ''}${v.taxMonth ? `<dt>Tax for the month of</dt><dd>${ymLabel(v.taxMonth)}</dd>` : ''}${v.challan?.bsr ? `<dt>Challan</dt><dd>BSR ${esc(v.challan.bsr)} · serial ${esc(v.challan.serial)}</dd>` : ''}${v.narration ? `<dt>Narration</dt><dd>${esc(v.narration)}</dd>` : ''}</div>`}
            ${v.narration && ITEM_TYPES.includes(v.type) ? `<p class="note" style="margin-top:6px">${esc(v.narration)}</p>` : ''}
        </div>
        <div class="card"><h2>Accounting entry</h2><div class="tw"><table class="t"><thead><tr><th>Ledger</th><th class="n">Dr</th><th class="n">Cr</th></tr></thead><tbody>${P.map(p => `<tr><td><button class="link" onclick="reportState.ledger='${p.acc}';go('#/report/ledger')">${esc(ledgerOf(p.acc)?.name || '?')}</button></td>${amtCell(p.dr)}${amtCell(p.cr)}</tr>`).join('') || '<tr><td colspan="3" class="muted">No postings (cancelled)</td></tr>'}</tbody><tfoot><tr><td>Total</td><td class="n">${num(sum(P, 'dr'))}</td><td class="n">${num(sum(P, 'cr'))}</td></tr></tfoot></table></div>
            ${v.attachment ? `<div style="margin-top:12px"><button class="btn btn-s btn-sm" onclick="openAttachment('${v.id}')">📎 ${esc(v.attachment.name)}</button></div>` : ''}
            ${(v.alloc || []).length ? `<h2 style="margin-top:14px">Settled bills</h2>${v.alloc.map(a => `<div class="note"><a href="#/v/${a.vid}">${esc(vById(a.vid)?.no || '')}</a> · ${inr(a.amt)}</div>`).join('')}` : ''}
            ${settlements.length ? `<h2 style="margin-top:14px">Payments & notes</h2>${settlements.map(x => `<div class="note"><a href="#/v/${x.id}">${esc(x.no)}</a> · ${fmtDate(x.date)} · ${inr(x.origId === v.id ? x.totals.total : x.alloc.find(a => a.vid === v.id).amt)}</div>`).join('')}` : ''}
        </div></div>
        <div class="grid g2" style="margin-top:16px">
            <div class="card"><h2>Auditor queries</h2><div id="qList">${queriesHtml(v)}</div>
                <div class="row" style="margin-top:10px"><input id="qText" placeholder="${me.role === 'auditor' ? 'Raise a query on this entry' : 'Add a note or reply'}" style="flex:1"><button class="btn btn-s" onclick="addQuery('${v.id}')">Post</button></div></div>
            <div class="card"><h2>Change history (audit trail)</h2>${hist.map(a => `<div class="note" style="padding:6px 0;border-bottom:1px dashed var(--line)"><b>${esc(a.action)}</b> · ${esc(a.user)} · ${new Date(a.at).toLocaleString('en-IN')}${a.reason ? `<br>Reason: ${esc(a.reason)}` : ''}${a.after ? `<br><span class="muted">${esc(a.after)}</span>` : ''}</div>`).join('') || '<p class="note">No history.</p>'}</div>
        </div>`;
}
function queriesHtml(v) {
    return (v.queries || []).map(q => `<div style="padding:8px 0;border-bottom:1px dashed var(--line)"><span class="badge ${q.status === 'open' ? 'warn' : 'good'}">${q.status}</span> <b>${esc(q.by)}</b> <span class="muted">${new Date(q.at).toLocaleString('en-IN')}</span><div>${esc(q.text)}</div>${q.status === 'open' && canEdit() ? `<button class="link" onclick="resolveQuery('${v.id}','${q.id}')">Mark resolved</button>` : ''}</div>`).join('') || '<p class="note">No queries. Auditors can raise one here; staff reply and resolve.</p>';
}
function addQuery(vid) {
    const v = vById(vid), text = val('qText');
    if (!text) return;
    (v.queries ||= []).push({ id: uid('q'), by: `${me.name} (${ROLES[me.role]})`, at: new Date().toISOString(), text, status: 'open' });
    audit('Query raised', { entity: 'Voucher', ref: v.no, after: text });
    saveCo(); route();
}
function resolveQuery(vid, qid) {
    const v = vById(vid), q = v.queries.find(x => x.id === qid);
    q.status = 'resolved'; q.resolvedBy = me.name;
    audit('Query resolved', { entity: 'Voucher', ref: v.no, after: q.text });
    saveCo(); route();
}
async function openAttachment(vid) {
    try {
        const f = await files.get(`att:${vid}`);
        if (!f) return toast('The attached file is not in this browser.');
        const url = URL.createObjectURL(f);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast('Could not open the file.'); }
}
function quickSettle(id) {
    const v = vById(id);
    const amt = outstanding(v);
    F = null;
    viewVoucherForm({ type: v.type === 'SI' ? 'RC' : 'PY', partyId: v.partyId, amount: amt, alloc: [{ vid: v.id, amt }], accountId: cashBankAccounts().find(a => a.group === 'bank')?.id || sysId('cash'), narration: `Against ${v.no}` });
    history.replaceState(null, '', `#/new/${v.type === 'SI' ? 'RC' : 'PY'}`);
}
function noteFrom(id) {
    const v = vById(id);
    F = null;
    viewVoucherForm({ type: v.type === 'SI' ? 'CN' : 'DN', partyId: v.partyId, origId: v.id, pos: v.pos, lines: v.lines.map(l => ({ itemId: l.itemId, desc: l.desc, hsn: l.hsn, qty: l.qty, unit: l.unit, rate: l.rate, disc: l.disc, gstRate: l.gstRate, accId: l.accId })) });
    history.replaceState(null, '', `#/new/${v.type === 'SI' ? 'CN' : 'DN'}`);
}
async function doCancel(id) {
    const v = vById(id);
    const reason = await ask({ title: `Cancel ${v.no}?`, message: 'The number is kept (GST requires unbroken series) and the entry stops affecting the books. This cannot be undone.', input: 'Reason', ok: 'Cancel voucher', danger: true });
    if (reason === null) return;
    try { cancelVoucher(id, reason); toast(`${v.no} cancelled.`); route(); } catch (err) { alert(err.message); }
}
function doIrn(id) {
    if (!gate('einvoice')) return;
    try { generateIrn(id); toast('IRN generated (test).'); route(); } catch (err) { alert(err.message); }
}
function ewbForm(id) {
    if (!gate('ewaybill')) return;
    modal({
        title: 'e-Way bill', body: `<div id="ewErr"></div><div class="fg"><label class="f">Vehicle no.<input id="ew_v" placeholder="TN01AB1234" style="text-transform:uppercase"></label><label class="f">Distance (km)<input id="ew_d" type="number" min="1"></label><label class="f">Mode<select id="ew_m"><option>Road</option><option>Rail</option><option>Air</option><option>Ship</option></select></label></div><p class="note" style="margin-top:10px">Validity: 1 day per 200 km for normal cargo. Test number only.</p>`,
        foot: `<button class="btn btn-s" onclick="closeModal()">Cancel</button><button class="btn btn-p" id="ewOk">Generate</button>`,
        onOpen: () => $('#ewOk').onclick = () => { try { generateEwb(id, { vehicle: val('ew_v'), distance: val('ew_d'), mode: val('ew_m') }); closeModal(); route(); } catch (e) { showErr('#ewErr', e); } }
    });
}
function waText(v) {
    const p = co.profile, c = contactById(v.partyId);
    const vals = { customer: c?.name, company: p.name, invoices: `${VTYPES[v.type].name} ${v.no} dated ${fmtDate(v.date)}`, amount: inr(v.type === 'RC' ? v.amount : billDue(v)), due: v.type === 'SI' ? fmtDate(dueDate(v)) : '', upi: p.upi ? ` by UPI to ${p.upi}` : (p.bankAcc ? ` to ${p.bankName} A/c ${p.bankAcc} IFSC ${p.bankIfsc}` : '') };
    if (v.type === 'RC') return fillTemplate('waReceipt', vals);
    if (v.type === 'SI' && outstanding(v) > 0 && dueDate(v) < todayISO()) return fillTemplate('waReminder', { ...vals, amount: inr(outstanding(v)) });
    return fillTemplate('waInvoice', vals);
}

// ---------- printable documents (CGST Rule 46 fields on the tax invoice) ----------
function printVoucher(id) {
    const v = vById(id), p = co.profile, b = contactById(v.partyId);
    audit('Voucher printed', { entity: 'Voucher', ref: v.no });
    saveCo();
    if (!ITEM_TYPES.includes(v.type)) {
        const P = postingsOf(v);
        return printHtml(`<div class="inv"><h1>${VTYPES[v.type].name.toUpperCase()}</h1><table class="nob"><tr><td><b>${esc(p.name)}</b><br>${esc(p.address)} ${esc(p.city)}</td><td class="n">No. <b>${esc(v.no)}</b><br>Date ${fmtDate(v.date)}</td></tr></table><br>
            <table><thead><tr><th>Ledger</th><th class="n">Debit</th><th class="n">Credit</th></tr></thead><tbody>${P.map(x => `<tr><td>${esc(ledgerOf(x.acc).name)}</td><td class="n">${x.dr ? num(x.dr) : ''}</td><td class="n">${x.cr ? num(x.cr) : ''}</td></tr>`).join('')}</tbody></table>
            <p style="margin-top:8px">${esc(inWords(v.amount ?? v.totals.total))}</p>${v.narration ? `<p>Narration: ${esc(v.narration)}</p>` : ''}${v.refNo ? `<p>Reference: ${esc(v.refNo)}</p>` : ''}
            <table class="nob" style="margin-top:40px"><tr><td>Prepared by: ${esc(v.createdBy || '')}</td><td class="n">Authorised signatory</td></tr></table></div>`);
    }
    const title = v.type === 'SI' ? (v.kind === 'EXP' || v.kind === 'SEZ' ? 'TAX INVOICE (EXPORT / SEZ)' : v.totals.tax === 0 && !v.rcm ? 'BILL OF SUPPLY' : 'TAX INVOICE') : v.type === 'CN' ? 'CREDIT NOTE' : v.type === 'DN' ? 'DEBIT NOTE' : 'PURCHASE VOUCHER';
    const inter = v.totals.inter;
    const hsn = {};
    v.lines.forEach(l => { const k = `${l.hsn}|${l.effRate}`; const h = hsn[k] ||= { hsn: l.hsn, rate: l.effRate, tx: 0, c: 0, s: 0, i: 0 }; h.tx += l.taxable; h.c += l.cgst; h.s += l.sgst; h.i += l.igst; });
    const seller = v.type === 'PB' || v.type === 'DN' ? b : null;
    const orig = vById(v.origId);
    const design = hasFeature('invoiceDesign');
    const due = v.type === 'SI' ? outstanding(v) : 0;
    const upiLink = design && v.type === 'SI' && p.upi && due > 0 ? `upi://pay?pa=${encodeURIComponent(p.upi)}&pn=${encodeURIComponent(p.name)}&am=${due.toFixed(2)}&cu=INR&tn=${encodeURIComponent(v.no)}` : '';
    printHtml(`<div class="inv">
        <table class="nob"><tr><td style="width:60%">${design && p.logo ? `<img src="${p.logo}" alt="" style="height:58px;float:left;margin:0 12px 6px 0">` : ''}<b style="font-size:16px">${esc(p.legalName || p.name)}</b>${p.legalName && p.legalName !== p.name ? `<br>(${esc(p.name)})` : ''}<br>${esc(p.address)}${p.city ? ', ' + esc(p.city) : ''}${p.pincode ? ' – ' + esc(p.pincode) : ''}<br>GSTIN: <b>${esc(p.gstin || 'Unregistered')}</b> · State: ${esc(stateName(p.state))}<br>${p.phone ? 'Ph: ' + esc(p.phone) : ''} ${p.email ? ' · ' + esc(p.email) : ''}</td>
        <td class="n">${v.irn ? `<div style="font-size:9px;word-break:break-all">IRN: ${esc(v.irn)}${v.irnTest ? ' (TEST)' : ''}<br>Ack No: ${esc(v.ackNo)} · ${fmtDate(v.ackDt.slice(0, 10))}</div>` : ''}${v.ewb ? `<div style="font-size:10px">e-Way bill: ${esc(v.ewb.no)}</div>` : ''}<div style="font-size:10px">${v.type === 'SI' ? (p.copies === 'triplicate' ? 'Original for recipient / Duplicate for transporter / Triplicate for supplier' : 'Original for recipient') : ''}</div></td></tr></table>
        <h1>${title}</h1>
        <table><tr><td style="width:50%"><b>${seller ? 'Supplier' : 'Bill to (recipient)'}</b><br>${esc(b.name)}<br>${esc(b.address || '')}${b.city ? ', ' + esc(b.city) : ''}<br>GSTIN: ${esc(b.gstin || 'Unregistered')}<br>State: ${esc(stateName(b.state))}</td>
        <td>${title.includes('NOTE') ? 'Note' : 'Invoice'} No: <b>${esc(v.no)}</b><br>Date: <b>${fmtDate(v.date)}</b>${v.refNo ? `<br>Supplier invoice: ${esc(v.refNo)}` : ''}${orig ? `<br>Against: ${esc(orig.no)} dated ${fmtDate(orig.date)}` : ''}<br>Place of supply: ${esc(stateName(v.pos))}<br>Reverse charge: ${v.rcm ? 'Yes' : 'No'}${v.kind === 'EXP' || v.kind === 'SEZ' ? `<br>${v.zeroWithPay ? 'Supply on payment of IGST' : 'Supply meant for export / SEZ under LUT without payment of IGST'}` : ''}</td></tr></table>
        <table style="margin-top:6px"><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="n">Qty</th><th>Unit</th><th class="n">Rate</th><th class="n">Disc</th><th class="n">Taxable</th>${inter ? '<th class="n">IGST %</th><th class="n">IGST</th>' : '<th class="n">CGST %</th><th class="n">CGST</th><th class="n">SGST %</th><th class="n">SGST</th>'}<th class="n">Total</th></tr></thead><tbody>
        ${v.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.desc || itemById(l.itemId)?.name || '')}</td><td>${esc(l.hsn)}</td><td class="n">${l.qty}</td><td>${esc(l.unit)}</td><td class="n">${num(l.rate)}</td><td class="n">${l.discAmt ? num(l.discAmt) : ''}</td><td class="n">${num(l.taxable)}</td>${inter ? `<td class="n">${l.effRate}</td><td class="n">${num(l.igst)}</td>` : `<td class="n">${l.effRate / 2}</td><td class="n">${num(l.cgst)}</td><td class="n">${l.effRate / 2}</td><td class="n">${num(l.sgst)}</td>`}<td class="n">${num(l.taxable + l.cgst + l.sgst + l.igst)}</td></tr>`).join('')}
        <tr><td colspan="7" class="n"><b>Total</b></td><td class="n"><b>${num(v.totals.taxable)}</b></td>${inter ? `<td></td><td class="n"><b>${num(v.totals.igst)}</b></td>` : `<td></td><td class="n"><b>${num(v.totals.cgst)}</b></td><td></td><td class="n"><b>${num(v.totals.sgst)}</b></td>`}<td class="n"><b>${num(v.totals.taxable + v.totals.tax)}</b></td></tr></tbody></table>
        <table style="margin-top:6px"><tr><td style="width:60%">Amount in words: <b>${esc(inWords(v.totals.total))}</b><br>Tax in words: ${esc(inWords(v.totals.tax))}</td><td><table class="nob"><tr><td>Taxable value</td><td class="n">${num(v.totals.taxable)}</td></tr><tr><td>Total tax</td><td class="n">${num(v.totals.tax)}</td></tr>${v.totals.roundOff ? `<tr><td>Round off</td><td class="n">${num(v.totals.roundOff)}</td></tr>` : ''}<tr><td><b>Grand total</b></td><td class="n"><b>₹ ${num(v.totals.total)}</b></td></tr>${v.tcs?.amount ? `<tr><td>TCS ${esc(tcsName(v.tcs.section, true))} @ ${v.tcs.rate}%</td><td class="n">${num(v.tcs.amount)}</td></tr><tr><td><b>Amount receivable</b></td><td class="n"><b>₹ ${num(v.totals.receivable)}</b></td></tr>` : ''}</table></td></tr></table>
        <table style="margin-top:6px"><thead><tr><th>HSN/SAC</th><th class="n">Taxable</th><th class="n">Rate</th>${inter ? '<th class="n">IGST</th>' : '<th class="n">CGST</th><th class="n">SGST</th>'}<th class="n">Total tax</th></tr></thead><tbody>${Object.values(hsn).map(h => `<tr><td>${esc(h.hsn)}</td><td class="n">${num(h.tx)}</td><td class="n">${h.rate}%</td>${inter ? `<td class="n">${num(h.i)}</td>` : `<td class="n">${num(h.c)}</td><td class="n">${num(h.s)}</td>`}<td class="n">${num(h.c + h.s + h.i)}</td></tr>`).join('')}</tbody></table>
        <table class="nob" style="margin-top:10px"><tr><td style="width:60%;font-size:11px">${p.bankAcc && v.type === 'SI' && p.showBank !== 'no' ? `Bank: ${esc(p.bankName)} · A/c ${esc(p.bankAcc)} · IFSC ${esc(p.bankIfsc)}<br>` : ''}${v.type === 'SI' ? esc(p.terms || '') : ''}${v.type === 'SI' && p.invoiceNote ? `<br>${esc(p.invoiceNote)}` : ''}${p.jurisdiction ? `<br>${esc(p.jurisdiction)}` : ''}${v.narration ? `<br>${esc(v.narration)}` : ''}<br>${co.profile.gstType === 'composition' && v.type === 'SI' ? '<b>Composition taxable person, not eligible to collect tax on supplies.</b><br>' : ''}Declaration: we declare that this invoice shows the actual price of the goods / services described and that all particulars are true and correct.</td>
        <td class="n" style="vertical-align:bottom">${upiLink ? '<div id="upiQr" style="text-align:right;margin-bottom:6px"></div>' : ''}For <b>${esc(p.name)}</b><br>${design && p.signature ? `<img src="${p.signature}" alt="" style="height:42px;margin:4px 0">` : '<br><br>'}<br>Authorised signatory</td></tr></table>
        <p style="text-align:center;font-size:9px;color:#666;margin-top:8px">Generated by We Create ERP${v.irnTest ? ' · TEST IRN – not a valid e-invoice' : ''}</p></div>`, upiLink ? () => upiQrInto('#upiQr', upiLink, due) : null);
}

// ---------- scan a bill ----------
let scan = null;
function viewScan() {
    if (!canEdit()) { $('#view').innerHTML = errorsHtml('Your role is read-only.'); return; }
    scan = null;
    $('#view').innerHTML = pageHead('Scan a bill', 'Upload a photo or PDF of a bill. The ERP reads it, decides whether it is a purchase (you are the buyer) or a sale (you are the seller) from the GSTINs, finds or creates the party, and fills the voucher. You check it and save; everything else (ledgers, GST, TDS, statements) follows automatically.')
        + `<div class="grid g2"><div class="card">
            <label class="drop" id="drop"><input type="file" id="scanFile" accept="image/*,application/pdf" capture="environment" hidden>${ic('cam')}<b>Drop a bill here, or tap to take a photo</b><span class="note">JPG, PNG or PDF · reading needs internet the first time</span></label>
            <div id="scanProg" hidden style="margin-top:14px"><div class="note" id="scanMsg">Reading…</div><div class="progress" style="margin-top:6px"><i id="scanBar"></i></div></div>
            <details style="margin-top:14px"><summary class="note" style="cursor:pointer">No photo? Paste the bill text instead</summary><textarea id="scanText" rows="7" style="width:100%;margin-top:8px" placeholder="Paste the text of the bill"></textarea><button class="btn btn-s btn-sm" style="margin-top:8px" onclick="processText($('#scanText').value, null)">Read this text</button></details>
            <div id="scanPrev" style="margin-top:14px"></div></div>
        <div class="card"><h2>What the ERP found</h2><div id="scanOut"><p class="note">Upload a bill to begin.</p></div></div></div>`;
    const drop = $('#drop'), input = $('#scanFile');
    input.onchange = () => input.files[0] && processFile(input.files[0]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); };
}
async function processFile(file) {
    if (limitReached('scans')) return upgradePrompt(`More than ${planLimits().scans} bill scans a month`);
    if (file.size > 10 * 1024 * 1024) return toast('Please use a file under 10 MB.');
    $('#scanProg').hidden = false;
    $('#scanPrev').innerHTML = /^image\//.test(file.type) ? `<img class="scan-img" src="${URL.createObjectURL(file)}" alt="Bill">` : `<p class="note">📄 ${esc(file.name)}</p>`;
    try {
        const text = await readBillFile(file, (p, m) => { $('#scanBar').style.width = p + '%'; $('#scanMsg').textContent = `${m}… ${p}%`; });
        $('#scanBar').style.width = '100%';
        $('#scanMsg').textContent = 'Done';
        processText(text, file);
    } catch (err) {
        $('#scanMsg').textContent = err.message;
        $('#scanOut').innerHTML = errorsHtml(err) + '<p class="note">You can still paste the bill text, or enter it with F9.</p>';
    }
}
function processText(text, file) {
    if (file || text) { meta.scans ||= {}; meta.scans[ymOf(todayISO())] = scansThisMonth() + 1; saveMeta(); }
    const p = parseInvoiceText(text);
    const d = draftFromBill(p);
    scan = { p, d, file };
    const party = contactById(d.v.partyId);
    const row = (k, v, ok = true) => `<dt>${k}</dt><dd>${v ? esc(v) : '<span class="badge warn">not found</span>'}${!ok ? ' <span class="badge warn">check</span>' : ''}</dd>`;
    $('#scanOut').innerHTML = `<div class="row" style="margin-bottom:10px"><span class="badge ${d.type === 'PB' ? 'warn' : 'good'}" style="font-size:13px">${d.type === 'PB' ? 'Purchase (you are the buyer)' : 'Sale (you are the seller)'}</span><span class="badge ${p.confidence >= 4 ? 'good' : p.confidence >= 2 ? 'warn' : 'bad'}">Read quality ${p.confidence}/5</span></div>
        <dl class="found">${row('GSTINs', p.gstins.join(', '))}${row(d.type === 'PB' ? 'Supplier' : 'Customer', party ? `${party.name} (existing)` : d.newParty ? `${d.newParty.name} — new, will be created` : p.sellerName)}
        ${row('Invoice no.', p.invoiceNo)}${row('Date', p.date && fmtDate(p.date))}${row('HSN / SAC', p.hsn.join(', '))}${row('Taxable value', p.taxable != null ? inr(p.taxable) : '')}
        ${row('GST', p.tax ? `${inr(p.tax)} (${p.igst ? 'IGST' : 'CGST + SGST'})` : '')}${row('Rate', p.rate != null ? p.rate + '%' : '')}${row('Bill total', p.total != null ? inr(p.total) : '')}</dl>
        ${p.checks.length ? `<div class="warns">${p.checks.map(esc).join('<br>')}</div>` : ''}
        ${d.newParty ? `<label class="f" style="margin-top:12px">Name for the new ${d.type === 'PB' ? 'vendor' : 'customer'}<input id="np_name" value="${esc(d.newParty.name)}"></label>` : ''}
        ${!party && !d.newParty ? `<label class="f" style="margin-top:12px">Choose the ${d.type === 'PB' ? 'vendor' : 'customer'}<select id="np_pick">${contactOptions([d.type === 'PB' ? 'vendor' : 'customer'], '')}</select></label>` : ''}
        <div class="row" style="margin-top:14px"><button class="btn btn-p" onclick="scanToVoucher()">Continue to ${d.type === 'PB' ? 'purchase bill' : 'sales invoice'} →</button><button class="btn btn-g btn-sm" onclick="modal({title:'Text read from the bill',body:'<pre style=&quot;white-space:pre-wrap;font-size:12px&quot;>'+esc(scan.p.text)+'</pre>',wide:true})">See raw text</button></div>
        <p class="note" style="margin-top:10px">Nothing is saved until you press Save on the next screen. The bill file is attached to the voucher as the original document.</p>`;
}
function scanToVoucher() {
    const { d, file } = scan;
    try {
        if (d.newParty) {
            const c = saveContact({ ...d.newParty, name: val('np_name') || d.newParty.name, creditDays: 30 });
            d.v.partyId = c.id;
        } else if (!d.v.partyId && val('np_pick')) d.v.partyId = val('np_pick');
    } catch (err) { return alert(err.message); }
    const party = contactById(d.v.partyId);
    if (party) {
        d.v.pos = d.type === 'PB' ? companyState() : party.state;
        if (d.type === 'PB' && party.tdsSection) d.v.tds = { section: party.tdsSection };
        if (party.lastAcc && !d.v.lines[0].itemId) d.v.lines[0].accId = party.lastAcc;
    }
    d.v.source = 'Scanned bill';
    pendingDraft = { v: d.v, file };
    go(`#/new/${d.type}`);
}

// UPI payment QR on the invoice (scanned by any UPI app; amount pre-filled)
async function upiQrInto(sel, link, amount) {
    try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
        const div = document.createElement('div');
        new window.QRCode(div, { text: link, width: 110, height: 110, correctLevel: window.QRCode.CorrectLevel.M });
        const src = div.querySelector('canvas')?.toDataURL() || div.querySelector('img')?.src;
        const box = $(sel);
        if (box && src) box.innerHTML = `<img src="${src}" alt="UPI QR" style="width:96px;height:96px"><div style="font-size:9px">Scan to pay ${inr(amount)} by UPI</div>`;
    } catch (e) { /* offline: invoice prints without the QR */ }
}
