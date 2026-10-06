# We Create ERP — test build

Accounting, GST, TDS and audit software for Indian businesses and their auditors, modelled on Zoho Books
and built to fix its gaps. This is the **local test build**: one HTML file, data saved in the browser.

## Open it
Live (test build): https://vigneshannamalai-ai.github.io/we-create-erp/ — each visitor's data stays in their own browser.

Or locally: Double-click `dist/we-create-erp.html` (Chrome or Edge). On first open, create the owner account and tick
"Add a sample company" to explore with 18 months of entries.

## Change and rebuild
Source is in `src/` (`index.html`, `styles.css`, `js/*.js`). After editing:

    python3 build.py            # rebuilds dist/we-create-erp.html and docs/index.html (the website)
    tests/run.sh                # rebuilds and runs the automated checks in headless Chrome
    tests/mobile.sh             # checks every screen fits a 390 px and 360 px phone

## What it does
- Sales invoices, purchase bills, credit / debit notes, receipts, payments, journals, contra — Tally keys (F4–F9).
- Scan a bill (photo or PDF): reads GSTINs, invoice no., date, HSN, taxable value, GST and total; decides
  purchase vs sale from the GSTINs; finds or creates the party; you review and save. The file is attached.
- Every entry posts double-entry automatically to ledgers, GST, TDS, bills outstanding and stock.
- Statements: Profit & Loss, Balance Sheet (Schedule III, with previous-year figures), Cash Flow (indirect,
  AS 3), Trial Balance, Day Book, Ledgers, ageing, MSME 45-day dues, registers, HSN summary, stock.
- GST: CGST/SGST vs IGST from place of supply, exports/SEZ under LUT, reverse charge, blocked credit,
  GSTR-1 (with portal JSON), GSTR-3B with Rule 88A set-off, GSTR-2B import and matching, IMS actions,
  e-invoice JSON (INV-01) with a TEST IRN, e-way bill (TEST number), pre-filing health check.
- TDS under the Income-tax Act 2025 (section 393; old section numbers shown), thresholds, 20% without PAN,
  monthly deposit tracking, Form 140 data.
- Legal guards: always-on hash-chained audit trail (Rule 3(1)), gap-free numbering per FY, no deleting
  (cancel keeps the number), lock date, entries in filed GST periods locked, IRN invoices locked, 30-day
  e-invoice limit, cash receipt ≥ ₹2 lakh refused, cash payment > ₹10,000 warned, credit-note time limit.
- TDS / TCS with the Income-tax Act 2025 payment codes (e.g. 1027 = old 194J(b)), TCS on sales, deposit
  tracking with challan details and late-deposit interest, and quarterly return preparation for Form 140
  (TDS) and Form 143 (TCS): checks, interest, late fee and deductee / challan exports.
- Journal alerts (debit ≠ credit shown live and a pop-up on save), warnings for negative cash, overdraft,
  over-payment, negative stock, duplicate invoices and large journals.
- Settings: invoice logo, signature and UPI payment QR, GST type (regular / composition) and frequency
  (monthly / QRMP), TDS deductor details, preferences, WhatsApp templates, CSV import.
- Plans (Starter / Standard / Professional / Enterprise, prices are placeholders in src/js/plans.js), a 14-day
  trial, feature locks, usage limits and an upgrade / payment screen (test mode). Books, statements, audit
  trail and backups are never locked.
- Scanned bills post themselves when they read cleanly (GSTINs valid, totals agree, not a duplicate); the rest wait
  under "Needs checking".
- GST step-by-step for the month: GSTR-1 JSON, GSTR-2B import with claim / hold advice per bill (credit only
  for bills in 2B, carried forward until they appear), GSTR-3B JSON in the GSTN format, GSTR-9 tables + CSV.
- TDS payment helper: challan details by payment code, link to e-Pay Tax, record the challan afterwards.
- Payroll: employees, monthly run (PF, ESI, TN professional tax, TDS, LOP, advances), payroll journal, salary
  payment, statutory dues, PF ECR text and Form 138 annexure.
- Connected dashboards: STAY BAY (payroll only) and Eco Pack (company, items, opening stock, customers,
  invoices, receipts, raw-material bills, daily production, repairs, payroll); re-sync never duplicates.
- Production (stock journal): materials consumed → finished goods at moving average cost; P&L shows cost
  of materials consumed and change in finished goods.
- Built-in, searchable user manual.
- Forgot username / password: one-time recovery code shown when the owner account is created (single use,
  5 wrong tries lock it for 15 minutes); the server version will use OTP to mobile / email instead.
- Practice workspace for CAs (all companies and their filing status), roles (owner, accountant, read-only
  auditor), auditor queries on any voucher, compliance calendar, bank reconciliation, backup / restore.

## Not yet (needs the server version)
- Data lives only in this browser; no sync between computers. Download backups from Settings.
- IRN, e-way bill and return filing are simulated; live filing needs a licensed GSP / ASP connection.
- Bill photo reading uses Tesseract OCR in the browser and needs internet the first time; accuracy on
  real phone photos (blur, angles, handwriting) still has to be tested with real bills.
- Multi-currency and inventory warehouses are not in this build.
- Connected dashboards are read from the same browser (or a backup file); live server-to-server sync comes with the server version.
- Subscription payments are simulated; a real gateway (Razorpay / PayU) comes with the server version.
- TDS / TCS returns are prepared here but filed through the government utility (RPU / FVU) for now.
