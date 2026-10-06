'use strict';
// ===================== We Create ERP · shell, sign-in, dashboard, masters =====================

const state = { fy: null, mode: 'advanced' };
let charts = [];
const ic = n => `<svg class="i"><use href="#i-${n}"/></svg>`;
const go = h => { if (location.hash === h) route(); else location.hash = h; };

// ---------- small UI helpers ----------
function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 3600);
}
function modal({ title, body, foot = '', wide = false, onOpen }) {
    const d = $('#dlg');
    d.className = wide ? 'wide' : '';
    d.innerHTML = `<div class="dh"><h3>${esc(title)}</h3><button class="x" onclick="closeModal()" aria-label="Close">×</button></div><div class="db">${body}</div>${foot ? `<div class="df">${foot}</div>` : ''}`;
    if (!d.open) d.showModal();
    onOpen && onOpen(d);
    return d;
}
const closeModal = () => $('#dlg').open && $('#dlg').close();
function errorsHtml(err) {
    const list = err?.list || String(err?.message || err).split('\n');
    return `<div class="errors">${list.length > 1 ? `<b>Please fix:</b><ul>${list.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : esc(list[0])}</div>`;
}
function showErr(box, err) {
    const el = typeof box === 'string' ? $(box) : box;
    if (el) { el.innerHTML = errorsHtml(err); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    else alert(err.message || err);
}
function ask({ title, message, input, ok = 'Confirm', danger = false, value = '' }) {
    return new Promise(resolve => {
        let done = false;
        const finish = v => { if (done) return; done = true; closeModal(); resolve(v); };
        modal({
            title,
            body: `<p style="white-space:pre-line;margin-bottom:12px">${esc(message)}</p>${input ? `<label class="f">${esc(input)}<input id="askIn" value="${esc(value)}"></label><div id="askErr"></div>` : ''}`,
            foot: `<button class="btn btn-s" id="askNo">Cancel</button><button class="btn ${danger ? 'btn-d' : 'btn-p'}" id="askOk">${esc(ok)}</button>`,
            onOpen: d => {
                $('#askNo').onclick = () => finish(input ? null : false);
                d.oncancel = e => { e.preventDefault(); finish(input ? null : false); };
                $('#askOk').onclick = () => {
                    if (!input) return finish(true);
                    const v = $('#askIn').value.trim();
                    if (!v) { $('#askErr').innerHTML = errorsHtml('This is required.'); return; }
                    finish(v);
                };
                setTimeout(() => (input ? $('#askIn') : $('#askOk')).focus(), 30);
            }
        });
    });
}
const val = id => ($('#' + id)?.value ?? '').trim();
const numv = id => Number($('#' + id)?.value) || 0;
const chk = id => Boolean($('#' + id)?.checked);
const opt = (v, label, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(label)}</option>`;
const stateOptions = sel => Object.entries(STATES).filter(([c]) => c !== '96').map(([c, n]) => opt(c, `${c} – ${n}`, sel)).join('') + opt('96', '96 – Foreign Country (export)', sel);
function ledgerOptions(sel, filter = () => true, blank = 'Choose…') {
    const groups = {};
    allLedgers().filter(filter).sort((a, b) => a.name.localeCompare(b.name)).forEach(l => (groups[l.group] ||= []).push(l));
    return (blank ? opt('', blank, sel) : '') + Object.entries(groups).map(([g, ls]) => `<optgroup label="${esc(GROUPS[g].name)}">${ls.map(l => opt(l.id, l.name, sel)).join('')}</optgroup>`).join('');
}
const contactOptions = (types, sel, blank = 'Choose party…') => opt('', blank, sel) + co.contacts.filter(c => types.includes(c.type) || c.type === 'both').sort((a, b) => a.name.localeCompare(b.name)).map(c => opt(c.id, `${c.name}${c.gstin ? ' · ' + c.gstin : ' · Unregistered'}`, sel)).join('');
function tableCSV(tableEl, name) {
    const rows = [...tableEl.querySelectorAll('tr')].map(tr => [...tr.children].map(td => td.innerText.replace(/\s+/g, ' ').replace(/[₹−]/g, m => m === '−' ? '-' : '').trim()));
    download(`${name}.csv`, '﻿' + toCSV(rows), 'text/csv');
}
function printHtml(html, prepare) {
    $('#printArea').innerHTML = html;
    Promise.resolve(prepare && prepare()).finally(() => setTimeout(() => window.print(), 50));
}
const amtCell = n => `<td class="n">${Math.abs(n) < 0.005 ? '—' : num(n)}</td>`;
const drcr = n => Math.abs(n) < 0.005 ? '—' : `${num(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}`;
const pageHead = (title, desc, actions = '') => `<div class="page-head"><div><h1>${esc(title)}</h1>${desc ? `<p>${desc}</p>` : ''}</div><div class="row">${actions}</div></div>`;

// ---------- boot & auth ----------
async function boot() {
    loadMeta();
    await store.init();
    try { state.mode = localStorage.getItem('wcerp.mode') || 'advanced'; } catch (e) { /* ignore */ }
    window.addEventListener('hashchange', route);
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', e => { if (!e.target.closest('.usermenu')) $('#umenu').classList.remove('open'); if (!e.target.closest('.search')) $('#qres').classList.remove('open'); });
    wireSearch();
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem('wcerp.session') || 'null'); } catch (e) { /* ignore */ }
    const u = s && meta.users.find(x => x.id === s.uid && x.active !== false);
    if (u && Date.now() - s.last < 30 * 60000) { me = u; enterApp(); }
    else showAuth();
    setInterval(() => { const mins = co?.settings?.prefs?.idleMinutes || 30; if (me && Date.now() - (state.last || Date.now()) > mins * 60000) signOut(`Signed out after ${mins} minutes without activity.`); }, 30000);
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { state.last = Date.now(); if (me) try { sessionStorage.setItem('wcerp.session', JSON.stringify({ uid: me.id, last: Date.now() })); } catch (e) { /* ignore */ } }, { passive: true }));
}
function showAuth(msg = '') {
    $('#app').hidden = true;
    const a = $('#auth');
    a.hidden = false;
    const first = !meta.users.length;
    a.innerHTML = `<form class="auth-card" id="authForm" autocomplete="off">
        <div class="brandmark"><div class="logo">WC</div><div><b>We Create ERP</b><span>Accounting · GST · TDS · Audit</span></div></div>
        ${first ? `<h2>Set up your workspace</h2><p class="lead">Create the owner account. You can add companies, staff and your auditor after this.</p>
            <div class="fg" style="grid-template-columns:1fr">
            <label class="f">Your name<input id="a_name" required></label>
            <label class="f">Username<input id="a_user" required autocomplete="username"></label>
            <label class="f">Password <span class="hint">At least ${MIN_PASSWORD} characters</span><input id="a_pass" type="password" autocomplete="new-password"></label>
            <label class="f">Type the password again<input id="a_pass2" type="password" autocomplete="new-password"></label>
            <label class="chk"><input type="checkbox" id="a_sample" checked> Add sample companies to try it out (a trading company, plus STAY BAY and Eco Pack connected to their dashboards)</label></div>`
        : `<h2>Sign in</h2><p class="lead">${esc(msg) || 'Welcome back.'}</p>
            <div class="fg" style="grid-template-columns:1fr">
            <label class="f">Username<input id="a_user" autocomplete="username" autofocus></label>
            <label class="f">Password<input id="a_pass" type="password" autocomplete="current-password"></label></div>`}
        <div id="authErr" style="margin-top:12px"></div>
        <button class="btn btn-p" style="width:100%;justify-content:center;margin-top:10px;padding:11px">${first ? 'Create account' : 'Sign in'}</button>
        ${first ? '' : '<div style="text-align:center;margin-top:12px"><button type="button" class="link" onclick="showForgot()">Forgot username or password?</button></div>'}
        <p class="note" style="margin-top:14px;text-align:center">Test build ${APP_VERSION} · data stays in this browser</p></form>`;
    $('#authForm').onsubmit = e => {
        e.preventDefault();
        try { first ? setupOwner() : signIn(); } catch (err) { showErr('#authErr', err); }
    };
    setTimeout(() => $('#a_' + (first ? 'name' : 'user'))?.focus(), 30);
}
function setupOwner() {
    const E = [];
    const name = val('a_name'), user = val('a_user').toLowerCase(), pass = $('#a_pass').value;
    if (!name) E.push('Enter your name.');
    if (!/^[a-z0-9._-]{3,30}$/.test(user)) E.push('Username: 3–30 letters, digits, dot, dash or underscore.');
    if (pass.length < MIN_PASSWORD) E.push(`Password must be at least ${MIN_PASSWORD} characters.`);
    if (pass !== $('#a_pass2').value) E.push('The passwords do not match.');
    if (E.length) { const e = new Error(); e.list = E; throw e; }
    const salt = randomHex(16);
    me = { id: uid('u'), name, username: user, role: 'admin', salt, hash: hashPassword(pass, salt), companies: 'all', active: true, created: new Date().toISOString() };
    meta.users.push(me);
    subscription();   // 14-day trial of the Professional plan
    auditMeta('Owner account created', { entity: 'User', ref: user });
    const code = setRecovery(me);
    saveMeta();
    if (chk('a_sample')) createSampleWorkspace();
    enterApp();
    showRecoveryCode(code, 'This is your recovery code. If you ever forget your username or password, use it on the sign-in screen under "Forgot username or password?". It is shown only once.');
}
// ---------- password recovery: a one-time recovery code (the server version will use OTP to mobile / email) ----------
const RC_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I, so it is hard to misread
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function newRecoveryCode() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => RC_CHARS[b % 32]).join('').match(/.{4}/g).join('-');
}
function setRecovery(u) {
    const code = newRecoveryCode();
    u.recSalt = randomHex(16);
    u.recHash = hashPassword(normCode(code), u.recSalt);
    u.recCreated = new Date().toISOString();
    return code;
}
function showRecoveryCode(code, message) {
    modal({
        title: 'Save your recovery code',
        body: `<p style="margin-bottom:12px">${esc(message)}</p>
            <div style="font:700 24px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.08em;text-align:center;padding:16px;border:2px dashed var(--brand);border-radius:12px;background:var(--brand-soft)" id="rcCode">${esc(code)}</div>
            <div class="row" style="justify-content:center;margin:12px 0"><button class="btn btn-s btn-sm" id="rcCopy">Copy</button><button class="btn btn-s btn-sm" id="rcDl">${ic('dl')} Download as a file</button></div>
            <p class="note">Keep it somewhere safe outside this computer (a notebook, or your phone's notes). Anyone with this code and access to this computer can reset the owner's password. Each code works once.</p>
            <label class="chk" style="margin-top:12px"><input type="checkbox" id="rcOk"> I have saved my recovery code</label>`,
        foot: `<button class="btn btn-p" id="rcDone" disabled>Done</button>`,
        onOpen: d => {
            d.oncancel = e => e.preventDefault();
            d.querySelector('.x').hidden = true;   // must confirm the code is saved
            $('#rcCopy').onclick = () => { navigator.clipboard?.writeText(code).then(() => toast('Copied.'), () => toast('Copy failed — write it down instead.')); };
            $('#rcDl').onclick = () => download('we-create-erp-recovery-code.txt', `We Create ERP recovery code\nUsername: ${me?.username || ''}\nCode: ${code}\nCreated: ${new Date().toLocaleString('en-IN')}\n\nUse it on the sign-in screen: "Forgot username or password?". It works once.`);
            $('#rcOk').onchange = e => { $('#rcDone').disabled = !e.target.checked; };
            $('#rcDone').onclick = () => closeModal();
        }
    });
}
function promptRecovery() {
    modal({
        title: 'Set up password recovery',
        body: `<p>Your account has no recovery code yet. Create one now so you can reset your password if you forget it.</p>`,
        foot: `<button class="btn btn-s" onclick="closeModal()">Later</button><button class="btn btn-p" onclick="createRecoveryNow()">Create recovery code</button>`
    });
}
function createRecoveryNow() {
    const replacing = Boolean(me.recHash);
    const code = setRecovery(me);
    auditMeta(replacing ? 'Recovery code replaced' : 'Recovery code created', { entity: 'User', ref: me.username });
    saveMeta();
    showRecoveryCode(code, replacing ? 'Your new recovery code. The old one no longer works.' : 'This is your recovery code. If you forget your username or password, use it on the sign-in screen under "Forgot username or password?".');
    if (location.hash === '#/dashboard') setTimeout(() => { if (!$('#dlg').open) route(); }, 0);
}
async function newRecoveryWithPassword() {
    $('#umenu').classList.remove('open');
    const pw = await new Promise(resolve => modal({
        title: 'New recovery code', body: `<p style="margin-bottom:10px">Enter your password to create a new recovery code. The old code will stop working.</p><label class="f">Password<input id="rpw" type="password"></label><div id="rpwErr"></div>`,
        foot: `<button class="btn btn-s" id="rpwNo">Cancel</button><button class="btn btn-p" id="rpwOk">Continue</button>`,
        onOpen: () => { $('#rpwNo').onclick = () => { closeModal(); resolve(null); }; $('#rpwOk').onclick = () => { if (hashPassword($('#rpw').value, me.salt) !== me.hash) return showErr('#rpwErr', 'Wrong password.'); resolve(true); }; setTimeout(() => $('#rpw').focus(), 30); }
    }));
    if (pw) createRecoveryNow();
}
function showForgot() {
    const a = $('#auth');
    a.innerHTML = `<form class="auth-card" id="fgForm" autocomplete="off">
        <div class="brandmark"><div class="logo">WC</div><div><b>We Create ERP</b><span>Reset your password</span></div></div>
        <p class="lead">Enter the recovery code you saved when the owner account was created. You will see your username and can choose a new password.</p>
        <div class="fg" style="grid-template-columns:1fr">
            <label class="f">Recovery code<input id="fg_code" placeholder="XXXX-XXXX-XXXX-XXXX" style="text-transform:uppercase;letter-spacing:.06em" autocomplete="off"></label>
            <label class="f">Username <span class="hint">Leave blank if you have forgotten it</span><input id="fg_user" autocomplete="username"></label>
            <label class="f">New password <span class="hint">At least ${MIN_PASSWORD} characters</span><input id="fg_pass" type="password" autocomplete="new-password"></label>
            <label class="f">Type the new password again<input id="fg_pass2" type="password" autocomplete="new-password"></label></div>
        <div id="fgErr" style="margin-top:12px"></div>
        <button class="btn btn-p" style="width:100%;justify-content:center;margin-top:10px;padding:11px">Reset password</button>
        <div style="text-align:center;margin-top:12px"><button type="button" class="link" onclick="showAuth()">← Back to sign in</button></div>
        <p class="note" style="margin-top:14px">Staff accounts (accountant, auditor): ask the owner to set a new password in Settings → Users & roles.</p></form>`;
    $('#fgForm').onsubmit = e => { e.preventDefault(); try { recoverWithCode(val('fg_code'), val('fg_user'), $('#fg_pass').value, $('#fg_pass2').value); } catch (err) { showErr('#fgErr', err); } };
    setTimeout(() => $('#fg_code').focus(), 30);
}
// Checks the code against the account(s), sets the new password, signs in and issues a fresh code.
function recoverWithCode(code, username, pass, pass2) {
    meta.guard ||= {};
    const g = meta.guard.__recover || { n: 0, until: 0 };
    if (g.until > Date.now()) throw new Error(`Too many wrong codes. Try again in ${Math.ceil((g.until - Date.now()) / 60000)} minute(s).`);
    const E = [];
    if (normCode(code).length !== 16) E.push('The recovery code has 16 letters and digits (like K7QM-4XPN-8RTB-2WCE).');
    if (pass.length < MIN_PASSWORD) E.push(`The new password must be at least ${MIN_PASSWORD} characters.`);
    if (pass !== pass2) E.push('The two new passwords do not match.');
    if (E.length) { const e = new Error(E.join('\n')); e.list = E; throw e; }
    const user = String(username || '').trim().toLowerCase();
    const u = meta.users.find(x => x.active !== false && x.recHash && (!user || x.username === user) && hashPassword(normCode(code), x.recSalt) === x.recHash);
    if (!u) {
        g.n++;
        if (g.n >= 5) { g.until = Date.now() + 15 * 60000; g.n = 0; }
        meta.guard.__recover = g;
        auditMeta('Password reset failed (wrong recovery code)', { entity: 'User', ref: user || '(username not given)' });
        throw new Error(user ? 'That recovery code does not match this username.' : 'That recovery code is not valid.');
    }
    delete meta.guard.__recover;
    delete meta.guard[u.username];
    u.salt = randomHex(16);
    u.hash = hashPassword(pass, u.salt);
    me = u;
    const fresh = setRecovery(u);   // codes are single-use
    u.lastLogin = new Date().toISOString();
    auditMeta('Password reset with recovery code', { entity: 'User', ref: u.username, after: 'New password set; new recovery code issued' });
    saveMeta();
    enterApp();
    showRecoveryCode(fresh, `Password changed. Your username is "${u.username}". Your old recovery code has now been used up — here is a new one.`);
    return u;
}
function signIn() {
    const user = val('a_user').toLowerCase(), pass = $('#a_pass').value;
    meta.guard ||= {};
    const g = meta.guard[user] || { n: 0, until: 0 };
    if (g.until > Date.now()) throw new Error(`Too many attempts. Try again in ${Math.ceil((g.until - Date.now()) / 60000)} minute(s).`);
    const u = meta.users.find(x => x.username === user && x.active !== false);
    if (!u || hashPassword(pass, u.salt) !== u.hash) {
        g.n++;
        if (g.n >= 5) { g.until = Date.now() + 5 * 60000; g.n = 0; }
        meta.guard[user] = g;
        auditMeta('Sign-in failed', { entity: 'User', ref: user });
        throw new Error('Wrong username or password.');
    }
    delete meta.guard[user];
    me = u;
    u.lastLogin = new Date().toISOString();
    auditMeta('Signed in', { entity: 'User', ref: user });
    enterApp();
    if (u.role === 'admin' && !u.recHash) setTimeout(promptRecovery, 300);
}
function signOut(msg = '') {
    if (me) auditMeta('Signed out', { entity: 'User', ref: me.username });
    me = null; co = null;
    try { sessionStorage.removeItem('wcerp.session'); } catch (e) { /* ignore */ }
    closeModal();
    showAuth(msg);
}
function enterApp() {
    try { sessionStorage.setItem('wcerp.session', JSON.stringify({ uid: me.id, last: Date.now() })); } catch (e) { /* ignore */ }
    state.last = Date.now();
    $('#auth').hidden = true;
    $('#app').hidden = false;
    $('#uName').textContent = me.name;
    $('#uRole').textContent = ROLES[me.role];
    applyMode();
    const allowed = userCompanies();
    const pick = allowed.find(c => c.id === meta.lastCompany) || allowed[0];
    if (pick && openCompany(pick.id)) { state.fy = defaultFy(); setTimeout(autoSync, 50); if (!location.hash || location.hash === '#/companies') location.hash = '#/dashboard'; }
    else location.hash = '#/companies';
    route();
}
const userCompanies = () => meta.companies.filter(c => me.companies === 'all' || (me.companies || []).includes(c.id));
function defaultFy() {
    const f = fyOf(todayISO());
    return Math.max(fyOf(co.profile.booksFrom), f);
}
function setFy(y) { state.fy = Number(y); route(); }
function setMode(m) {
    state.mode = m;
    try { localStorage.setItem('wcerp.mode', m); } catch (e) { /* ignore */ }
    applyMode();
    route();
}
function applyMode() {
    document.body.classList.toggle('basic', state.mode === 'basic');
    $$('.mode button').forEach(b => b.classList.toggle('on', b.dataset.m === state.mode));
}
async function changePassword() {
    modal({
        title: 'Change password',
        body: `<div class="fg" style="grid-template-columns:1fr"><label class="f">Current password<input id="pw0" type="password"></label><label class="f">New password (${MIN_PASSWORD}+ characters)<input id="pw1" type="password"></label><label class="f">Again<input id="pw2" type="password"></label></div><div id="pwErr" style="margin-top:10px"></div>`,
        foot: `<button class="btn btn-s" onclick="closeModal()">Cancel</button><button class="btn btn-p" id="pwOk">Change</button>`,
        onOpen: () => $('#pwOk').onclick = () => {
            if (hashPassword($('#pw0').value, me.salt) !== me.hash) return showErr('#pwErr', 'Current password is wrong.');
            if ($('#pw1').value.length < MIN_PASSWORD || $('#pw1').value !== $('#pw2').value) return showErr('#pwErr', `New password must be ${MIN_PASSWORD}+ characters and typed the same twice.`);
            me.salt = randomHex(16); me.hash = hashPassword($('#pw1').value, me.salt);
            auditMeta('Password changed', { entity: 'User', ref: me.username });
            closeModal(); toast('Password changed.');
        }
    });
}

// ---------- routing ----------
const ROUTES = [
    [/^#\/companies$/, () => viewCompanies(), true],
    [/^#\/dashboard$/, () => viewDashboard()],
    [/^#\/business$/, () => viewBusiness()],
    [/^#\/open\/(staybay|ecopack)$/, m => openLinked(m[1]), true],
    [/^#\/(sales|purchases|notes|receipts|payments|journals)$/, m => viewVoucherList(m[1])],
    [/^#\/new\/(SI|PB|CN|DN|RC|PY|JV|CT|SJ)$/, m => viewVoucherForm({ type: m[1] })],
    [/^#\/edit\/(.+)$/, m => viewVoucherForm(vById(m[1]))],
    [/^#\/v\/(.+)$/, m => viewVoucher(m[1])],
    [/^#\/(customers|vendors)$/, m => viewContacts(m[1])],
    [/^#\/items$/, () => viewItems()],
    [/^#\/accounts$/, () => viewAccounts()],
    [/^#\/scan$/, () => viewScan()],
    [/^#\/reports$/, () => viewReports()],
    [/^#\/report\/([\w-]+)$/, m => viewReport(m[1])],
    [/^#\/gst(?:\/(\w+))?$/, m => viewGst(m[1] || 'plan')],
    [/^#\/tds$/, () => viewTds()],
    [/^#\/bank$/, () => viewBank()],
    [/^#\/calendar$/, () => viewCalendar()],
    [/^#\/audit$/, () => viewAudit()],
    [/^#\/settings(?:\/(\w+))?$/, m => viewSettings(m[1] || 'company')],
    [/^#\/billing$/, () => viewBilling(), true],
    [/^#\/payroll$/, () => viewPayroll()],
    [/^#\/connect$/, () => viewConnect()],
    [/^#\/manual$/, () => viewManual(), true]
];
function route() {
    if (!me) return;
    charts.forEach(c => c.destroy());
    charts = [];
    document.body.classList.remove('side-open');
    const h = location.hash || '#/dashboard';
    const r = ROUTES.find(([re]) => re.test(h));
    if (!r) return go('#/dashboard');
    if (!r[2] && !co) return go('#/companies');
    renderChrome();
    try { r[1](h.match(r[0])); }
    catch (err) { console.error(err); $('#view').innerHTML = errorsHtml(err); }
    window.scrollTo(0, 0);
}
function renderChrome() {
    $('#topCo').textContent = co ? co.profile.name : 'Choose a company';
    $('#topGstin').textContent = co ? (co.profile.gstin || 'GSTIN not set') : '';
    $('#sideCo').textContent = co ? co.profile.name : '';
    if (co) {
        const y0 = fyOf(co.profile.booksFrom), y1 = Math.max(fyOf(todayISO()), y0);
        state.fy ||= defaultFy();
        $('#fySel').innerHTML = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).map(y => opt(y, `FY ${fyLabel(y)}`, state.fy)).join('');
        $('#fySel').hidden = false;
    } else $('#fySel').hidden = true;
    const h = location.hash;
    const items = co ? healthCheck() : [];
    const nav = [
        ['Overview'],
        ['#/dashboard', 'home', 'Dashboard'],
        ['#/companies', 'building', 'All companies'],
        ['#/business', 'shield', 'Business profile'],
        ['Transactions'],
        ['#/sales', 'file', 'Sales', 'F8'],
        ['#/purchases', 'cart', 'Purchases', 'F9'],
        ['#/scan', 'cam', 'Scan bills'],
        ['#/receipts', 'in', 'Receipts', 'F6'],
        ['#/payments', 'out', 'Payments', 'F5'],
        ['#/notes', 'swap', 'Credit / Debit notes', '', 'adv'],
        ['#/journals', 'book', 'Journal & Contra', 'F7', 'adv'],
        ['Masters'],
        ['#/customers', 'users', 'Customers'],
        ['#/vendors', 'users', 'Vendors'],
        ['#/items', 'box', 'Items & services'],
        ['#/accounts', 'list', 'Chart of accounts'],
        ['#/payroll', 'users', 'Payroll'],
        ['#/connect', 'swap', 'Connected dashboards'],
        ['Compliance'],
        ['#/gst', 'receipt', 'GST', '', '', items.filter(i => /e-invoice|2B|e-way/.test(i.text)).length],
        ['#/tds', 'receipt', 'TDS', '', 'adv'],
        ['#/calendar', 'cal', 'Due dates', '', '', items.filter(i => /overdue/.test(i.text)).length],
        ['#/bank', 'bank', 'Bank reconciliation', '', 'adv', 0, 'bankRecon'],
        ['Reports'],
        ['#/reports', 'chart', 'Reports & statements'],
        ['#/audit', 'shield', 'Audit trail'],
        ['Help & account'],
        ['#/manual', 'book', 'User manual'],
        ['#/billing', 'card', 'Plan & billing'],
        ['#/settings', 'gear', 'Settings']
    ];
    $('#nav').innerHTML = nav.map(n => n.length === 1 ? `<div class="nav-group">${n[0]}</div>`
        : `<a href="${n[0]}" class="${(h === n[0] || (n[0] !== '#/dashboard' && h.startsWith(n[0] + '/'))) ? 'on' : ''} ${n[4] || ''}">${ic(n[1])}${n[2]}${n[6] && !hasFeature(n[6]) ? '<span class="k">🔒</span>' : n[5] ? `<span class="cnt">${n[5]}</span>` : n[3] ? `<span class="k">${n[3]}</span>` : ''}</a>`).join('');
    $('#planBadge').textContent = planStatus();
    $('#sidePlan').textContent = planStatus();
    $$('#bnav a').forEach(a => a.classList.toggle('on', h === a.dataset.r || h.startsWith(a.dataset.r + '/') || (a.dataset.r === '#/report' && h === '#/reports')));
}

// ---------- keyboard (Tally-style) ----------
function onKey(e) {
    if (!me || $('#app').hidden) return;
    if ($('#dlg').open) return;
    const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    const map = { F4: 'CT', F5: 'PY', F6: 'RC', F7: 'JV', F8: e.ctrlKey ? 'CN' : 'SI', F9: e.ctrlKey ? 'DN' : 'PB' };
    if (map[e.key] && co) { e.preventDefault(); if (canEdit()) go(`#/new/${map[e.key]}`); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'Enter') && $('#vSave')) { e.preventDefault(); $('#vSave').click(); return; }
    if (e.key === '/' && !typing) { e.preventDefault(); $('#q').focus(); }
    if (e.key === 'Escape' && location.hash.startsWith('#/new') && !typing) history.back();
}
// Phone "+" button: everything you can add, in one tap
function quickAdd() {
    if (!co) return go('#/companies');
    if (!canEdit()) return toast('Your role is read-only.');
    const b = (href, icon, label, sub, cls = '') => `<a class="status-option ${cls}" href="${href}" onclick="closeModal()" style="text-decoration:none">${ic(icon)}<span><b>${label}</b><small style="display:block;color:var(--ink-3)">${sub}</small></span></a>`;
    modal({
        title: 'Add new', body: `<div style="display:grid;gap:8px">${b('#/new/SI', 'file', 'Sales invoice', 'Bill a customer')}${b('#/scan', 'cam', 'Scan bills', 'Photos of bills → posted entries')}${b('#/new/PB', 'cart', 'Purchase bill', 'A supplier\'s bill')}${b('#/new/RC', 'in', 'Receipt', 'Money received')}${b('#/new/PY', 'out', 'Payment', 'Money paid')}${b('#/new/CN', 'swap', 'Credit / debit note', 'Returns and discounts', 'adv')}${b('#/new/JV', 'book', 'Journal', 'Adjustments', 'adv')}${b('#/new/CT', 'bank', 'Contra', 'Cash ↔ bank', 'adv')}</div>`
    });
}
function showShortcuts() {
    $('#umenu').classList.remove('open');
    modal({
        title: 'Keyboard shortcuts', body: `<table class="t">${[['F8', 'New sales invoice'], ['F9', 'New purchase bill'], ['Ctrl + F8', 'Credit note (sales return)'], ['Ctrl + F9', 'Debit note (purchase return)'], ['F6', 'Receipt'], ['F5', 'Payment'], ['F7', 'Journal'], ['F4', 'Contra (cash ↔ bank)'], ['Ctrl + S or Ctrl + Enter', 'Save the voucher'], ['Enter', 'Next field in a voucher line'], ['/', 'Search everything'], ['Esc', 'Close / go back']].map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('')}</table><p class="note" style="margin-top:10px">Same keys as Tally, so staff trained on Tally can work at the same speed.</p>`
    });
}

// ---------- global search ----------
function wireSearch() {
    const q = $('#q'), box = $('#qres');
    let hits = [], hi = 0;
    const draw = () => { box.innerHTML = hits.map((h, i) => `<a href="${h.href}" class="${i === hi ? 'hi' : ''}"><span>${esc(h.title)}</span><small>${esc(h.sub)}</small></a>`).join('') || '<div class="note" style="padding:10px">Nothing found</div>'; box.classList.add('open'); };
    q.addEventListener('input', () => {
        const s = q.value.trim().toLowerCase();
        if (!s || !co) { box.classList.remove('open'); return; }
        hits = [];
        co.vouchers.forEach(v => {
            const p = ledgerOf(v.partyId || v.ledgerId || v.accountId);
            const hay = `${v.no} ${v.refNo || ''} ${p?.name || ''} ${v.totals?.total || ''} ${v.narration || ''}`.toLowerCase();
            if (hay.includes(s)) hits.push({ href: `#/v/${v.id}`, title: `${v.no} · ${p?.name || ''}`, sub: `${VTYPES[v.type].short} · ${fmtDate(v.date)} · ${inr(v.totals?.total || 0)}${v.status === 'cancelled' ? ' · cancelled' : ''}` });
        });
        co.contacts.forEach(c => { if (`${c.name} ${c.gstin} ${c.phone || ''}`.toLowerCase().includes(s)) hits.push({ href: `#/${c.type === 'vendor' ? 'vendors' : 'customers'}`, title: c.name, sub: `${c.type} · balance ${drcr(balance(c.id))}` }); });
        co.items.forEach(i => { if (`${i.name} ${i.hsn}`.toLowerCase().includes(s)) hits.push({ href: '#/items', title: i.name, sub: `Item · HSN ${i.hsn} · GST ${i.gstRate}%` }); });
        co.accounts.forEach(a => { if (a.name.toLowerCase().includes(s)) hits.push({ href: '#/report/ledger', title: a.name, sub: `Ledger · ${drcr(balance(a.id))}`, ledger: a.id }); });
        hits = hits.slice(0, 14); hi = 0; draw();
    });
    q.addEventListener('keydown', e => {
        if (!box.classList.contains('open')) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hits.length - 1, hi + 1); draw(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(0, hi - 1); draw(); }
        if (e.key === 'Enter' && hits[hi]) { e.preventDefault(); if (hits[hi].ledger) reportState.ledger = hits[hi].ledger; go(hits[hi].href); box.classList.remove('open'); q.value = ''; }
        if (e.key === 'Escape') { box.classList.remove('open'); q.blur(); }
    });
    box.addEventListener('click', e => { const a = e.target.closest('a'); if (a) { const h = hits.find(x => x.href === a.getAttribute('href')); if (h?.ledger) reportState.ledger = h.ledger; box.classList.remove('open'); q.value = ''; } });
}

// ---------- practice workspace (all companies) ----------
function editCompany(id) {
    if (co?.id !== id && !openCompany(id)) return;
    state.fy = defaultFy();
    companyForm(true);
}
async function deleteCompany(id) {
    const c = meta.companies.find(x => x.id === id), d = loadCo(id);
    if (!c) return;
    const name = d?.profile?.name || c.name;
    const n = d?.vouchers?.length || 0;
    const typed = await ask({ title: 'Delete company', message: `This deletes "${name}" and all its data${n ? ` (${n} entries)` : ''} from this browser. It cannot be undone — download a backup from Settings first if you may need it. Books must be kept for 8 years, so delete only test, sample or duplicate companies. Type the company name to confirm.`, input: 'Company name', ok: 'Delete', danger: true });
    if (typed === null) return;
    if (typed.trim() !== name) return alert('The name did not match. Nothing was deleted.');
    auditMeta('Company deleted from this browser', { entity: 'Company', ref: name, after: `${n} entries` });
    store.del(id);
    meta.companies = meta.companies.filter(x => x.id !== id);
    if (meta.lastCompany === id) meta.lastCompany = '';
    if (co?.id === id) co = null;
    saveMeta();
    toast(`${name} deleted.`);
    location.hash === '#/companies' ? route() : go('#/companies');
}
// Opened from a dashboard (e.g. STAY BAY's "Open We Create ERP"): go straight to that dashboard's own company
function openLinked(k) {
    const list = linkedCompanies(k).filter(c => userCompanies().some(u => u.id === c.id));
    const pick = list.find(c => !c.demo) || list[0];
    if (pick) {
        if (co?.id !== pick.id && openCompany(pick.id)) { state.fy = defaultFy(); audit('Company opened', { entity: 'Company', ref: co.profile.name, reason: `From the ${SOURCE_LABEL[k]} dashboard` }); saveCo(); autoSync(); }
        history.replaceState(null, '', k === 'staybay' ? '#/payroll' : '#/dashboard');
        return route();
    }
    if (!co) return go('#/companies');
    toast(`No company is connected to ${SOURCE_LABEL[k]} yet — create it here.`);
    go('#/connect');
}
function viewCompanies() {
    const list = userCompanies();
    const cards = list.map(c => {
        const d = loadCo(c.id);
        if (!d) return '';
        const saved = co;
        co = upgradeCo(d); ver++;
        const fy = fyOf(todayISO());
        let overdue = 0, soon = 0, recv = 0;
        try {
            const items = complianceItems(fy).filter(i => i.due >= co.profile.booksFrom);
            overdue = items.filter(i => i.state === 'overdue').length;
            soon = items.filter(i => i.state === 'soon').length;
            recv = sum(co.contacts.filter(x => x.type !== 'vendor'), x => Math.max(0, balance(x.id)));
        } catch (e) { console.warn(e); }
        const out = `<div class="card co-card" onclick="pickCompany('${c.id}')">
            <div class="row" style="justify-content:space-between;align-items:flex-start"><div><b style="font-size:15px">${esc(d.profile.name)}</b><div class="note">${esc(d.profile.entity)} · ${esc(d.profile.gstin || 'No GSTIN')}</div></div>${saved?.id === c.id ? '<span class="badge brand">Open</span>' : ''}</div>
            <div class="row" style="margin-top:12px;gap:6px">${overdue ? `<span class="badge bad">${overdue} overdue</span>` : '<span class="badge good">No overdue filings</span>'}${soon ? `<span class="badge warn">${soon} due this week</span>` : ''}<span class="badge">${d.vouchers.length} entries</span></div>
            <div class="note" style="margin-top:10px">Receivables ${inr0(recv)} · ${esc(STATES[d.profile.state] || '')}${c.link ? ` · connected to ${esc(SOURCE_LABEL[c.link])}` : ''}</div>
            ${isAdmin() ? `<div class="row co-actions" style="margin-top:12px;gap:8px" onclick="event.stopPropagation()"><button class="btn btn-s btn-sm" onclick="editCompany('${c.id}')">Edit details</button><button class="btn btn-d btn-sm" onclick="deleteCompany('${c.id}')">Delete</button></div>` : ''}</div>`;
        co = saved; ver++;
        return out;
    }).join('');
    $('#view').innerHTML = pageHead('All companies', 'Your practice workspace: every company you look after, with its filing status. Open one to work in it.',
        isAdmin() ? `<button class="btn btn-s" onclick="if (limitReached('companies')) return upgradePrompt('More companies'); createSampleWorkspace(); viewCompanies()">+ Sample companies</button><button class="btn btn-p" onclick="if (limitReached('companies')) return upgradePrompt('More companies'); companyForm()">+ New company</button>` : '')
        + (cards ? `<div class="grid g3">${cards}</div>` : `<div class="empty">No companies yet. ${isAdmin() ? 'Create your first company to begin.' : 'Ask the owner to give you access.'}</div>`);
}
function pickCompany(id) {
    if (openCompany(id)) { state.fy = defaultFy(); audit('Company opened', { entity: 'Company', ref: co.profile.name }); saveCo(); autoSync(); go('#/dashboard'); }
}
function companyForm(existing) {
    const p = existing ? co.profile : { entity: 'Proprietorship', state: '33', booksFrom: `${fyOf(todayISO())}-04-01`, lut: true, roundOff: true, aato: 0 };
    modal({
        title: existing ? 'Company details' : 'New company', wide: true,
        body: `<div id="cfErr"></div><div class="fg">
            <label class="f">Trade name *<input id="cf_name" value="${esc(p.name)}"></label>
            <label class="f">Legal name (as per PAN)<input id="cf_legal" value="${esc(p.legalName)}"></label>
            <label class="f">Type of entity<select id="cf_entity">${['Proprietorship', 'Partnership', 'LLP', 'Private Ltd', 'Public Ltd', 'Trust / Society', 'HUF'].map(x => opt(x, x, p.entity)).join('')}</select></label>
            <label class="f">GSTIN <span class="hint">State and PAN fill in from it</span><input id="cf_gstin" maxlength="15" style="text-transform:uppercase" value="${esc(p.gstin)}"></label>
            <label class="f">PAN<input id="cf_pan" maxlength="10" style="text-transform:uppercase" value="${esc(p.pan)}"></label>
            <label class="f">TAN <span class="hint">Needed if you deduct TDS</span><input id="cf_tan" maxlength="10" style="text-transform:uppercase" value="${esc(p.tan)}"></label>
            <label class="f">State *<select id="cf_state">${stateOptions(p.state)}</select></label>
            <label class="f wide">Address<input id="cf_addr" value="${esc(p.address)}"></label>
            <label class="f">City<input id="cf_city" value="${esc(p.city)}"></label>
            <label class="f">PIN code<input id="cf_pin" maxlength="6" value="${esc(p.pincode)}"></label>
            <label class="f">Phone<input id="cf_phone" value="${esc(p.phone)}"></label>
            <label class="f">Email<input id="cf_email" value="${esc(p.email)}"></label>
            <label class="f">Books start from *<input id="cf_from" type="date" value="${esc(p.booksFrom)}" ${existing && co.vouchers.length ? 'readonly' : ''}></label>
            <label class="f">Last year's turnover (₹) <span class="hint">Decides e-invoicing (above ₹5 crore) and HSN digits</span><input id="cf_aato" type="number" min="0" value="${p.aato || 0}"></label>
            <label class="f">Bank name (printed on invoices)<input id="cf_bank" value="${esc(p.bankName)}"></label>
            <label class="f">Bank account no.<input id="cf_bacc" value="${esc(p.bankAcc)}"></label>
            <label class="f">IFSC<input id="cf_ifsc" maxlength="11" style="text-transform:uppercase" value="${esc(p.bankIfsc)}"></label>
            <label class="f wide">Terms printed on invoices<input id="cf_terms" value="${esc(p.terms ?? 'Goods once sold will not be taken back.')}"></label>
            <label class="chk"><input type="checkbox" id="cf_lut" ${p.lut ? 'checked' : ''}> LUT filed (export / SEZ without paying IGST)</label>
            <label class="chk"><input type="checkbox" id="cf_round" ${p.roundOff !== false ? 'checked' : ''}> Round invoice totals to the rupee</label>
        </div>`,
        foot: `<button class="btn btn-s" onclick="closeModal()">Cancel</button><button class="btn btn-p" id="cfOk">${existing ? 'Save' : 'Create company'}</button>`,
        onOpen: () => {
            $('#cf_gstin').oninput = e => { const g = e.target.value.toUpperCase(); if (gstinValid(g)) { $('#cf_state').value = g.slice(0, 2); $('#cf_pan').value = g.slice(2, 12); } };
            $('#cfOk').onclick = () => {
                const np = { name: val('cf_name'), legalName: val('cf_legal'), entity: val('cf_entity'), gstin: val('cf_gstin').toUpperCase(), pan: val('cf_pan').toUpperCase(), tan: val('cf_tan').toUpperCase(), state: val('cf_state'), address: val('cf_addr'), city: val('cf_city'), pincode: val('cf_pin'), phone: val('cf_phone'), email: val('cf_email'), booksFrom: val('cf_from'), aato: numv('cf_aato'), bankName: val('cf_bank'), bankAcc: val('cf_bacc'), bankIfsc: val('cf_ifsc').toUpperCase(), terms: val('cf_terms'), lut: chk('cf_lut'), roundOff: chk('cf_round') };
                const E = [];
                if (!np.name) E.push('Trade name is required.');
                if (np.gstin && !gstinValid(np.gstin)) E.push('GSTIN is not valid.');
                if (np.gstin && np.gstin.slice(0, 2) !== np.state) E.push('State must match the first two digits of the GSTIN.');
                if (np.pan && !panValid(np.pan)) E.push('PAN is not valid.');
                if (np.tan && !/^[A-Z]{4}\d{5}[A-Z]$/.test(np.tan)) E.push('TAN must look like CHEA12345B.');
                if (np.pincode && !pinValid(np.pincode)) E.push('PIN code must be 6 digits.');
                if (np.bankIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(np.bankIfsc)) E.push('IFSC must look like HDFC0001234.');
                if (!np.booksFrom) E.push('Books start date is required.');
                if (E.length) { const er = new Error(); er.list = E; return showErr('#cfErr', er); }
                if (existing) {
                    audit('Company details changed', { entity: 'Company', ref: np.name, after: diffFields(co.profile, np, Object.keys(np)) });
                    Object.assign(co.profile, np);
                    const m = meta.companies.find(c => c.id === co.id); if (m) { m.name = np.name; m.gstin = np.gstin; saveMeta(); }
                    saveCo(); closeModal(); route(); toast('Company details saved.');
                } else {
                    const c = newCompanyData(np);
                    co = c;
                    audit('Company created', { entity: 'Company', ref: np.name, after: `${np.entity} · ${np.gstin || 'No GSTIN'}` });
                    meta.companies.push({ id: c.id, name: np.name, gstin: np.gstin });
                    saveCo(); saveMeta(); closeModal();
                    state.fy = defaultFy();
                    toast('Company created. Now tell the ERP about the business so it applies the right rates and rules.');
                    go('#/business');
                }
            };
        }
    });
}

// ---------- dashboard ----------
function bizBanner() {
    const b = co.profile.biz;
    if (!b) return canEdit() ? `<div class="warns" style="display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap"><span><b>Tell us about your business.</b> The ERP will apply the right GST rates, input credit rules, returns and tax rules for your industry and size.</span><a class="btn btn-p btn-sm" href="#/business">Set up business profile</a></div>` : '';
    const must = businessRules(b).filter(r => r.level === 'must').length;
    return `<div class="note" style="margin:-4px 0 12px"><a href="#/business">${esc(INDUSTRIES[b.industry]?.icon || '')} ${esc(INDUSTRIES[b.industry]?.name || '')}</a> · ${co.profile.gstType === 'composition' ? `composition ${co.profile.compRate}%` : 'regular GST'} · input credit ${{ full: 'claimed', none: 'not claimed', mixed: 'with Rule 42 reversal' }[co.profile.itcPolicy || 'full']} · ${must} rules apply</div>`;
}
function viewDashboard() {
    const t = todayISO(), ym = ymOf(t);
    const fy = state.fy, from = fyStart(fy) < co.profile.booksFrom ? co.profile.booksFrom : fyStart(fy), to = fyEnd(fy) < t ? fyEnd(fy) : t;
    const recv = sum(co.contacts.filter(c => c.type !== 'vendor'), c => Math.max(0, balance(c.id)));
    const pay = sum(co.contacts.filter(c => c.type !== 'customer'), c => Math.max(0, -balance(c.id)));
    const cash = sum(cashBankAccounts(), a => balance(a.id));
    const mSales = sum(activeIn(['SI'], ym), v => v.totals.taxable) - sum(activeIn(['CN'], ym), v => v.totals.taxable);
    const mPurch = sum(activeIn(['PB'], ym), v => v.totals.taxable) - sum(activeIn(['DN'], ym), v => v.totals.taxable);
    const g3 = gstr3b(ym);
    const pl = plData(from, to);
    const overdue = co.vouchers.filter(v => v.type === 'SI' && v.status !== 'cancelled' && outstanding(v) > 0 && dueDate(v) < t);
    const kpi = (l, v, s, c) => `<div class="kpi" style="--c:${c}"><div class="v">${v}</div><div class="l">${l}</div><div class="s">${s}</div></div>`;
    const health = healthCheck();
    const recBanner = isAdmin() && !me.recHash ? `<div class="warns" style="display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap"><span>⚠ <b>No recovery code yet.</b> Without one, a forgotten password cannot be reset here.</span><button class="btn btn-p btn-sm" onclick="createRecoveryNow()">Create recovery code</button></div>` : '';
    const recent = [...co.vouchers].sort((a, b) => (b.created || '').localeCompare(a.created || '')).slice(0, 8);
    $('#view').innerHTML = pageHead(`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${me.name.split(' ')[0]}`, `${esc(co.profile.name)} · FY ${fyLabel(fy)} · ${fmtDate(t)}`,
        canEdit() ? `<a class="btn btn-s adv" href="#/scan">${ic('cam')} Scan a bill</a><a class="btn btn-s" href="#/new/RC">Receipt <kbd>F6</kbd></a><a class="btn btn-s" href="#/new/PB">Bill <kbd>F9</kbd></a><a class="btn btn-p" href="#/new/SI">${ic('plus')} Invoice <kbd>F8</kbd></a>` : '')
        + recBanner + bizBanner() + `<div class="grid g4" style="margin-bottom:16px">
            ${kpi('To collect (receivables)', inr0(recv), overdue.length ? `${overdue.length} invoice(s) overdue` : 'Nothing overdue', '#0f9d63')}
            ${kpi('To pay (payables)', inr0(pay), `${co.contacts.filter(c => c.msme && -balance(c.id) > 0).length} MSME supplier(s) with dues`, '#c62828')}
            ${kpi('Cash & bank', inr0(cash), `${cashBankAccounts().length} account(s)`, '#0369a1')}
            ${kpi(`Profit · FY ${fyLabel(fy)}`, inr0(pl.pat), `Revenue ${inr0(pl.tot(pl.revenue))}`, '#4338ca')}
            ${kpi(`Sales · ${MONTHS[Number(ym.slice(5)) - 1]}`, inr0(mSales), 'Taxable value, net of returns', '#7c3aed')}
            ${kpi(`Purchases · ${MONTHS[Number(ym.slice(5)) - 1]}`, inr0(mPurch), 'Taxable value, net of returns', '#b45309')}
            ${kpi('GST to pay this month', inr0(g3.setoff.totalCash), `After input credit · ITC ${inr0(g3.itcNet.iamt + g3.itcNet.camt + g3.itcNet.samt)}`, '#db2777')}
            ${kpi('Entries this FY', co.vouchers.filter(v => fyOf(v.date) === fy).length, `${co.vouchers.filter(v => v.status === 'cancelled').length} cancelled`, '#475569')}
        </div>
        <div class="grid g3" style="margin-bottom:16px">
            <div class="card" style="grid-column:span 2"><h2>Sales and purchases · FY ${fyLabel(fy)}</h2><div class="chart"><canvas id="c1"></canvas></div></div>
            <div class="card"><h2>Needs attention</h2>${health.length ? health.slice(0, 7).map(h => `<a class="alert ${h.level}" href="${h.route}" style="text-decoration:none;color:inherit"><span class="dot"></span><span class="t">${esc(h.text)}<small>${esc(h.sub)}</small></span></a>`).join('') : '<div class="alert"><span class="dot" style="background:var(--good)"></span><span class="t">All clear<small>No pending compliance or reconciliation items.</small></span></div>'}</div>
        </div>
        <div class="grid g2">
            <div class="card"><h2>Where the money went · FY ${fyLabel(fy)}</h2><div class="chart"><canvas id="c2"></canvas></div></div>
            <div class="card"><h2>Latest entries</h2>${recent.length ? `<div class="tw"><table class="t"><tbody>${recent.map(v => `<tr class="click ${v.status === 'cancelled' ? 'cancel' : ''}" onclick="go('#/v/${v.id}')"><td>${esc(v.no)}</td><td>${esc(VTYPES[v.type].short)}</td><td>${esc(ledgerOf(v.partyId || v.ledgerId || v.toId)?.name || '')}</td><td class="n">${num(v.totals?.total || 0)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">No entries yet. Press <kbd>F8</kbd> for an invoice or scan a bill.</div>`}</div>
        </div>`;
    if (window.Chart) {
        const months = fyMonths(fy);
        const s = months.map(m => sum(activeIn(['SI'], m), v => v.totals.taxable) - sum(activeIn(['CN'], m), v => v.totals.taxable));
        const p = months.map(m => sum(activeIn(['PB'], m), v => v.totals.taxable) - sum(activeIn(['DN'], m), v => v.totals.taxable));
        charts.push(new Chart($('#c1'), { type: 'bar', data: { labels: months.map(m => MONTHS[Number(m.slice(5)) - 1]), datasets: [{ label: 'Sales', data: s, backgroundColor: '#6366f1', borderRadius: 6 }, { label: 'Purchases', data: p, backgroundColor: '#f59e0b', borderRadius: 6 }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${inr0(c.parsed.y)}` } } }, scales: { y: { ticks: { callback: v => inr0(v) } } } } }));
        const exp = [...pl.purchases, ...pl.employee, ...pl.finance, ...pl.dep, ...pl.otherExp].sort((a, b) => b.amt - a.amt);
        const top = exp.slice(0, 6), rest = sum(exp.slice(6), 'amt');
        charts.push(new Chart($('#c2'), { type: 'doughnut', data: { labels: [...top.map(x => x.l.name), ...(rest ? ['Others'] : [])], datasets: [{ data: [...top.map(x => x.amt), ...(rest ? [rest] : [])], backgroundColor: ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9', '#a855f7', '#94a3b8'], borderWidth: 2 }] }, options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: c => `${c.label}: ${inr0(c.parsed)}` } } } } }));
    }
}

// ---------- masters: contacts ----------
function viewContacts(kind) {
    const type = kind === 'customers' ? 'customer' : 'vendor';
    const list = co.contacts.filter(c => c.type === type || c.type === 'both').sort((a, b) => a.name.localeCompare(b.name));
    $('#view').innerHTML = pageHead(kind === 'customers' ? 'Customers' : 'Vendors', kind === 'customers' ? 'Everyone you sell to. Each customer is its own ledger under Sundry Debtors.' : 'Everyone you buy from. MSME status and TDS section here drive the 45-day payment alerts and automatic TDS.',
        canEdit() ? `<button class="btn btn-p" onclick="contactForm('${type}')">+ New ${type}</button>` : '')
        + `<div class="card"><div class="row" style="margin-bottom:12px"><input placeholder="Filter by name, GSTIN or city" oninput="filterRows(this,'#ctT')" style="flex:1;max-width:340px"><button class="btn btn-s btn-sm" onclick="tableCSV($('#ctT'),'${kind}')">${ic('dl')} CSV</button></div>
        <div class="tw"><table class="t" id="ctT"><thead><tr><th>Name</th><th>GSTIN</th><th>State</th>${type === 'vendor' ? '<th>MSME</th><th>TDS</th>' : '<th>Credit days</th>'}<th class="n">Balance</th><th></th></tr></thead><tbody>
        ${list.map(c => `<tr><td><b>${esc(c.name)}</b>${c.phone ? `<div class="note">${esc(c.phone)}</div>` : ''}</td><td>${c.gstin ? esc(c.gstin) : '<span class="badge">Unregistered</span>'}${c.sez ? ' <span class="badge info">SEZ</span>' : ''}</td><td>${esc(STATES[c.state] || '')}</td>
            ${type === 'vendor' ? `<td>${c.msme ? '<span class="badge warn">MSME</span>' : '—'}</td><td>${c.tdsSection ? `<span class="badge brand" title="${esc(tdsName(c.tdsSection))}">${esc(tdsName(c.tdsSection, true))}</span>` : '—'}</td>` : `<td>${c.creditDays || 0}</td>`}
            <td class="n">${drcr(balance(c.id))}</td><td style="white-space:nowrap"><button class="link" onclick="reportState.ledger='${c.id}';go('#/report/ledger')">Ledger</button>${canEdit() ? `<button class="link" onclick="contactForm('${type}','${c.id}')">Edit</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="7" class="muted" style="text-align:center;padding:20px">No ${kind} yet.</td></tr>`}
        </tbody></table></div></div>`;
}
function filterRows(input, sel) {
    const q = input.value.toLowerCase();
    $$(`${sel} tbody tr`).forEach(tr => { tr.hidden = q && !tr.innerText.toLowerCase().includes(q); });
}
function contactForm(type, id, prefill, after) {
    const c = id ? { ...contactById(id) } : { type, state: companyState(), creditDays: (type === 'customer' ? co.settings.prefs?.custDays : co.settings.prefs?.vendDays) ?? 30, ...(prefill || {}) };
    const ob = (c.openDr || 0) - (c.openCr || 0);
    modal({
        title: id ? `Edit ${c.name}` : `New ${type}`, wide: true,
        body: `<div id="ctErr"></div><div class="fg">
            <label class="f">Name *<input id="ct_name" value="${esc(c.name)}"></label>
            <label class="f">GSTIN <span class="hint">Leave blank if unregistered</span><input id="ct_gstin" maxlength="15" style="text-transform:uppercase" value="${esc(c.gstin)}"><span class="hint" id="ct_gHint"></span></label>
            <label class="f">PAN<input id="ct_pan" maxlength="10" style="text-transform:uppercase" value="${esc(c.pan)}"></label>
            <label class="f">State *<select id="ct_state">${stateOptions(c.state)}</select></label>
            <label class="f wide">Address<input id="ct_addr" value="${esc(c.address)}"></label>
            <label class="f">City<input id="ct_city" value="${esc(c.city)}"></label>
            <label class="f">PIN<input id="ct_pin" maxlength="6" value="${esc(c.pincode)}"></label>
            <label class="f">Mobile (for WhatsApp)<input id="ct_phone" maxlength="10" value="${esc(c.phone)}"></label>
            <label class="f">Email<input id="ct_email" value="${esc(c.email)}"></label>
            <label class="f">Credit days<input id="ct_days" type="number" min="0" value="${c.creditDays || 0}"></label>
            <label class="f">Opening balance (₹)<input id="ct_open" type="number" min="0" step="0.01" value="${Math.abs(ob) || ''}"></label>
            <label class="f">Opening is<select id="ct_side">${opt('dr', type === 'customer' ? 'Receivable (Dr)' : 'Advance paid (Dr)', ob >= 0 && type === 'customer' ? 'dr' : ob > 0 ? 'dr' : 'cr')}${opt('cr', type === 'vendor' ? 'Payable (Cr)' : 'Advance received (Cr)', ob < 0 || (type === 'vendor' && ob === 0) ? 'cr' : 'dr')}</select></label>
            ${type === 'customer' ? `<label class="chk"><input type="checkbox" id="ct_sez" ${c.sez ? 'checked' : ''}> Unit is in an SEZ</label>
               <label class="f">TCS on sales to this customer <span class="hint">Section 394 (old 206C) payment code</span><select id="ct_tcs">${opt('', 'No TCS', c.tcsSection)}${Object.keys(TCS_SECTIONS).map(k => opt(k, tcsName(k), c.tcsSection)).join('')}</select></label>`
            : `<label class="chk"><input type="checkbox" id="ct_msme" ${c.msme ? 'checked' : ''}> MSME (Udyam registered: micro / small)</label>
               <label class="f">Udyam no.<input id="ct_udyam" value="${esc(c.udyam)}" placeholder="UDYAM-TN-00-0000000"></label>
               <label class="f">TDS payment code <span class="hint">Section 393; deducted automatically when the threshold is crossed</span><select id="ct_tds">${opt('', 'No TDS', c.tdsSection)}${Object.keys(TDS_SECTIONS).map(k => opt(k, tdsName(k), c.tdsSection)).join('')}</select></label>`}
        </div>`,
        foot: `<button class="btn btn-s" onclick="closeModal()">Cancel</button><button class="btn btn-p" id="ctOk">Save</button>`,
        onOpen: () => {
            const g = () => { const v = $('#ct_gstin').value.toUpperCase(); $('#ct_gHint').textContent = !v ? '' : gstinValid(v) ? `✓ Valid · ${STATES[v.slice(0, 2)]}` : 'Not a valid GSTIN yet'; if (gstinValid(v)) { $('#ct_state').value = v.slice(0, 2); $('#ct_pan').value = v.slice(2, 12); } };
            $('#ct_gstin').oninput = g; g();
            $('#ctOk').onclick = () => {
                const amt = numv('ct_open');
                const data = { ...c, id: id || undefined, type: c.type || type, name: val('ct_name'), gstin: val('ct_gstin'), pan: val('ct_pan'), state: val('ct_state'), address: val('ct_addr'), city: val('ct_city'), pincode: val('ct_pin'), phone: val('ct_phone'), email: val('ct_email'), creditDays: numv('ct_days'), openDr: val('ct_side') === 'dr' ? amt : 0, openCr: val('ct_side') === 'cr' ? amt : 0 };
                if (type === 'customer') { data.sez = chk('ct_sez'); data.tcsSection = val('ct_tcs'); }
                else { data.msme = chk('ct_msme'); data.udyam = val('ct_udyam'); data.tdsSection = val('ct_tds'); }
                try { const saved = saveContact(data); closeModal(); toast(`${saved.name} saved.`); after ? after(saved) : route(); }
                catch (err) { showErr('#ctErr', err); }
            };
        }
    });
}

// ---------- masters: items ----------
function viewItems() {
    const stock = stockAt(todayISO());
    $('#view').innerHTML = pageHead('Items & services', 'HSN / SAC and GST rate are set once here and fill every invoice. Stock is valued at weighted average cost (AS 2).',
        canEdit() ? `<button class="btn btn-p" onclick="itemForm()">+ New item</button>` : '')
        + `<div class="card"><div class="row" style="margin-bottom:12px"><input placeholder="Filter" oninput="filterRows(this,'#itT')" style="flex:1;max-width:340px"><button class="btn btn-s btn-sm" onclick="tableCSV($('#itT'),'items')">${ic('dl')} CSV</button></div>
        <div class="tw"><table class="t" id="itT"><thead><tr><th>Item</th><th>Type</th><th>HSN/SAC</th><th class="n">GST</th><th class="n">Sale rate</th><th class="n">Stock</th><th class="n">Stock value</th><th></th></tr></thead><tbody>
        ${co.items.map(i => { const s = stock.items[i.id]; return `<tr><td><b>${esc(i.name)}</b></td><td>${i.type === 'service' ? 'Service' : 'Goods'}</td><td>${esc(i.hsn)}</td><td class="n">${i.gstRate}%</td><td class="n">${num(i.rate || 0)}</td><td class="n">${s ? `${r2(s.qty)} ${esc(i.unit)}` : '—'}</td><td class="n">${s ? num(s.value) : '—'}</td><td>${canEdit() ? `<button class="link" onclick="itemForm('${i.id}')">Edit</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="8" class="muted" style="text-align:center;padding:20px">No items yet.</td></tr>'}
        </tbody><tfoot><tr><td colspan="6">Total stock value</td><td class="n">${num(stock.value)}</td><td></td></tr></tfoot></table></div></div>`;
}
function itemForm(id, after) {
    const i = id ? { ...itemById(id) } : { type: 'goods', unit: 'NOS', gstRate: co.settings.prefs?.defaultGst ?? 18, trackStock: true };
    const incomeAcc = l => ['sales', 'dirinc', 'indinc'].includes(l.group);
    const costAcc = l => ['purchase', 'direxp', 'indexp', 'fixed', 'empexp'].includes(l.group);
    modal({
        title: id ? `Edit ${i.name}` : 'New item or service', wide: true,
        body: `<div id="itErr"></div><div class="fg">
            <label class="f">Type<select id="it_type">${opt('goods', 'Goods', i.type)}${opt('service', 'Service', i.type)}</select></label>
            <label class="f">Stock type <span class="hint">Manufacturers: raw material / finished goods</span><select id="it_kind">${opt('trading', 'Trading goods', i.kind || 'trading')}${opt('raw', 'Raw material', i.kind)}${opt('finished', 'Finished goods (we make it)', i.kind)}</select></label>
            <label class="f">Name *<input id="it_name" value="${esc(i.name)}"></label>
            <label class="f">HSN / SAC * <span class="hint">4–8 digits; services start with 99</span><input id="it_hsn" maxlength="8" value="${esc(i.hsn)}"></label>
            <label class="f">GST rate<select id="it_rate">${GST_RATES.map(r => opt(r, `${r}%`, i.gstRate)).join('')}</select></label>
            <label class="f">Unit (UQC)<select id="it_unit">${UNITS.map(u => opt(u, u, i.unit)).join('')}</select></label>
            <label class="f">Sale rate (₹, before GST)<input id="it_sr" type="number" min="0" step="0.01" value="${i.rate || ''}"></label>
            <label class="f">Purchase rate (₹)<input id="it_pr" type="number" min="0" step="0.01" value="${i.purchaseRate || ''}"></label>
            <label class="f">Income ledger<select id="it_sacc">${ledgerOptions(i.salesAcc, incomeAcc, 'Default (Sales / Service income)')}</select></label>
            <label class="f">Cost ledger<select id="it_pacc">${ledgerOptions(i.purchaseAcc, costAcc, 'Default (Purchases)')}</select></label>
            <label class="chk"><input type="checkbox" id="it_track" ${i.trackStock !== false ? 'checked' : ''}> Track stock</label>
            <label class="f">Opening quantity<input id="it_oq" type="number" min="0" step="0.001" value="${i.openQty || ''}"></label>
            <label class="f">Opening value (₹, at cost)<input id="it_ov" type="number" min="0" step="0.01" value="${i.openValue || ''}"></label>
        </div><p class="note" style="margin-top:10px">GST 2.0 (from 22 Sep 2025): main rates are 5%, 18% and 40%. Most former 12% items are now 5%, most former 28% items 18%.</p>`,
        foot: `<button class="btn btn-s" onclick="closeModal()">Cancel</button><button class="btn btn-p" id="itOk">Save</button>`,
        onOpen: () => $('#itOk').onclick = () => {
            const data = { ...i, id: id || undefined, type: val('it_type'), kind: val('it_kind'), name: val('it_name'), hsn: val('it_hsn'), gstRate: Number(val('it_rate')), unit: val('it_unit'), rate: numv('it_sr'), purchaseRate: numv('it_pr'), salesAcc: val('it_sacc'), purchaseAcc: val('it_pacc'), trackStock: chk('it_track'), openQty: numv('it_oq'), openValue: numv('it_ov') };
            try { const s = saveItem(data); closeModal(); toast(`${s.name} saved.`); after ? after(s) : route(); } catch (err) { showErr('#itErr', err); }
        }
    });
}

// ---------- masters: chart of accounts ----------
function viewAccounts() {
    const diff = openingDifference();
    const byGroup = {};
    co.accounts.forEach(a => (byGroup[a.group] ||= []).push(a));
    $('#view').innerHTML = pageHead('Chart of accounts', 'Ledgers grouped the way Schedule III needs them. Customers and vendors are ledgers too (Sundry Debtors / Creditors). Enter opening balances as on the books start date.',
        canEdit() ? `<button class="btn btn-p" onclick="accountForm()">+ New ledger</button>` : '')
        + (Math.abs(diff) > 0.004 ? `<div class="warns">Opening balances differ by <b>${inr(diff)}</b> (${diff > 0 ? 'debits are more' : 'credits are more'}, including opening stock ${inr(openingStockValue())}). Correct them so the balance sheet tallies; until then the difference is shown separately.</div>` : `<div class="note" style="margin-bottom:12px">✓ Opening balances tally.</div>`)
        + Object.entries(GROUPS).filter(([g]) => byGroup[g]).map(([g, G]) => `<div class="card"><h2>${esc(G.name)} <span class="badge">${{ A: 'Asset', L: 'Liability', I: 'Income', E: 'Expense' }[G.nature]}</span></h2><div class="tw"><table class="t"><thead><tr><th>Ledger</th><th class="n">Opening</th><th class="n">Closing (today)</th><th></th></tr></thead><tbody>
            ${byGroup[g].sort((a, b) => a.name.localeCompare(b.name)).map(a => `<tr><td>${esc(a.name)}${a.sys ? ' <span class="badge">built-in</span>' : ''}</td><td class="n">${drcr((a.openDr || 0) - (a.openCr || 0))}</td><td class="n">${drcr(balance(a.id))}</td><td style="white-space:nowrap"><button class="link" onclick="reportState.ledger='${a.id}';go('#/report/ledger')">Ledger</button>${canEdit() ? `<button class="link" onclick="accountForm('${a.id}')">Edit</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div></div>`).join('');
}
function accountForm(id) {
    const a = id ? { ...accById(id) } : { group: 'indexp' };
    const ob = (a.openDr || 0) - (a.openCr || 0);
    const pl = ['I', 'E'].includes(GROUPS[a.group]?.nature);
    modal({
        title: id ? `Edit ${a.name}` : 'New ledger',
        body: `<div id="acErr"></div><div class="fg" style="grid-template-columns:1fr 1fr">
            <label class="f wide">Name *<input id="ac_name" value="${esc(a.name)}"></label>
            <label class="f wide">Group *<select id="ac_group" ${a.sys ? 'disabled' : ''}>${Object.entries(GROUPS).map(([k, g]) => opt(k, g.name, a.group)).join('')}</select></label>
            <label class="f">Opening balance (₹)<input id="ac_open" type="number" min="0" step="0.01" value="${Math.abs(ob) || ''}" ${pl ? 'disabled' : ''}></label>
            <label class="f">Side<select id="ac_side">${opt('dr', 'Debit', ob >= 0 ? 'dr' : 'cr')}${opt('cr', 'Credit', ob < 0 ? 'cr' : 'dr')}</select></label>
        </div><p class="note" style="margin-top:10px">Income and expense ledgers start each year at zero, so they carry no opening balance.</p>`,
        foot: `<button class="btn btn-s" onclick="closeModal()">Cancel</button><button class="btn btn-p" id="acOk">Save</button>`,
        onOpen: () => {
            $('#ac_group').onchange = e => { const isPl = ['I', 'E'].includes(GROUPS[e.target.value].nature); $('#ac_open').disabled = isPl; if (isPl) $('#ac_open').value = ''; };
            $('#acOk').onclick = () => {
                const amt = $('#ac_open').disabled ? 0 : numv('ac_open');
                try { saveAccount({ ...a, id: id || undefined, name: val('ac_name'), group: a.sys ? a.group : val('ac_group'), openDr: val('ac_side') === 'dr' ? amt : 0, openCr: val('ac_side') === 'cr' ? amt : 0 }); closeModal(); route(); toast('Ledger saved.'); }
                catch (err) { showErr('#acErr', err); }
            };
        }
    });
}
