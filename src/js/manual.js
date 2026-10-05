'use strict';
// ===================== We Create ERP · user manual =====================

const MANUAL = [
    ['start', 'Getting started', `
        <ol><li>Open <b>we-create-erp.html</b> in Chrome or Edge. The first time, create the <b>owner account</b> (your name, a username and a password of at least 4 characters).</li>
        <li>Tick <b>Add a sample company</b> to explore with 18 months of ready-made entries, or create your own company from <b>All companies → + New company</b>.</li>
        <li>Fill in the company details: trade and legal name, type of entity, <b>GSTIN</b> (state and PAN fill in from it), TAN, address, books start date and last year's turnover.</li>
        <li>Go to <b>Chart of accounts</b>, add your bank account(s) under <i>Bank Accounts</i> and enter opening balances as on the books start date. Add customers, vendors and items with their opening balances and stock.</li>
        <li>Check that the opening balances tally (Chart of accounts shows a ✓ or the difference).</li></ol>
        <div class="man-warn"><b>Save your recovery code.</b> When the owner account is created you are shown a recovery code once. Write it down or download it — it is the only way to reset a forgotten password in this version.</div>
        <div class="man-tip"><b>Basic or Advanced:</b> the switch at the top right. Basic hides journals, notes, TDS, bank reconciliation and bill scanning, for people who only raise invoices and record money. Nothing is lost when you switch.</div>
        <div class="man-tip"><b>Trial:</b> a new workspace gets every Professional feature free for 14 days. After that it moves to the plan you choose, or to Starter (free).</div>`],
    ['sales', 'Sales invoices', `
        <ol><li>Press <kbd>F8</kbd> (or <b>+ Invoice</b>). Choose the customer — use <b>+</b> to add a new one without leaving the invoice.</li>
        <li>The <b>place of supply</b> fills from the customer's state. Same state as yours: CGST + SGST. Different state: IGST. Foreign customer or SEZ unit: zero-rated (no tax under LUT, or IGST if you tick "with payment").</li>
        <li>Add lines: pick an item (HSN, unit, rate and GST fill in) or type a description. Press <kbd>Enter</kbd> to move field to field; <kbd>Enter</kbd> on the last field adds a line.</li>
        <li>If the customer was paid on the spot, choose <b>Received now in</b> cash or bank; the receipt is recorded too.</li>
        <li>Save with <kbd>Ctrl</kbd>+<kbd>S</kbd>. The number (e.g. INV/26-27/0001) is given on saving and never skips.</li></ol>
        <p>From the invoice screen you can <b>Print / PDF</b> (with logo, signature and a UPI QR for the amount due, if set up), send it on <b>WhatsApp</b>, generate the <b>e-invoice IRN</b> and <b>e-way bill</b>, record the receipt or issue a credit note.</p>
        <div class="man-warn">An invoice cannot be deleted, only cancelled with a reason; its number stays in the series and is reported as cancelled in GSTR-1. After GSTR-1 for the month is filed, or once an IRN exists, it cannot be edited: issue a credit note instead.</div>
        <h4>TCS on sales</h4><p>For scrap, minerals, liquor, timber, forest produce, motor vehicles above ₹10 lakh and the leases listed in TDS & TCS → Payment codes, set the <b>TCS code</b> on the customer. TCS is then added to every invoice on the full value including GST, and posted to <i>TCS Payable</i>.</p>`],
    ['purchases', 'Purchase bills and scanning', `
        <ol><li>Press <kbd>F9</kbd>. Choose the vendor and enter the <b>supplier's invoice number and date</b> exactly as on their bill (needed to match GSTR-2B). The same supplier invoice cannot be entered twice.</li>
        <li>Tick <b>Reverse charge</b> for supplies where you pay the GST (for example goods transport, an advocate's fees, or rent from an unregistered landlord).</li>
        <li>Untick <b>Input tax credit eligible</b> for blocked credits (section 17(5): food, motor cars, personal use…); the GST then becomes part of the cost.</li>
        <li><b>TDS</b> fills from the vendor's payment code when the threshold is crossed; the bill shows the TDS and the net payable.</li>
        <li>Attach the bill (photo or PDF) so the original stays with the entry.</li></ol>
        <h4>Scan a bill</h4><p>Go to <b>Scan a bill</b>, drop a photo or PDF, or take a photo on a phone. The ERP reads the GSTINs, invoice number, date, HSN, taxable value, GST and total. If your GSTIN is the buyer's it prepares a <b>purchase</b>; if you are the seller, a <b>sale</b>. Unknown parties are created from their GSTIN. Check the figures on the next screen and press Save.</p>
        <div class="man-tip">Clear, flat, well-lit photos read best. Always compare the total with the paper bill before saving. The first scan needs internet to load the reader.</div>
        <div class="man-warn"><b>MSME suppliers:</b> pay within the agreed days, at most 45. Unpaid amounts beyond that are not allowed as an expense until paid. The dashboard and Reports → MSME dues show what is late.</div>`],
    ['money', 'Receipts and payments', `
        <ul><li><kbd>F6</kbd> Receipt and <kbd>F5</kbd> Payment. Choose the cash or bank account and the party or ledger. Typing the amount settles the oldest bills first; change the split if needed. Anything extra stays as an advance.</li>
        <li>A customer who deducted TDS: enter it in <b>TDS deducted by customer</b>; it goes to <i>TDS Receivable</i> and settles the bill in full.</li>
        <li>Cash receipts of <b>₹2 lakh or more</b> from one person are refused. Cash payments above <b>₹10,000</b> to one person in a day are warned about (the expense is disallowed).</li>
        <li>You are warned when a payment would take cash below zero or the bank into overdraft, and when you pay more than the open bills.</li></ul>
        <h4>Depositing TDS, TCS and GST</h4><p>Pay TDS / TCS to the <i>TDS Payable</i> / <i>TCS Payable</i> ledger, choose the month it is for and enter the challan's <b>BSR code</b> and <b>serial number</b> (needed for the quarterly return). The quickest way is the <b>Pay</b> button on TDS & TCS. GST is paid from GST → GSTR-3B → Pay GST, one payment per tax head.</p>`],
    ['notes', 'Credit and debit notes', `
        <ul><li><kbd>Ctrl</kbd>+<kbd>F8</kbd> <b>Credit note</b>: sales return, post-sale discount or price correction. Link it to the original invoice (the lines can be copied). It reduces the sale, the output GST and the customer's balance.</li>
        <li><kbd>Ctrl</kbd>+<kbd>F9</kbd> <b>Debit note</b>: goods returned to a supplier. It reduces the purchase, the input credit and what you owe.</li>
        <li>A note cannot exceed what is still open on the original. A GST credit note must be issued by 30 November after the end of the invoice's financial year.</li></ul>`],
    ['journal', 'Journal and contra', `
        <ul><li><kbd>F7</kbd> <b>Journal</b> for adjustments: depreciation, provisions, write-offs, corrections and transfers between ledgers. Every journal needs a narration.</li>
        <li>While you type, the totals show the difference. If <b>debit exceeds credit</b> (or the other way round) an alert says by how much, and saving is blocked with a pop-up until it balances.</li>
        <li>Journals above the limit in Settings → Preferences (₹5 lakh by default) ask for confirmation.</li>
        <li><kbd>F4</kbd> <b>Contra</b> moves money between cash and bank (deposits, withdrawals, transfers between banks).</li></ul>`],
    ['gst', 'GST returns', `
        <ol><li>Go to <b>GST</b> and choose the month. <b>Pre-filing check</b> lists anything to fix first: missing IRNs, missing e-way bills, 2B mismatches, MSME and TDS issues.</li>
        <li><b>GSTR-1</b> shows B2B, B2C large, B2C others, exports, credit notes, the HSN summary (B2B and B2C) and documents issued. <b>JSON for GST portal</b> downloads the return to upload in the offline tool or on the portal.</li>
        <li><b>GSTR-3B</b> shows outward tax, reverse charge, input credit (with credit brought forward) and the set-off in the legal order (IGST credit first). <b>Post set-off journal</b> records the set-off in the books; <b>Pay GST</b> records the cash payment.</li>
        <li>After filing on the portal, press <b>Mark as filed</b> and enter the ARN. The month's entries then lock; later corrections go through notes or GSTR-1A.</li></ol>
        <h4>GSTR-2B and IMS</h4><p>Download GSTR-2B (JSON) from the portal and import it in GST → GSTR-2B / IMS. Each bill shows as Matched, Mismatch, Only in books (credit cannot be claimed yet) or Only in 2B (enter the bill or reject it). Record your IMS decision (accept / reject / pending) on each line.</p>
        <div class="man-tip"><b>Quarterly filers (QRMP)</b> and <b>composition dealers</b>: set this in Settings → GST & TDS. The due dates, invoice titles and tax calculation change automatically.</div>`],
    ['tds', 'TDS and TCS', `
        <p>The Income-tax Act 2025 replaced the old sections with <b>payment codes</b> (section 393 for TDS, 394 for TCS). Every screen shows the code with the old section, e.g. <b>1027 (194J(b))</b> for professional fees. The full list with rates and thresholds is in TDS & TCS → Payment codes & rates.</p>
        <ol><li>Set the payment code on each vendor (TDS) or customer (TCS).</li>
        <li>TDS is deducted on bills automatically once the bill or the year's total crosses the threshold, on the value before GST; 20% applies without a PAN.</li>
        <li>Deposit by the 7th of the next month (March: 30 April) using <b>Pay</b> on the TDS deducted / TCS collected tab, with the challan BSR code and serial number. Late deposit costs 1.5% interest a month or part of a month, shown on the screen.</li>
        <li>After each quarter open <b>Quarterly returns</b>, choose Form 140 (TDS) or Form 143 (TCS) and the quarter. Fix every item under <b>Checks before filing</b>.</li>
        <li>Download the deductee / collectee details and challan details, prepare the return in the free Return Preparation Utility, validate it with the File Validation Utility and upload it on the e-filing portal. Then <b>Mark as filed</b> with the token number.</li>
        <li>Download certificates (Form 131 for TDS, Form 133 for TCS) from TRACES and share them.</li></ol>
        <div class="man-warn">Returns are due 31 July, 31 October, 31 January and 31 May. A late return costs ₹200 a day (up to the tax amount); the screen shows the fee so far.</div>`],
    ['bank', 'Bank reconciliation', `
        <ol><li>Download the bank statement as CSV (Date, Description, Withdrawal, Deposit, Reference) and import it in <b>Bank reconciliation</b>.</li>
        <li>Lines that match an entry by amount within 5 days are matched automatically.</li>
        <li>For a line not in the books (bank charges, interest, a customer's direct deposit) press <b>Create entry</b>, choose the ledger and optionally remember the word so similar lines go there next time.</li>
        <li>The reconciliation statement shows the balance per books, cheques not yet cleared, deposits not yet credited and the balance per bank.</li></ol>`],
    ['reports', 'Reports and financial statements', `
        <ul><li><b>Statement of Profit and Loss</b> and <b>Balance Sheet</b> in the Schedule III format with previous-year figures; tick "Show ledger-wise detail" for the notes. Trade payables are split into MSME and others as required.</li>
        <li><b>Cash Flow Statement</b> by the indirect method; it ties to the cash and bank balances.</li>
        <li><b>Trial Balance</b>, <b>Day Book</b>, any <b>Ledger</b> (click a ledger name anywhere to open it), stock summary at weighted average cost, receivables and payables ageing (with WhatsApp reminders), MSME dues, sales and purchase registers and the HSN summary.</li>
        <li>Every report exports to Excel (CSV) or prints / saves as PDF.</li></ul>
        <div class="man-tip">Year end: post depreciation and the provision for income tax as journals dated 31 March, check the statements, then lock the year in Settings → Numbering & lock.</div>`],
    ['calendar', 'Due dates', `<p><b>Due dates</b> lists every filing for the year — GSTR-1, GSTR-3B (or the QRMP dates), PMT-06, TDS and TCS deposits, Forms 140 and 143, advance tax, GSTR-9 and MSME-1 for companies — with its status. The dashboard warns a week ahead and when something is overdue. Mark each one filed with its acknowledgement number.</p>`],
    ['audit', 'For auditors and CA firms', `
        <ul><li><b>All companies</b> is a practice workspace: every client company with its overdue and upcoming filings.</li>
        <li>Give your auditor an <b>Auditor (read-only)</b> login in Settings → Users & roles. Auditors see every entry, report and the audit trail but cannot change anything.</li>
        <li>On any voucher, auditors raise a <b>query</b>; staff reply and mark it resolved. The thread stays with the entry.</li>
        <li>The <b>Audit trail</b> records every change with date, time, user, old and new values and reason. It is always on and cannot be switched off or edited; each entry is sealed with a hash of the one before, and the screen confirms the chain is intact (Companies (Accounts) Rules, Rule 3(1)).</li>
        <li>After sign-off, lock the period in Settings → Numbering & lock so nothing dated on or before it can change.</li></ul>`],
    ['settings', 'Settings', `
        <ul><li><b>Company</b>: name, entity, GSTIN, PAN, address, books start date, bank details.</li>
        <li><b>Invoice & print</b>: logo, signature, UPI ID for the payment QR, terms, footer note, jurisdiction line, bank details on or off, copy labels.</li>
        <li><b>GST & TDS</b>: regular or composition, monthly or quarterly returns, turnover, LUT, TAN, deductor type and the person responsible for TDS / TCS returns.</li>
        <li><b>Preferences</b>: default credit days and GST rate, alerts (negative stock, duplicate invoices, large journals) and the sign-out time.</li>
        <li><b>Reminders</b>: the WhatsApp messages for reminders, invoices and thank-yous, with placeholders.</li>
        <li><b>Import</b>: customers, vendors and items from Excel / CSV using the templates.</li>
        <li><b>Numbering & lock</b>, <b>Users & roles</b>, <b>Backup & restore</b>.</li></ul>`],
    ['plans', 'Plans and billing', `
        <p>Open <b>Plan & billing</b> from the menu or the plan badge at the top. It shows your plan, trial days left, usage (users, companies, bill scans this month), the plans side by side and your payment history with invoices.</p>
        <ul><li><b>Starter</b> (free), <b>Standard</b>, <b>Professional</b> and <b>Enterprise</b> differ in users, companies, scans and extra features such as GST filing tools, e-invoice, reconciliations, TDS / TCS returns and the auditor role. A 🔒 marks a feature outside your plan.</li>
        <li>Never locked on any plan: entering vouchers, GST / TDS / TCS calculation, all reports and statements, the audit trail, backup and data export.</li>
        <li>Only the owner can upgrade or change the plan. Upgrade with UPI, card or net banking; a GST invoice is issued for each payment.</li></ul>
        <div class="man-tip">In this test build payments are simulated and no money is taken.</div>`],
    ['backup', 'Backups and data safety', `
        <div class="man-warn">In this test build everything is saved in this browser on this computer. Another computer will not see it, and clearing the browser's data deletes it.</div>
        <ol><li>Settings → Backup & restore → <b>Download full backup</b>, at least weekly. Keep the file in Google Drive or email it to yourself.</li>
        <li>To move to another computer, or to recover, open the ERP there and use <b>Restore</b> with the file.</li></ol>`],
    ['keys', 'Keyboard shortcuts', `<table class="t" style="max-width:520px"><tbody>${[['F8', 'Sales invoice'], ['F9', 'Purchase bill'], ['Ctrl + F8', 'Credit note'], ['Ctrl + F9', 'Debit note'], ['F6', 'Receipt'], ['F5', 'Payment'], ['F7', 'Journal'], ['F4', 'Contra'], ['Ctrl + S', 'Save'], ['Enter', 'Next field in a line'], ['/', 'Search everything'], ['Esc', 'Close / back']].map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('')}</tbody></table>`],
    ['faq', 'Questions and problems', `<dl class="faq">
        <dt>I forgot my username or password.</dt><dd>On the sign-in screen choose <b>Forgot username or password?</b>, enter your recovery code (and username, if you remember it) and a new password. Your username is shown and you get a new code, because each code works once. Staff accounts: the owner sets a new password in Settings → Users & roles. To get a new code at any time: person icon → <b>New recovery code</b>.</dd>
        <dt>I can't edit an invoice.</dt><dd>It is in a filed GST month, a locked period, or has an IRN. Issue a credit note, or cancel the IRN within 24 hours.</dd>
        <dt>The journal won't save.</dt><dd>Debit and credit must be equal; the alert shows the difference. Every journal also needs a narration.</dd>
        <dt>TDS was not deducted on a bill.</dt><dd>Check the vendor has a payment code, and whether the threshold was crossed. You can choose the code on the bill directly.</dd>
        <dt>The balance sheet doesn't tally.</dt><dd>Opening balances are out; Chart of accounts shows the difference.</dd>
        <dt>A feature shows 🔒.</dt><dd>It is outside your plan; see Plan & billing. Your data stays available.</dd>
        <dt>The bill photo was read wrongly.</dt><dd>Correct the fields before saving, or retake the photo flat and in good light.</dd></dl>`],
    ['glossary', 'Glossary', `<dl class="faq">
        <dt>GSTIN</dt><dd>15-character GST number; the first two digits are the state code.</dd>
        <dt>Place of supply</dt><dd>Decides CGST + SGST (same state) or IGST (another state).</dd>
        <dt>ITC</dt><dd>Input tax credit: GST paid on purchases, set off against GST on sales.</dd>
        <dt>RCM</dt><dd>Reverse charge: the buyer pays the GST instead of the seller.</dd>
        <dt>IRN / e-invoice</dt><dd>Invoice reference number from the government's invoice portal; needed above ₹5 crore turnover.</dd>
        <dt>LUT</dt><dd>Letter of undertaking to export or supply to SEZ without paying IGST.</dd>
        <dt>QRMP</dt><dd>Quarterly returns with monthly payment, for turnover up to ₹5 crore.</dd>
        <dt>TDS / TCS</dt><dd>Tax deducted at source on payments / collected at source on sales.</dd>
        <dt>Payment code</dt><dd>The four-digit code for each kind of TDS / TCS under the Income-tax Act 2025.</dd>
        <dt>BSR code</dt><dd>7-digit bank branch code printed on a tax challan.</dd>
        <dt>Schedule III</dt><dd>The format for the balance sheet and profit and loss under the Companies Act, 2013.</dd></dl>`]
];

let manualQ = '';
function viewManual() {
    const words = manualQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const shown = MANUAL.filter(([, t, h]) => words.every(w => (t + h).toLowerCase().includes(w)));
    $('#view').innerHTML = pageHead('User manual', 'How to use every part of We Create ERP, step by step.',
        `<input type="search" placeholder="Search the manual" value="${esc(manualQ)}" oninput="manualQ=this.value;clearTimeout(window._mq);window._mq=setTimeout(()=>{viewManual();$('#view input[type=search]').focus()},250)" style="min-width:240px"><button class="btn btn-s btn-sm" onclick="printManual()">${ic('print')} Print / PDF</button>`)
        + `<div class="manual"><nav class="manual-toc">${shown.map(([id, t], i) => `<a href="javascript:void 0" onclick="document.getElementById('man-${id}').scrollIntoView({behavior:'smooth'})">${i + 1}. ${esc(t)}</a>`).join('')}</nav>
        <div class="card manual-body">${shown.map(([id, t, h], i) => `<article class="man" id="man-${id}"><h3>${i + 1}. ${esc(t)}</h3>${h}</article>`).join('') || '<p class="note">No sections match your search.</p>'}</div></div>`;
}
function printManual() {
    printHtml(`<div class="inv"><div class="stmt-title"><b>We Create ERP — User manual</b><span>${APP_VERSION}</span></div>${MANUAL.map(([, t, h], i) => `<h3 style="margin:16px 0 6px">${i + 1}. ${esc(t)}</h3><div style="font-size:12px;line-height:1.5">${h}</div>`).join('')}</div>`);
}
