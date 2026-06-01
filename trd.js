const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  TabStopType, TabStopPosition, PositionalTab, PositionalTabAlignment,
  PositionalTabRelativeTo, PositionalTabLeader
} = require('docx');
const fs = require('fs');

// ─── Color palette ───────────────────────────────────────────────────────────
const C = {
  navy:      "1A3A5C",
  blue:      "2563A8",
  lightBlue: "D6E4F0",
  teal:      "0F6E56",
  lightTeal: "D1EDE6",
  amber:     "854F0B",
  lightAmb:  "FEF3DC",
  red:       "A32D2D",
  lightRed:  "FCEBEB",
  gray:      "444441",
  lightGray: "F1EFE8",
  midGray:   "B4B2A9",
  white:     "FFFFFF",
  black:     "1A1A1A",
};

// ─── Borders helpers ─────────────────────────────────────────────────────────
const cellBorder = (color = "CCCCCC") => ({
  top:    { style: BorderStyle.SINGLE, size: 4, color },
  bottom: { style: BorderStyle.SINGLE, size: 4, color },
  left:   { style: BorderStyle.SINGLE, size: 4, color },
  right:  { style: BorderStyle.SINGLE, size: 4, color },
});
const noBorder = () => ({
  top:    { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left:   { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right:  { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
});
const bottomOnly = (color, size = 6) => ({
  top:    { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.SINGLE, size, color },
  left:   { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right:  { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
});

// ─── Spacing helpers ─────────────────────────────────────────────────────────
const sp = (before, after) => ({ spacing: { before, after } });
const cellPad = { top: 80, bottom: 80, left: 120, right: 120 };
const cellPadLg = { top: 120, bottom: 120, left: 160, right: 160 };

// ─── Text helpers ────────────────────────────────────────────────────────────
const run = (text, opts = {}) => new TextRun({ text, font: "Arial", size: 20, ...opts });
const bold = (text, opts = {}) => run(text, { bold: true, ...opts });
const runSm = (text, opts = {}) => new TextRun({ text, font: "Arial", size: 18, ...opts });
const runLg = (text, opts = {}) => new TextRun({ text, font: "Arial", size: 22, ...opts });

// ─── Paragraph helpers ────────────────────────────────────────────────────────
const p = (children, opts = {}) => new Paragraph({
  children: Array.isArray(children) ? children : [run(children)],
  ...opts
});
const pBold = (text, opts = {}) => p([bold(text)], opts);

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  children: [new TextRun({ text, font: "Arial", size: 36, bold: true, color: C.navy })],
  ...sp(400, 200),
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.blue, space: 4 } },
});
const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  children: [new TextRun({ text, font: "Arial", size: 28, bold: true, color: C.blue })],
  ...sp(320, 120),
});
const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  children: [new TextRun({ text, font: "Arial", size: 24, bold: true, color: C.gray })],
  ...sp(240, 80),
});
const h4 = (text) => new Paragraph({
  children: [new TextRun({ text, font: "Arial", size: 22, bold: true, color: C.teal })],
  ...sp(200, 60),
});

const bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: "bullets", level },
  children: [run(text)],
  ...sp(40, 40),
});
const numItem = (text, level = 0) => new Paragraph({
  numbering: { reference: "numbers", level },
  children: [run(text)],
  ...sp(40, 40),
});
const bulletBold = (label, rest, level = 0) => new Paragraph({
  numbering: { reference: "bullets", level },
  children: [bold(label), run(rest)],
  ...sp(40, 40),
});

const rule = () => new Paragraph({
  children: [run("")],
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.midGray, space: 1 } },
  ...sp(80, 80),
});
const gap = (pts = 80) => new Paragraph({ children: [run("")], ...sp(pts, 0) });

// ─── Table helpers ───────────────────────────────────────────────────────────
const hdrCell = (text, width, color = C.navy) => new TableCell({
  borders: cellBorder(C.blue),
  shading: { fill: color, type: ShadingType.CLEAR },
  margins: cellPad,
  width: { size: width, type: WidthType.DXA },
  verticalAlign: VerticalAlign.CENTER,
  children: [p([new TextRun({ text, font: "Arial", size: 19, bold: true, color: C.white })],
    { alignment: AlignmentType.LEFT })],
});
const dataCell = (children, width, shade = null) => new TableCell({
  borders: cellBorder("CCCCCC"),
  shading: shade ? { fill: shade, type: ShadingType.CLEAR } : undefined,
  margins: cellPad,
  width: { size: width, type: WidthType.DXA },
  verticalAlign: VerticalAlign.TOP,
  children: Array.isArray(children) ? children : [p(Array.isArray(children) ? children : [run(children)])],
});
const dataCellStr = (text, width, shade = null, bold_ = false) =>
  dataCell([p([bold_ ? bold(text) : run(text)])], width, shade);

// ─── Badge cell ──────────────────────────────────────────────────────────────
const badge = (text, width, fill, textColor = C.white) => new TableCell({
  borders: cellBorder("CCCCCC"),
  shading: { fill, type: ShadingType.CLEAR },
  margins: cellPad,
  width: { size: width, type: WidthType.DXA },
  verticalAlign: VerticalAlign.CENTER,
  children: [p([new TextRun({ text, font: "Arial", size: 18, bold: true, color: textColor })],
    { alignment: AlignmentType.CENTER })],
});

// ─── Simple 2-col info table ─────────────────────────────────────────────────
const infoTable = (rows) => new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [2800, 6560],
  rows: rows.map(([label, value], i) => new TableRow({
    children: [
      new TableCell({
        borders: cellBorder("B4B2A9"),
        shading: { fill: C.lightGray, type: ShadingType.CLEAR },
        margins: cellPad,
        width: { size: 2800, type: WidthType.DXA },
        children: [p([bold(label)])],
      }),
      new TableCell({
        borders: cellBorder("B4B2A9"),
        margins: cellPad,
        width: { size: 6560, type: WidthType.DXA },
        children: [p([run(value)])],
      }),
    ],
  })),
});

// ─── Field definition table ───────────────────────────────────────────────────
// Cols: Field | Type | Required | Validation | Notes
// Widths summing to 9360
const fieldTable = (headers, rows, widths) => new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: widths,
  rows: [
    new TableRow({
      tableHeader: true,
      children: headers.map((h, i) => hdrCell(h, widths[i])),
    }),
    ...rows.map((row, ri) => new TableRow({
      children: row.map((cell, ci) => {
        if (typeof cell === 'object' && cell.badge) {
          return badge(cell.text, widths[ci], cell.fill, cell.textColor || C.white);
        }
        return dataCellStr(cell, widths[ci], ri % 2 === 0 ? null : C.lightGray);
      }),
    })),
  ],
});

// ─── Page break ──────────────────────────────────────────────────────────────
const pageBreak = () => new Paragraph({
  children: [new TextRun({ break: 1 })],
  ...sp(0, 0),
});

// ─── Cover page ──────────────────────────────────────────────────────────────
const coverPage = () => [
  gap(600),
  new Paragraph({
    children: [new TextRun({ text: "JCAPL", font: "Arial", size: 80, bold: true, color: C.navy })],
    alignment: AlignmentType.CENTER,
    ...sp(0, 80),
  }),
  new Paragraph({
    children: [new TextRun({ text: "Jay Copper Alloy Private Limited", font: "Arial", size: 26, color: C.blue })],
    alignment: AlignmentType.CENTER,
    ...sp(0, 400),
  }),
  new Paragraph({
    children: [new TextRun({ text: "Technical Requirements Document", font: "Arial", size: 52, bold: true, color: C.black })],
    alignment: AlignmentType.CENTER,
    border: {
      top: { style: BorderStyle.SINGLE, size: 12, color: C.blue, space: 8 },
      bottom: { style: BorderStyle.SINGLE, size: 12, color: C.blue, space: 8 },
    },
    ...sp(120, 120),
  }),
  new Paragraph({
    children: [new TextRun({ text: "Inventory & Procurement Management System", font: "Arial", size: 34, bold: true, color: C.teal })],
    alignment: AlignmentType.CENTER,
    ...sp(80, 500),
  }),
  infoTable([
    ["Document No.",    "JCAPL-TRD-IMS-001"],
    ["Version",         "1.0 — Initial Release"],
    ["Prepared by",     "Varun (Systems)"],
    ["Requested by",    "Jay Copper, Hitender (Accounts)"],
    ["Date",            "29 May 2026"],
    ["Status",          "Draft — Pending Review"],
    ["Classification",  "Confidential — Internal Use Only"],
  ]),
  gap(200),
  new Paragraph({
    children: [new TextRun({ text: "This document is confidential and intended solely for internal use at JCAPL. Unauthorized distribution is prohibited.", font: "Arial", size: 16, color: C.midGray, italics: true })],
    alignment: AlignmentType.CENTER,
  }),
  pageBreak(),
];

// ─── TOC placeholder ─────────────────────────────────────────────────────────
const tocSection = () => [
  h1("Table of Contents"),
  ...[
    ["1.", "Executive Summary", "3"],
    ["2.", "Problem Statement & Goals", "3"],
    ["3.", "System Architecture Overview", "4"],
    ["4.", "Module 1 — Procurement", "5"],
    ["5.", "Module 2 — Service Bills", "7"],
    ["6.", "Module 3 — Stock Ledger", "8"],
    ["7.", "Module 4 — Consumption", "10"],
    ["8.", "Module 5 — Reports & Analytics", "11"],
    ["9.", "Database Schema", "12"],
    ["10.", "Business Logic & Rules", "15"],
    ["11.", "Workflows & State Machines", "17"],
    ["12.", "Role-Based Access Control", "18"],
    ["13.", "API Endpoint Reference", "19"],
    ["14.", "Non-Functional Requirements", "21"],
    ["15.", "Open Questions & Decisions", "21"],
    ["16.", "Revision History", "22"],
  ].map(([num, title, pg]) => new Paragraph({
    children: [
      new TextRun({ text: `${num}  ${title}`, font: "Arial", size: 20 }),
      new TextRun({ text: `\t${pg}`, font: "Arial", size: 20 }),
    ],
    tabStops: [{ type: TabStopType.RIGHT, position: 9000, leader: TabStopType.DOT }],
    ...sp(60, 60),
  })),
  pageBreak(),
];

// ─── Section 1: Executive Summary ────────────────────────────────────────────
const sec1 = () => [
  h1("1. Executive Summary"),
  p([run("JCAPL currently operates two separate modules — "), bold("Procurement"), run(" (recording purchase bills from suppliers) and "), bold("Consumption"), run(" (recording material usage by departments). While both modules function independently, there is no central stock register that connects them. This means the organisation cannot answer a fundamental question in real time: "), bold('"How much of item X do we currently have in store?"')]),
  gap(80),
  p([run("This TRD specifies the complete technical design for evolving the existing system into a full "), bold("Inventory & Procurement Management System (IPMS)"), run(" — adding a Central Stock Ledger, Service Bill tracking, mandatory traceability fields (department, JCAPL serial number, store in-charge), automated stock balance computation, low-stock alerting, and management reporting. It also incorporates the requirements raised by Jay Copper (1 May 2026) and Hitender (Accounts).")]),
  gap(80),
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [4680, 4680],
    rows: [
      new TableRow({ children: [
        hdrCell("Current state (AS-IS)", 4680, C.red),
        hdrCell("Target state (TO-BE)", 4680, C.teal),
      ]}),
      ...([
        ["No real-time stock balance", "Live stock balance per item"],
        ["No dept/sub-dept traceability", "Mandatory dept + machine + purpose fields"],
        ["Service bills not tracked", "Dedicated service bill module with cost allocation"],
        ["No JCAPL serial number linkage", "Every procurement has a unique JCAPL ref. no."],
        ["No store in-charge accountability", "Store in-charge sign-off required"],
        ["No low-stock alerts", "Configurable reorder-level alerts"],
        ["No cross-module reporting", "Procurement vs consumption comparison reports"],
      ]).map(([a, b], i) => new TableRow({ children: [
        dataCellStr(a, 4680, i % 2 === 0 ? C.lightRed : null),
        dataCellStr(b, 4680, i % 2 === 0 ? C.lightTeal : null),
      ]})),
    ],
  }),
  pageBreak(),
];

// ─── Section 2: Problem Statement ────────────────────────────────────────────
const sec2 = () => [
  h1("2. Problem Statement & Goals"),
  h2("2.1 Core Problem"),
  p("Procurement adds items to the organisation's inventory and consumption removes them, but no system currently reconciles these two flows into a running balance. This creates three critical operational gaps:"),
  bullet("Stock blindness — No way to know current on-hand quantity for any item without a physical count."),
  bullet("No accountability chain — Who authorised a purchase? Which machine was it for? Which store in-charge received it?"),
  bullet("Service cost leakage — Service bills (labour, repairs, contractor work) are not tracked in the system, making department-wise cost allocation impossible."),
  gap(80),
  h2("2.2 Stakeholder Requirements"),
  fieldTable(
    ["Stakeholder", "Requirement", "Priority"],
    [
      ["Jay Copper (Management)", "Department, sub-dept, purpose, JCAPL serial no., store in-charge on every procurement", "Critical"],
      ["Jay Copper (Management)", "Service bill tracking with full traceability", "Critical"],
      ["Varun (Systems)", "Central stock ledger — live balance per item", "Critical"],
      ["Hitender (Accounts)", "GST-split reporting, cost-per-dept analytics", "High"],
      ["Store In-charge", "Digital acknowledgement of received goods", "High"],
      ["Department Heads", "View consumption vs procurement for their dept", "Medium"],
    ],
    [2200, 5200, 1960]
  ),
  gap(120),
  h2("2.3 Goals & Success Metrics"),
  fieldTable(
    ["Goal", "Metric", "Target"],
    [
      ["Real-time stock visibility", "Time to answer 'current stock of item X'", "< 10 seconds"],
      ["Full procurement traceability", "% of bills with all mandatory fields filled", "100%"],
      ["Service cost tracking", "Service bills entered same day as invoice", "> 95%"],
      ["Low-stock prevention", "Stockout incidents per month", "0"],
      ["Report generation", "Time to generate dept-wise monthly report", "< 30 seconds"],
    ],
    [3000, 4000, 2360]
  ),
  pageBreak(),
];

// ─── Section 3: Architecture Overview ────────────────────────────────────────
const sec3 = () => [
  h1("3. System Architecture Overview"),
  h2("3.1 Module Map"),
  p("The system comprises five interconnected modules. All modules share a single PostgreSQL database. The Stock Ledger is the authoritative source of truth — no module reads stock balance from anywhere else."),
  gap(100),
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1600, 2200, 2400, 3160],
    rows: [
      new TableRow({ tableHeader: true, children: [
        hdrCell("Module", 1600, C.navy),
        hdrCell("Input", 2200, C.navy),
        hdrCell("Output", 2400, C.navy),
        hdrCell("Effect on Stock Ledger", 3160, C.navy),
      ]}),
      ...([
        ["1. Procurement", "Supplier bill, item lines", "Approved procurement record", "+IN entries per item line"],
        ["2. Service Bills", "Vendor invoice, work done", "Service cost record", "No stock movement (cost only)"],
        ["3. Stock Ledger", "Procurement IN / Consumption OUT", "Current balance per item", "IS the ledger — computed"],
        ["4. Consumption", "Dept usage entry", "Consumption record", "-OUT entries per item used"],
        ["5. Reports", "Date range, filters", "PDF / Excel report", "Read-only — no ledger change"],
      ]).map(([a, b, c, d], i) => new TableRow({ children: [
        dataCellStr(a, 1600, i % 2 === 0 ? null : C.lightGray, true),
        dataCellStr(b, 2200, i % 2 === 0 ? null : C.lightGray),
        dataCellStr(c, 2400, i % 2 === 0 ? null : C.lightGray),
        dataCellStr(d, 3160, i % 2 === 0 ? null : C.lightGray),
      ]})),
    ],
  }),
  gap(160),
  h2("3.2 Data Flow"),
  p([bold("Procurement saved"), run(" → system creates one "), bold("stock_ledger_entry"), run(" row per item with "), bold("movement_type = 'IN'"), run(" and quantity = purchased qty. Running balance is auto-computed as: "), bold("balance = SUM(IN qty) - SUM(OUT qty)"), run(" for that item.")]),
  gap(60),
  p([bold("Consumption saved"), run(" → system creates one "), bold("stock_ledger_entry"), run(" row per item with "), bold("movement_type = 'OUT'"), run(". System validates that current balance ≥ qty being consumed before allowing save. If insufficient stock, entry is blocked with an error message.")]),
  gap(60),
  p([bold("Service bill saved"), run(" → creates a "), bold("service_bill"), run(" record linked to department and machine. No stock ledger entry is created. The cost is allocated to the relevant cost centre for reporting purposes.")]),
  gap(120),
  h2("3.3 Tech Stack (Assumed — to be confirmed)"),
  fieldTable(
    ["Layer", "Technology"],
    [
      ["Frontend", "React.js / Next.js (existing)"],
      ["Backend API", "Node.js / Express or similar (existing)"],
      ["Database", "PostgreSQL (recommended) or MySQL"],
      ["File Storage", "Local server or S3-compatible for bill photos"],
      ["PDF Export", "Puppeteer or PDFKit (server-side)"],
      ["Excel Export", "ExcelJS or SheetJS"],
      ["Auth", "Session-based or JWT — roles per Section 12"],
    ],
    [3000, 6360]
  ),
  pageBreak(),
];

// ─── Section 4: Module 1 — Procurement ───────────────────────────────────────
const sec4 = () => [
  h1("4. Module 1 — Procurement"),
  h2("4.1 Purpose"),
  p("Records the purchase of physical goods from external suppliers. Every procurement bill creates stock IN entries in the central ledger. This module is the primary source of stock additions."),
  gap(80),
  h2("4.2 Procurement Header Fields"),
  p("The following fields are required on every procurement entry. Fields marked * are new additions per Jay Copper's request of 1 May 2026."),
  gap(80),
  fieldTable(
    ["Field", "Type", "Required", "Validation / Notes"],
    [
      ["Supplier Name", "Text (autocomplete)", "Yes", "Must match supplier master list; free entry allowed for new suppliers"],
      ["Bill Number", "Text", "Yes", "Unique per supplier; duplicates flagged with warning"],
      ["Bill Date", "Date", "Yes", "Cannot be a future date; default = today"],
      ["Bill Photo", "Image upload", "Yes", "JPEG/PNG, max 5 MB; stored in file server"],
      ["Department *", "Dropdown", "Yes", "Electric / Mechanical / Packing / General / Workshop / Furnace / Extrusion / Admin"],
      ["Sub-department / Machine *", "Text", "Yes", "Free text: machine name + location (e.g. 'TBJ-550, Extrusion floor')"],
      ["Purpose of Purchase *", "Text (multiline)", "Yes", "Brief description of why items are being purchased"],
      ["JCAPL Serial Number *", "Text (auto-gen option)", "Yes", "Unique reference number; system can auto-generate in format JCAPL-YYYY-NNNN"],
      ["Store In-charge Name *", "Dropdown / Text", "Yes", "Person who physically received the goods at the store"],
      ["Notes / Remarks", "Text (multiline)", "No", "Internal notes, e.g. partial delivery, backorder"],
      ["Created By", "System (current user)", "Auto", "Logged-in user — not editable"],
      ["Created At", "Timestamp", "Auto", "Server timestamp — not editable"],
    ],
    [2100, 1700, 1100, 4460]
  ),
  gap(160),
  h2("4.3 Procurement Line Item Fields"),
  p("Each procurement record can have one or more line items. Each line item maps to one stock entry."),
  gap(80),
  fieldTable(
    ["Field", "Type", "Required", "Validation / Notes"],
    [
      ["Item Name", "Text (autocomplete)", "Yes", "Searches item master; new items added to master on save"],
      ["Unit of Measure", "Dropdown", "Yes", "pieces / kg / metres / litres / sets / pairs — must match item master"],
      ["Quantity", "Decimal", "Yes", "Must be > 0; up to 3 decimal places"],
      ["Unit Price (₹)", "Decimal", "Yes", "Price per unit excluding GST; up to 2 decimal places"],
      ["GST Rate (%)", "Dropdown", "Yes", "0 / 5 / 12 / 18 / 28 — GST rate applies to this line"],
      ["GST Amount (₹)", "Decimal", "Computed", "= Quantity × Unit Price × (GST% / 100)"],
      ["Subtotal (₹)", "Decimal", "Computed", "= Quantity × Unit Price"],
      ["Total (₹)", "Decimal", "Computed", "= Subtotal + GST Amount"],
      ["HSN / SAC Code", "Text", "No", "Harmonised tariff code for GST compliance"],
    ],
    [2100, 1500, 1100, 4660]
  ),
  gap(160),
  h2("4.4 Computed Totals"),
  fieldTable(
    ["Field", "Formula"],
    [
      ["Grand Subtotal", "SUM of all line Subtotals"],
      ["Total GST", "SUM of all line GST Amounts"],
      ["Grand Total", "Grand Subtotal + Total GST"],
    ],
    [3000, 6360]
  ),
  gap(120),
  h2("4.5 Business Rules"),
  numItem("A procurement record cannot be saved without at least one line item."),
  numItem("Bill Number + Supplier combination must be unique. Duplicate detection shows a warning — user can override with a justification note."),
  numItem("On successful save, the system automatically creates stock_ledger_entry rows (movement_type = 'IN') for each line item."),
  numItem("Once a procurement is saved and stock entries are created, line item quantities cannot be edited — only the header metadata can be amended. To correct quantities, a Credit Note entry must be made."),
  numItem("JCAPL Serial Number must be unique across all records in the system."),
  numItem("Bill Date must be within the last 90 days (configurable). Older dates require a manager override with reason."),
  pageBreak(),
];

// ─── Section 5: Service Bills ─────────────────────────────────────────────────
const sec5 = () => [
  h1("5. Module 2 — Service Bills"),
  h2("5.1 Purpose"),
  p([run("Service bills record payments for "), bold("work done"), run(" (not goods purchased) — contractor labour, machine repairs, calibration, transport, AMC charges, etc. Unlike procurement, service bills do "), bold("not"), run(" create stock ledger entries. They create cost allocation records that feed into department-wise expense reporting.")]),
  gap(80),
  h2("5.2 Service Bill Fields"),
  fieldTable(
    ["Field", "Type", "Required", "Notes"],
    [
      ["Vendor / Contractor Name", "Text (autocomplete)", "Yes", "Vendor master; new entries added on save"],
      ["Invoice Number", "Text", "Yes", "Vendor's invoice reference"],
      ["Invoice Date", "Date", "Yes", "Date on vendor's invoice"],
      ["Bill Photo / Scan", "Image / PDF upload", "Yes", "JPEG, PNG, or PDF; max 10 MB"],
      ["Service Type", "Dropdown", "Yes", "Repair / Maintenance / Labour / Transport / AMC / Calibration / Other"],
      ["Service Description", "Text (multiline)", "Yes", "Detailed description of work done"],
      ["Department", "Dropdown", "Yes", "Same dept list as Procurement"],
      ["Machine / Asset Name", "Text", "No", "If service was on a specific machine or asset"],
      ["Machine / Asset Code", "Text", "No", "Internal asset tag number"],
      ["Work Order Number", "Text", "No", "Internal work order reference if applicable"],
      ["Labour Hours", "Decimal", "No", "For labour-only bills; used in cost analysis"],
      ["Net Amount (₹)", "Decimal", "Yes", "Amount before GST / TDS"],
      ["GST Rate (%)", "Dropdown", "Yes", "0 / 5 / 12 / 18 — GST on service"],
      ["GST Amount (₹)", "Decimal", "Computed", "Net Amount × GST%"],
      ["TDS Deductible (%)", "Dropdown", "No", "TDS rate if applicable (1% / 2% / 10% etc.)"],
      ["TDS Amount (₹)", "Decimal", "Computed", "Net Amount × TDS%"],
      ["Net Payable (₹)", "Decimal", "Computed", "Net Amount + GST - TDS"],
      ["JCAPL Serial Number", "Text (auto-gen)", "Yes", "Unique ref. in format JCAPL-SVC-YYYY-NNNN"],
      ["Approved By", "Dropdown", "Yes", "Manager who approved the service expense"],
      ["Payment Status", "Dropdown", "Auto", "Pending / Paid / Disputed"],
    ],
    [2400, 1500, 1100, 4360]
  ),
  gap(120),
  h2("5.3 Business Rules"),
  numItem("Service bills are cost-only records. They do not affect the stock ledger under any circumstance."),
  numItem("GST and TDS are computed automatically; user can override with a justification flag."),
  numItem("A service bill can be linked to a procurement order (e.g. installation service for purchased machine). The link is optional."),
  numItem("Payment status transitions: Pending → Paid (accounts marks it paid) or Pending → Disputed (with reason)."),
  numItem("Disputed bills are flagged in the accounts dashboard and cannot be marked Paid until the dispute is resolved."),
  pageBreak(),
];

// ─── Section 6: Stock Ledger ──────────────────────────────────────────────────
const sec6 = () => [
  h1("6. Module 3 — Central Stock Ledger"),
  h2("6.1 Purpose"),
  p("The Stock Ledger is the heart of the IPMS. It maintains a running record of every stock movement — IN (procurement) and OUT (consumption) — for every item. The current balance is the sum of all INs minus all OUTs for a given item. No other module holds stock balance data; everything queries the ledger."),
  gap(80),
  h2("6.2 Item Master"),
  p("Every unique item in the system must have a master record before it can be procured or consumed."),
  gap(60),
  fieldTable(
    ["Field", "Type", "Required", "Notes"],
    [
      ["Item Code", "Text (auto-gen)", "Auto", "System-generated; format ITEM-NNNN"],
      ["Item Name", "Text", "Yes", "Full descriptive name (e.g. 'Safety Shoes Size 7 No')"],
      ["Category", "Dropdown", "Yes", "Safety PPE / Fasteners / Consumables / Raw Material / Spare Parts / Chemicals / Packaging / Tools / Stationery / Other"],
      ["Unit of Measure", "Dropdown", "Yes", "pieces / kg / metres / litres / sets / pairs / boxes — fixed per item"],
      ["Reorder Level", "Decimal", "Yes", "When balance falls to this qty, alert is triggered"],
      ["Minimum Order Qty", "Decimal", "No", "Suggested minimum purchase quantity"],
      ["HSN / SAC Code", "Text", "No", "Default HSN for this item (can be overridden per bill)"],
      ["Standard Rate (₹)", "Decimal", "No", "Standard purchase price for variance reporting"],
      ["Location / Rack", "Text", "No", "Physical storage location in the store"],
      ["Is Active", "Boolean", "Auto", "Inactive items cannot be procured or consumed"],
      ["Created By", "Text", "Auto", "User who first created this item"],
      ["Created At", "Timestamp", "Auto", "First seen in system"],
    ],
    [2200, 1500, 1100, 4560]
  ),
  gap(160),
  h2("6.3 Stock Ledger Entry (Movement Record)"),
  p("Every IN or OUT event creates one row in the ledger. These rows are immutable — they are never edited or deleted. Corrections are made via reversal entries."),
  gap(60),
  fieldTable(
    ["Field", "Type", "Notes"],
    [
      ["Entry ID", "UUID (PK)", "System-generated; globally unique"],
      ["Item Code (FK)", "Text", "References item master"],
      ["Item Name (snapshot)", "Text", "Stored at time of entry — item name may change later"],
      ["Movement Type", "Enum", "IN / OUT / OPENING / RETURN / ADJUSTMENT"],
      ["Quantity", "Decimal", "Always positive; sign determined by movement type"],
      ["Unit of Measure", "Text", "Copied from item master at time of entry"],
      ["Unit Rate (₹)", "Decimal", "Purchase rate (for IN) or last known rate (for OUT)"],
      ["Source Module", "Enum", "PROCUREMENT / CONSUMPTION / OPENING / ADJUSTMENT"],
      ["Source Record ID", "UUID (FK)", "ID of the procurement or consumption record"],
      ["Department", "Text", "Department associated with this movement"],
      ["Running Balance", "Decimal", "Computed: sum of all qty (+ for IN, - for OUT) up to this entry"],
      ["Movement Date", "Date", "Date of the physical movement (bill date / usage date)"],
      ["Entered By", "Text", "System user who created the entry"],
      ["Entered At", "Timestamp", "Server timestamp"],
      ["Remarks", "Text", "Notes; mandatory for ADJUSTMENT type"],
    ],
    [2400, 1600, 5360]
  ),
  gap(160),
  h2("6.4 Balance Computation Logic"),
  p([bold("Current Balance for an item"), run(" = SUM of all IN quantities (types: IN, OPENING, RETURN) minus SUM of all OUT quantities (types: OUT) minus SUM of all negative ADJUSTMENT quantities + SUM of all positive ADJUSTMENT quantities.")]),
  gap(60),
  p([bold("Formula:"), run("  balance = Σ(IN qty) + Σ(OPENING qty) + Σ(RETURN qty) - Σ(OUT qty) + Σ(positive ADJ qty) - Σ(negative ADJ qty)")]),
  gap(60),
  p("This is computed at query time by aggregating the ledger. For performance, a materialised view or cached balance column (invalidated on every new entry) should be used in production."),
  gap(120),
  h2("6.5 Opening Stock Entry"),
  p("When the system goes live, a one-time OPENING entry per item must be made to seed the ledger with current physical stock. This requires a physical count of all items in store before go-live. Opening entries are entered by the Store In-charge and approved by a manager."),
  gap(120),
  h2("6.6 Stock Adjustment"),
  p("After periodic physical counts, if the system balance does not match the physical count, a ADJUSTMENT entry is made with a mandatory reason (e.g. 'Breakage', 'Theft', 'Counting error'). Adjustments are logged and visible in the audit trail."),
  gap(120),
  h2("6.7 Low-Stock Alert Logic"),
  p([bold("Trigger condition:"), run(" After any OUT entry, if running_balance ≤ reorder_level for that item, the system creates a low-stock alert.")]),
  bullet([bold("Alert shown:"), run(" In the Store In-charge dashboard as a red banner.")]),
  bullet([bold("Notification:"), run(" Optional — email or WhatsApp message to configured recipient(s).")]),
  bullet([bold("Resolution:"), run(" Alert clears automatically when a new IN entry raises the balance above reorder_level.")]),
  pageBreak(),
];

// ─── Section 7: Consumption ───────────────────────────────────────────────────
const sec7 = () => [
  h1("7. Module 4 — Consumption"),
  h2("7.1 Purpose"),
  p("Records the internal use of stocked items by departments and machines. Each consumption entry reduces the stock ledger balance for the affected items. Consumption is the primary source of stock reductions."),
  gap(80),
  h2("7.2 Consumption Header Fields"),
  fieldTable(
    ["Field", "Type", "Required", "Notes"],
    [
      ["Consumption Date", "Date", "Yes", "Date items were actually used; default = today"],
      ["Department", "Dropdown", "Yes", "Electric / Mechanical / Packing / General / Workshop / Furnace / Extrusion / Admin"],
      ["Sub-department / Machine", "Text", "Yes", "Machine name + location (e.g. 'TBJ-550, Extrusion floor')"],
      ["Work Order / Job Reference", "Text", "No", "Optional link to production order or maintenance job"],
      ["Number of People", "Integer", "No", "Crew size who used the items (for labour cost allocation)"],
      ["Supervisor / Approved By", "Dropdown / Text", "Yes", "Person authorising the consumption"],
      ["Notes / Purpose", "Text (multiline)", "No", "Why the items were consumed"],
      ["Created By", "Text", "Auto", "Logged-in user"],
      ["Created At", "Timestamp", "Auto", "Server timestamp"],
    ],
    [2400, 1500, 1100, 4360]
  ),
  gap(160),
  h2("7.3 Consumption Line Item Fields"),
  fieldTable(
    ["Field", "Type", "Required", "Validation"],
    [
      ["Item Name", "Text (autocomplete)", "Yes", "Must exist in item master; searches by name/code"],
      ["Unit of Measure", "Text", "Auto", "Pulled from item master — not editable"],
      ["Quantity Used", "Decimal", "Yes", "Must be > 0 and ≤ current stock balance (system validates)"],
      ["Current Balance (shown)", "Decimal", "Display", "Read-only — shown to help user enter correct qty"],
      ["Balance After (shown)", "Decimal", "Display", "Preview of balance after this consumption is saved"],
      ["Cost per Unit (₹)", "Decimal", "Auto", "Last purchase price from ledger — for cost reporting"],
      ["Total Cost (₹)", "Decimal", "Computed", "Qty Used × Cost per Unit"],
    ],
    [2200, 1600, 1100, 4460]
  ),
  gap(120),
  h2("7.4 Business Rules"),
  numItem("System must validate that Quantity Used ≤ current balance before allowing save. If stock is insufficient, display the current balance and block the save."),
  numItem("A consumption entry with zero balance for an item cannot be saved unless a manager override code is entered (for urgent physical issues requiring immediate entry)."),
  numItem("Once saved, line item quantities cannot be edited. A Return entry (movement_type = RETURN) must be made if items are returned to store."),
  numItem("The system shows a live 'Balance After' preview for each line item as the user types the quantity."),
  numItem("Cost allocation uses the Last Purchase Price (LPP) method — the cost per unit is taken from the most recent IN entry for that item."),
  pageBreak(),
];

// ─── Section 8: Reports ───────────────────────────────────────────────────────
const sec8 = () => [
  h1("8. Module 5 — Reports & Analytics"),
  h2("8.1 Standard Reports"),
  gap(60),
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2800, 3560, 3000],
    rows: [
      new TableRow({ tableHeader: true, children: [
        hdrCell("Report Name", 2800, C.navy),
        hdrCell("Description", 3560, C.navy),
        hdrCell("Filters Available", 3000, C.navy),
      ]}),
      ...([
        ["Current Stock Status", "All items with current balance, reorder level, and status (OK / LOW / OUT)", "Category, item name, low-stock only"],
        ["Stock Ledger (Item-wise)", "Full IN/OUT history for a selected item", "Item, date range, movement type"],
        ["Procurement Summary", "All purchases in a period with totals and GST breakdown", "Date range, supplier, dept"],
        ["Consumption Summary", "All consumption in a period with cost allocation", "Date range, dept, machine, item"],
        ["Procurement vs Consumption", "Side-by-side comparison: what was bought vs used", "Date range, item, dept"],
        ["Dept-wise Cost Report", "Total material + service cost per department", "Date range, dept"],
        ["Service Bill Report", "All service bills with TDS/GST/payment status", "Date range, vendor, dept, status"],
        ["Low-Stock Alert Report", "Items currently at or below reorder level", "Category, dept"],
        ["Supplier-wise Purchase", "Total procurement per supplier with item detail", "Date range, supplier"],
        ["Opening vs Current Stock", "Comparison of opening balance vs current balance", "Category, item"],
      ]).map(([a, b, c], i) => new TableRow({ children: [
        dataCellStr(a, 2800, i % 2 === 0 ? null : C.lightGray, true),
        dataCellStr(b, 3560, i % 2 === 0 ? null : C.lightGray),
        dataCellStr(c, 3000, i % 2 === 0 ? null : C.lightGray),
      ]})),
    ],
  }),
  gap(160),
  h2("8.2 Export Formats"),
  bullet([bold("PDF:"), run(" Formatted report with JCAPL header, date, filters applied, and page numbers. Suitable for printing and sharing.")]),
  bullet([bold("Excel (XLSX):"), run(" Raw data with all columns, suitable for further analysis in Excel. One sheet per report section.")]),
  bullet([bold("On-screen:"), run(" Interactive table with column sorting, filtering, and pagination.")]),
  gap(120),
  h2("8.3 Procurement Comparison (Existing Feature — Enhanced)"),
  p("The existing 'Procurement Comparison' feature is retained and enhanced:"),
  bullet("Compare total procurement cost vs total consumption cost by department for any date range."),
  bullet("Highlight items where consumption exceeds procurement (potential data entry error or unrecorded procurement)."),
  bullet("Highlight items with procurement but zero consumption (possible overstock or unrecorded usage)."),
  pageBreak(),
];

// ─── Section 9: Database Schema ───────────────────────────────────────────────
const sec9 = () => [
  h1("9. Database Schema"),
  h2("9.1 Tables Overview"),
  fieldTable(
    ["Table Name", "Purpose", "Key Relationships"],
    [
      ["departments", "Master list of departments and sub-departments", "Referenced by procurement, consumption, service_bills"],
      ["suppliers", "Supplier master — name, GST number, contact", "Referenced by procurements"],
      ["vendors", "Service vendor master — name, PAN, GST", "Referenced by service_bills"],
      ["items", "Item master — all stockable items", "Referenced by ledger, procurement_lines, consumption_lines"],
      ["procurements", "Procurement header record", "Has many procurement_lines; belongs to supplier, dept"],
      ["procurement_lines", "Individual line items per procurement", "Belongs to procurements and items"],
      ["service_bills", "Service bill records", "Belongs to vendors and departments"],
      ["stock_ledger_entries", "Every stock movement — immutable event log", "References items, procurements or consumptions"],
      ["consumptions", "Consumption header record", "Has many consumption_lines; belongs to dept"],
      ["consumption_lines", "Individual items consumed", "Belongs to consumptions and items; triggers ledger OUT"],
      ["low_stock_alerts", "Alert records when item falls below reorder level", "References items"],
      ["users", "System users with roles", "Referenced across all modules as created_by, approved_by"],
      ["audit_log", "Every create/update action across all tables", "References all tables and users"],
    ],
    [2500, 3500, 3360]
  ),
  gap(160),
  h2("9.2 Key Table Definitions"),
  h3("items"),
  fieldTable(
    ["Column", "Type", "Constraints"],
    [
      ["id", "UUID", "PRIMARY KEY, DEFAULT gen_random_uuid()"],
      ["item_code", "VARCHAR(20)", "UNIQUE NOT NULL — format ITEM-NNNN"],
      ["item_name", "VARCHAR(255)", "NOT NULL"],
      ["category", "VARCHAR(100)", "NOT NULL"],
      ["unit_of_measure", "VARCHAR(50)", "NOT NULL"],
      ["reorder_level", "DECIMAL(10,3)", "NOT NULL DEFAULT 0"],
      ["minimum_order_qty", "DECIMAL(10,3)", ""],
      ["hsn_code", "VARCHAR(20)", ""],
      ["standard_rate", "DECIMAL(10,2)", ""],
      ["location_rack", "VARCHAR(100)", ""],
      ["is_active", "BOOLEAN", "NOT NULL DEFAULT true"],
      ["created_by", "UUID", "FK → users.id"],
      ["created_at", "TIMESTAMPTZ", "DEFAULT now()"],
    ],
    [2500, 2000, 4860]
  ),
  gap(120),
  h3("procurements"),
  fieldTable(
    ["Column", "Type", "Constraints"],
    [
      ["id", "UUID", "PRIMARY KEY"],
      ["jcapl_serial_number", "VARCHAR(30)", "UNIQUE NOT NULL — format JCAPL-YYYY-NNNN"],
      ["supplier_id", "UUID", "FK → suppliers.id NOT NULL"],
      ["bill_number", "VARCHAR(100)", "NOT NULL"],
      ["bill_date", "DATE", "NOT NULL"],
      ["bill_photo_url", "TEXT", "NOT NULL"],
      ["department_id", "UUID", "FK → departments.id NOT NULL"],
      ["sub_department_machine", "VARCHAR(255)", "NOT NULL"],
      ["purpose_of_purchase", "TEXT", "NOT NULL"],
      ["store_incharge_id", "UUID", "FK → users.id NOT NULL"],
      ["grand_subtotal", "DECIMAL(12,2)", "NOT NULL"],
      ["total_gst", "DECIMAL(12,2)", "NOT NULL"],
      ["grand_total", "DECIMAL(12,2)", "NOT NULL"],
      ["notes", "TEXT", ""],
      ["created_by", "UUID", "FK → users.id"],
      ["created_at", "TIMESTAMPTZ", "DEFAULT now()"],
    ],
    [2500, 2000, 4860]
  ),
  gap(120),
  h3("stock_ledger_entries"),
  fieldTable(
    ["Column", "Type", "Constraints"],
    [
      ["id", "UUID", "PRIMARY KEY"],
      ["item_id", "UUID", "FK → items.id NOT NULL"],
      ["item_name_snapshot", "VARCHAR(255)", "NOT NULL — copy at time of entry"],
      ["movement_type", "ENUM", "IN / OUT / OPENING / RETURN / ADJUSTMENT NOT NULL"],
      ["quantity", "DECIMAL(10,3)", "NOT NULL CHECK (quantity > 0)"],
      ["unit_of_measure", "VARCHAR(50)", "NOT NULL"],
      ["unit_rate", "DECIMAL(10,2)", ""],
      ["source_module", "ENUM", "PROCUREMENT / CONSUMPTION / OPENING / ADJUSTMENT NOT NULL"],
      ["source_record_id", "UUID", "FK to procurement or consumption"],
      ["department_id", "UUID", "FK → departments.id"],
      ["movement_date", "DATE", "NOT NULL"],
      ["running_balance", "DECIMAL(10,3)", "Computed and stored for performance"],
      ["entered_by", "UUID", "FK → users.id NOT NULL"],
      ["entered_at", "TIMESTAMPTZ", "DEFAULT now()"],
      ["remarks", "TEXT", "Required for ADJUSTMENT type"],
    ],
    [2500, 2000, 4860]
  ),
  gap(100),
  p([new TextRun({ text: "Note: ", font: "Arial", size: 20, bold: true }), run("stock_ledger_entries is an append-only table. No UPDATE or DELETE operations are permitted on this table by any application code. Corrections must be made via new ADJUSTMENT entries with mandatory remarks.")]),
  pageBreak(),
];

// ─── Section 10: Business Logic ────────────────────────────────────────────────
const sec10 = () => [
  h1("10. Business Logic & Rules"),
  h2("10.1 JCAPL Serial Number Generation"),
  p("The system auto-generates JCAPL serial numbers in two formats:"),
  bullet([bold("Material Procurement:"), run("  JCAPL-YYYY-NNNN  (e.g. JCAPL-2026-0041)")]),
  bullet([bold("Service Bill:"), run("  JCAPL-SVC-YYYY-NNNN  (e.g. JCAPL-SVC-2026-0012)")]),
  p("The NNNN counter resets to 0001 each calendar year. Numbers are pre-reserved at form-open time to prevent gaps from abandoned entries. Users can override with a manual number subject to uniqueness validation."),
  gap(120),
  h2("10.2 GST Computation Rules"),
  fieldTable(
    ["GST Scenario", "Rule"],
    [
      ["CGST + SGST (intra-state purchase)", "GST rate split equally: CGST = rate/2, SGST = rate/2"],
      ["IGST (inter-state purchase)", "Full GST rate applied as IGST"],
      ["Bill-level GST toggle", "User selects intra-state or inter-state per procurement — affects how GST columns appear in reports"],
      ["GST-exempt items (0%)", "Allowed; recorded with GST = 0 for audit trail completeness"],
      ["GST on service bills", "Service GST is always full rate; no CGST/SGST split required for service providers"],
    ],
    [3000, 6360]
  ),
  gap(120),
  h2("10.3 Duplicate Bill Detection"),
  p("Before saving a procurement, the system checks:"),
  bullet("Same bill_number + same supplier_id → hard warning (must confirm override)."),
  bullet("Same bill_date + same supplier_id + same grand_total → soft warning (potential duplicate, confirm)."),
  bullet("All checks are logged in the audit_log, whether overridden or not."),
  gap(120),
  h2("10.4 Stock Validation on Consumption"),
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3000, 6360],
    rows: [
      new TableRow({ tableHeader: true, children: [hdrCell("Condition", 3000, C.navy), hdrCell("System Behaviour", 6360, C.navy)] }),
      ...([
        ["Qty requested ≤ current balance", "Allow save normally"],
        ["Qty requested > current balance (0 < balance < requested)", "Block save. Show error: 'Only X units available. Please adjust quantity.'"],
        ["Current balance = 0", "Block save. Show error: 'Item out of stock. Raise a procurement request.'"],
        ["Manager override mode", "Allows save with balance < qty if manager enters override PIN. Creates an ADJUSTMENT entry automatically with reason 'Emergency override'."],
      ]).map(([a, b], i) => new TableRow({ children: [
        dataCellStr(a, 3000, i % 2 === 0 ? null : C.lightGray, true),
        dataCellStr(b, 6360, i % 2 === 0 ? null : C.lightGray),
      ]})),
    ],
  }),
  gap(120),
  h2("10.5 Price Valuation Method"),
  p([bold("Last Purchase Price (LPP):"), run(" For consumption cost reporting, the unit cost is taken from the most recent IN entry for that item. This is the simplest method and recommended for JCAPL's operational scale.")]),
  gap(60),
  p([bold("Future option — Weighted Average Cost (WAC):"), run(" If needed, this can be added later by computing WAC = total value of stock / total quantity in stock at time of OUT entry. This requires no schema change — only a query change.")]),
  gap(120),
  h2("10.6 Immutability Rules"),
  fieldTable(
    ["Record Type", "Can Edit Header?", "Can Edit Lines?", "Correction Method"],
    [
      ["Procurement (saved)", "Yes — metadata only (notes, sub-dept)", "No", "Credit Note / Return entry in ledger"],
      ["Service Bill", "Yes — all fields until Paid", "N/A", "Void and re-enter after Paid status"],
      ["Consumption (saved)", "Yes — notes only", "No", "Return entry (movement_type = RETURN)"],
      ["Stock Ledger Entry", "No", "No", "New ADJUSTMENT entry with mandatory reason"],
      ["Item Master", "Yes — all fields", "N/A", "Direct edit; all history preserved"],
    ],
    [2500, 1600, 1600, 3660]
  ),
  pageBreak(),
];

// ─── Section 11: Workflows ─────────────────────────────────────────────────────
const sec11 = () => [
  h1("11. Workflows & State Machines"),
  h2("11.1 Procurement Workflow"),
  fieldTable(
    ["Step", "Actor", "Action", "System Response"],
    [
      ["1", "Purchasing / Store", "Fill procurement form, upload bill photo", "Validates mandatory fields; shows duplicate warning if any"],
      ["2", "Purchasing / Store", "Add line items with qty, price, GST", "Computes subtotals, GST amounts, grand total in real time"],
      ["3", "Store In-charge", "Confirms receipt — selects own name as store in-charge", "Records store in-charge acknowledgement"],
      ["4", "User", "Clicks Save", "Creates procurement record + stock_ledger_entry rows (IN) + triggers low-stock check"],
      ["5", "System", "Auto-assigns JCAPL Serial Number", "Displays serial number on screen for physical labelling"],
      ["6", "Accounts", "Reviews in procurement log", "Can add notes; cannot change quantities"],
    ],
    [600, 1800, 2800, 4160]
  ),
  gap(120),
  h2("11.2 Consumption Workflow"),
  fieldTable(
    ["Step", "Actor", "Action", "System Response"],
    [
      ["1", "Dept Operator / Supervisor", "Create new consumption — select dept + machine", "Opens consumption form"],
      ["2", "Dept Operator", "Add items used with quantities", "Shows current balance next to each item; validates qty ≤ balance"],
      ["3", "Supervisor", "Reviews and approves (selects own name)", "Approval recorded"],
      ["4", "User", "Clicks Save", "Creates consumption record + stock_ledger_entry rows (OUT); triggers low-stock alert if needed"],
      ["5", "Store In-charge", "Reviews consumption log daily", "Flags discrepancies; raises adjustment if needed"],
    ],
    [600, 1900, 2600, 4260]
  ),
  gap(120),
  h2("11.3 Service Bill Workflow"),
  fieldTable(
    ["Step", "Actor", "Action", "System Response"],
    [
      ["1", "Dept / Maintenance", "Enter service bill details + upload scan", "Validates mandatory fields"],
      ["2", "Manager", "Approves the service bill", "Status set to Approved; appears in Accounts queue"],
      ["3", "Accounts", "Verifies TDS / GST calculation", "Can override computed values with justification"],
      ["4", "Accounts", "Marks as Paid after payment", "Payment date recorded; locked from further edit"],
    ],
    [600, 1900, 2600, 4260]
  ),
  gap(120),
  h2("11.4 Stock Adjustment Workflow"),
  fieldTable(
    ["Step", "Actor", "Action", "System Response"],
    [
      ["1", "Store In-charge", "Conducts physical count; finds discrepancy", ""],
      ["2", "Store In-charge", "Creates adjustment entry: item, qty difference (+ or -), reason", "Validates reason is filled"],
      ["3", "Manager", "Approves adjustment", "Stock ledger ADJUSTMENT entry created; running balance updated"],
      ["4", "System", "Logs in audit trail with approver name", "Visible in stock ledger history for item"],
    ],
    [600, 1900, 2600, 4260]
  ),
  pageBreak(),
];

// ─── Section 12: RBAC ──────────────────────────────────────────────────────────
const sec12 = () => [
  h1("12. Role-Based Access Control"),
  p("The system defines five roles. A user can hold multiple roles (e.g. a Store In-charge who also creates procurement entries)."),
  gap(100),
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2100, 1040, 1040, 1040, 1040, 1040, 1040, 1920],
    rows: [
      new TableRow({ tableHeader: true, children: [
        hdrCell("Module / Action", 2100, C.navy),
        hdrCell("Admin", 1040, C.navy),
        hdrCell("Manager", 1040, C.navy),
        hdrCell("Store\nIn-charge", 1040, C.navy),
        hdrCell("Accounts", 1040, C.navy),
        hdrCell("Dept\nUser", 1040, C.navy),
        hdrCell("Read\nOnly", 1040, C.navy),
        hdrCell("Notes", 1920, C.navy),
      ]}),
      ...([
        ["Create Procurement",        "✓","✓","✓","✗","✗","✗",""],
        ["Approve Procurement",       "✓","✓","✓","✗","✗","✗","Store in-charge sign-off"],
        ["View Procurement",          "✓","✓","✓","✓","✓","✓",""],
        ["Create Service Bill",       "✓","✓","✗","✓","✗","✗",""],
        ["Approve Service Bill",      "✓","✓","✗","✗","✗","✗",""],
        ["Mark Service Bill Paid",    "✓","✗","✗","✓","✗","✗","Accounts only"],
        ["Create Consumption",        "✓","✓","✓","✗","✓","✗",""],
        ["Override Stock Block",      "✓","✓","✗","✗","✗","✗","Manager PIN required"],
        ["Create Stock Adjustment",   "✓","✗","✓","✗","✗","✗",""],
        ["Approve Stock Adjustment",  "✓","✓","✗","✗","✗","✗",""],
        ["Edit Item Master",          "✓","✓","✗","✗","✗","✗",""],
        ["View All Reports",          "✓","✓","✓","✓","✗","✓",""],
        ["View Dept Reports Only",    "✓","✓","✓","✓","✓","✓","Dept users see own dept only"],
        ["Export PDF / Excel",        "✓","✓","✓","✓","✗","✓",""],
        ["Manage Users & Roles",      "✓","✗","✗","✗","✗","✗","Admin only"],
      ]).map(([action, ...rest], i) => {
        const vals = rest.slice(0, 6);
        const note = rest[6];
        return new TableRow({ children: [
          dataCellStr(action, 2100, i % 2 === 0 ? null : C.lightGray, true),
          ...vals.map((v, vi) => {
            const isYes = v === "✓";
            const fill = isYes
              ? (i % 2 === 0 ? "D1EDE6" : "B8E0D4")
              : (i % 2 === 0 ? null : C.lightGray);
            return new TableCell({
              borders: cellBorder("CCCCCC"),
              shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
              margins: cellPad,
              width: { size: 1040, type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({
                children: [new TextRun({ text: v, font: "Arial", size: 20, bold: isYes, color: isYes ? C.teal : "A32D2D" })],
                alignment: AlignmentType.CENTER,
              })],
            });
          }),
          dataCellStr(note, 1920, i % 2 === 0 ? null : C.lightGray),
        ]});
      }),
    ],
  }),
  pageBreak(),
];

// ─── Section 13: API Reference ─────────────────────────────────────────────────
const sec13 = () => [
  h1("13. API Endpoint Reference"),
  p("All endpoints are prefixed with /api/v1. All require authentication. Responses follow the format: { success: bool, data: {}, error: string }."),
  gap(80),
  h2("13.1 Procurement APIs"),
  fieldTable(
    ["Method", "Endpoint", "Description"],
    [
      ["POST",   "/procurements",                 "Create new procurement (validates fields, creates ledger IN entries)"],
      ["GET",    "/procurements",                 "List procurements with filters (date, supplier, dept, JCAPL no.)"],
      ["GET",    "/procurements/:id",             "Get full procurement detail with all line items"],
      ["PATCH",  "/procurements/:id/metadata",    "Update header metadata only (notes, sub-dept, purpose)"],
      ["POST",   "/procurements/jcapl-serial",    "Generate next JCAPL serial number (reserves it)"],
    ],
    [900, 3400, 5060]
  ),
  gap(100),
  h2("13.2 Service Bill APIs"),
  fieldTable(
    ["Method", "Endpoint", "Description"],
    [
      ["POST",   "/service-bills",                "Create new service bill"],
      ["GET",    "/service-bills",                "List with filters (date, vendor, dept, status)"],
      ["GET",    "/service-bills/:id",            "Get full service bill detail"],
      ["PATCH",  "/service-bills/:id",            "Update (only allowed before Paid status)"],
      ["PATCH",  "/service-bills/:id/approve",    "Manager approves service bill"],
      ["PATCH",  "/service-bills/:id/mark-paid",  "Accounts marks as paid"],
    ],
    [900, 3400, 5060]
  ),
  gap(100),
  h2("13.3 Stock Ledger APIs"),
  fieldTable(
    ["Method", "Endpoint", "Description"],
    [
      ["GET",    "/stock/balance",                "Get current balance for all items (or filtered)"],
      ["GET",    "/stock/balance/:itemId",        "Get current balance for one item"],
      ["GET",    "/stock/ledger/:itemId",         "Get full movement history for one item"],
      ["POST",   "/stock/opening",                "Create opening stock entries (one-time, Admin only)"],
      ["POST",   "/stock/adjustment",             "Create stock adjustment entry (Store In-charge + Manager approval)"],
      ["GET",    "/stock/low-alerts",             "List all current low-stock alerts"],
    ],
    [900, 3400, 5060]
  ),
  gap(100),
  h2("13.4 Consumption APIs"),
  fieldTable(
    ["Method", "Endpoint", "Description"],
    [
      ["POST",   "/consumptions",                 "Create consumption entry (validates stock, creates OUT entries)"],
      ["GET",    "/consumptions",                 "List with filters (date, dept, item)"],
      ["GET",    "/consumptions/:id",             "Get full detail with line items"],
      ["POST",   "/consumptions/:id/return",      "Return items to stock (creates RETURN ledger entries)"],
    ],
    [900, 3400, 5060]
  ),
  gap(100),
  h2("13.5 Reports APIs"),
  fieldTable(
    ["Method", "Endpoint", "Description"],
    [
      ["GET",    "/reports/stock-status",         "Current stock status report (all items)"],
      ["GET",    "/reports/procurement-summary",  "Procurement summary for date range"],
      ["GET",    "/reports/consumption-summary",  "Consumption summary for date range"],
      ["GET",    "/reports/vs-comparison",        "Procurement vs consumption comparison"],
      ["GET",    "/reports/dept-cost",            "Department-wise cost report"],
      ["POST",   "/reports/export/pdf",           "Generate and return PDF for any report"],
      ["POST",   "/reports/export/excel",         "Generate and return Excel for any report"],
    ],
    [900, 3400, 5060]
  ),
  gap(100),
  h2("13.6 Master Data APIs"),
  fieldTable(
    ["Method", "Endpoint", "Description"],
    [
      ["GET/POST/PATCH",  "/items",               "Item master CRUD"],
      ["GET/POST/PATCH",  "/suppliers",           "Supplier master CRUD"],
      ["GET/POST/PATCH",  "/vendors",             "Service vendor master CRUD"],
      ["GET/POST/PATCH",  "/departments",         "Department & sub-dept master CRUD"],
      ["GET/POST/PATCH",  "/users",               "User management (Admin only)"],
    ],
    [1800, 2500, 5060]
  ),
  pageBreak(),
];

// ─── Section 14: Non-Functional Requirements ────────────────────────────────────
const sec14 = () => [
  h1("14. Non-Functional Requirements"),
  fieldTable(
    ["Category", "Requirement"],
    [
      ["Performance", "Stock balance query for any item must return in < 1 second for up to 100,000 ledger entries"],
      ["Performance", "Report generation (up to 1 year of data) must complete in < 30 seconds"],
      ["Availability", "System must be available during factory working hours (06:00–22:00 IST) with 99.5% uptime target"],
      ["Data Integrity", "stock_ledger_entries table is append-only — no UPDATE or DELETE permitted via application or direct DB access"],
      ["Audit Trail", "Every create and update action across all tables must be logged in audit_log with user ID and timestamp"],
      ["Security", "All API endpoints require authentication. Role checks enforced server-side — never client-side only"],
      ["File Storage", "Bill photos stored with original filename + UUID prefix. Max 5 MB per image, 10 MB per PDF. Virus scan before storage"],
      ["Backup", "Daily automated database backup retained for 90 days. Weekly backup retained for 1 year"],
      ["Scalability", "System must handle up to 50 concurrent users without degradation"],
      ["Mobile Friendly", "Procurement entry and consumption entry forms must be usable on a mobile browser (responsive design)"],
      ["Browser Support", "Chrome 90+, Edge 90+, Safari 14+. IE not supported"],
      ["Data Retention", "All records retained indefinitely (no auto-deletion). Archiving of records > 5 years is optional"],
    ],
    [2000, 7360]
  ),
  pageBreak(),
];

// ─── Section 15: Open Questions ─────────────────────────────────────────────────
const sec15 = () => [
  h1("15. Open Questions & Decisions Required"),
  p("The following items require decisions from the stakeholders before development begins:"),
  gap(80),
  new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [600, 3760, 2500, 2500],
    rows: [
      new TableRow({ tableHeader: true, children: [
        hdrCell("#", 600, C.navy),
        hdrCell("Question", 3760, C.navy),
        hdrCell("Options", 2500, C.navy),
        hdrCell("Owner / Deadline", 2500, C.navy),
      ]}),
      ...([
        ["1", "Which database — PostgreSQL or MySQL?", "PostgreSQL (recommended for integrity), MySQL (existing infra)", "Varun"],
        ["2", "Price valuation method for consumption costing?", "LPP (Last Purchase Price) or WAC (Weighted Avg)", "Hitender / Accounts"],
        ["3", "Should Bill Date be validated against a fiscal period that is locked?", "Yes (accounts locks period) / No (open)", "Hitender"],
        ["4", "How many departments and sub-departments are there? Need full master list.", "Department master to be provided by Management", "Jay Copper"],
        ["5", "Who are the Store In-charges? Names needed for dropdown.", "Store In-charge list to be provided", "Jay Copper"],
        ["6", "Low-stock alert — email only, or WhatsApp notification too?", "Email / WhatsApp (Twilio/Meta API) / Both", "Management"],
        ["7", "Should service bills require a physical Work Order before entry?", "Yes (WO mandatory) / No (optional)", "Jay Copper / Maintenance"],
        ["8", "Go-live date — this determines the opening stock cut-off date.", "Target date to be confirmed", "Management"],
        ["9", "Multi-site? Are there multiple factory locations or one?", "Single site / Multi-site", "Management"],
        ["10", "Should purchase indent / material request flow be added?", "Phase 1 (out of scope) / Phase 2", "Varun / Management"],
      ]).map(([num, q, opts, owner], i) => new TableRow({ children: [
        dataCellStr(num, 600, i % 2 === 0 ? null : C.lightAmb, true),
        dataCellStr(q, 3760, i % 2 === 0 ? null : C.lightAmb),
        dataCellStr(opts, 2500, i % 2 === 0 ? null : C.lightAmb),
        dataCellStr(owner, 2500, i % 2 === 0 ? null : C.lightAmb),
      ]})),
    ],
  }),
  pageBreak(),
];

// ─── Section 16: Revision History ──────────────────────────────────────────────
const sec16 = () => [
  h1("16. Revision History"),
  fieldTable(
    ["Version", "Date", "Author", "Changes"],
    [
      ["1.0", "29 May 2026", "Varun (Systems)", "Initial draft — full TRD based on requirements from Jay Copper (1 May 2026) and Hitender (Accounts). Covers all 5 modules, DB schema, RBAC, API reference, and open questions."],
    ],
    [900, 1400, 2200, 4860]
  ),
  gap(200),
  rule(),
  gap(80),
  new Paragraph({
    children: [new TextRun({ text: "End of Document — JCAPL-TRD-IMS-001 v1.0", font: "Arial", size: 18, color: C.midGray, italics: true })],
    alignment: AlignmentType.CENTER,
    ...sp(80, 0),
  }),
  new Paragraph({
    children: [new TextRun({ text: "Confidential — Jay Copper Alloy Private Limited", font: "Arial", size: 18, color: C.midGray, italics: true })],
    alignment: AlignmentType.CENTER,
    ...sp(40, 0),
  }),
];

// ─── Header / Footer ─────────────────────────────────────────────────────────
const docHeader = new Header({
  children: [
    new Paragraph({
      children: [
        new TextRun({ text: "JCAPL — Inventory & Procurement Management System  |  TRD v1.0  |  Confidential", font: "Arial", size: 16, color: C.midGray }),
      ],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.midGray, space: 4 } },
      ...sp(0, 80),
    }),
  ],
});
const docFooter = new Footer({
  children: [
    new Paragraph({
      children: [
        new TextRun({ text: "JCAPL-TRD-IMS-001  |  29 May 2026  |  Page ", font: "Arial", size: 16, color: C.midGray }),
        new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: C.midGray }),
        new TextRun({ text: " of ", font: "Arial", size: 16, color: C.midGray }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 16, color: C.midGray }),
      ],
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.midGray, space: 4 } },
      alignment: AlignmentType.RIGHT,
      ...sp(80, 0),
    }),
  ],
});

// ─── Assemble Document ────────────────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Arial", size: 20, color: C.black } },
    },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
        ]},
      { reference: "numbers",
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ]},
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
      },
    },
    headers: { default: docHeader },
    footers: { default: docFooter },
    children: [
      ...coverPage(),
      ...tocSection(),
      ...sec1(),
      ...sec2(),
      ...sec3(),
      ...sec4(),
      ...sec5(),
      ...sec6(),
      ...sec7(),
      ...sec8(),
      ...sec9(),
      ...sec10(),
      ...sec11(),
      ...sec12(),
      ...sec13(),
      ...sec14(),
      ...sec15(),
      ...sec16(),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  const outputPath = "/mnt/user-data/outputs/JCAPL_TRD_IMS_v1.0.docx";
  const fallbackPath = "./JCAPL_TRD_IMS_v1.0.docx";
  try {
    const dir = require('path').dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, buf);
    console.log(`Saved to ${outputPath}`);
  } catch (err) {
    fs.writeFileSync(fallbackPath, buf);
    console.log(`Failed to save to ${outputPath}. Saved to fallback: ${fallbackPath}`);
  }
  console.log("Done.");
});
