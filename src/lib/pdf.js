const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { uploadBillPdf } = require("./s3");

function money(n) {
  return `Rs. ${Number(n).toFixed(2)}`;
}

// Renders a simple, printable itemized final bill and uploads it to S3 as a
// private object. Returns the S3 object key (NOT a public URL) — this is what
// gets stored in bills.pdf_url. Download links are always minted fresh as
// short-lived presigned URLs via GET /api/bills/:id/pdf-url (see lib/s3.js).
async function generateFinalBillPdf({ bill, patient, items }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([595.28, 841.89]); // A4
  const margin = 50;
  let y = 841.89 - margin;
  const lineHeight = 16;

  const draw = (text, { x = margin, size = 10, f = font, color = rgb(0, 0, 0) } = {}) => {
    page.drawText(String(text), { x, y, size, font: f, color });
  };

  draw("Hospital Billing Management System", { size: 16, f: bold });
  y -= 22;
  draw("Final Consolidated Bill", { size: 12, f: bold });
  y -= 26;

  draw(`Bill ID: ${bill.id}`, { size: 10 });
  y -= lineHeight;
  draw(`Generated: ${new Date(bill.generatedAt).toLocaleString()}`, { size: 10 });
  y -= lineHeight * 1.5;

  draw("Patient Details", { size: 11, f: bold });
  y -= lineHeight;
  draw(`Name: ${patient.name}   Age: ${patient.age}   Gender: ${patient.gender}`, { size: 10 });
  y -= lineHeight;
  draw(`Patient ID: ${patient.id}`, { size: 10 });
  y -= lineHeight;
  draw(`Admission: ${new Date(patient.admissionDate).toLocaleString()}`, { size: 10 });
  y -= lineHeight;
  if (patient.dischargeDate) {
    draw(`Discharge: ${new Date(patient.dischargeDate).toLocaleString()}`, { size: 10 });
    y -= lineHeight;
  }
  if (patient.wardRoom) {
    draw(`Ward/Room: ${patient.wardRoom}`, { size: 10 });
    y -= lineHeight;
  }
  y -= lineHeight * 0.5;

  draw("Itemized Charges", { size: 11, f: bold });
  y -= lineHeight;

  const colX = { dept: margin, service: margin + 90, staff: margin + 280, when: margin + 370, amount: margin + 470 };
  draw("Dept", { x: colX.dept, size: 9, f: bold });
  draw("Service", { x: colX.service, size: 9, f: bold });
  draw("By", { x: colX.staff, size: 9, f: bold });
  draw("Date", { x: colX.when, size: 9, f: bold });
  draw("Amount", { x: colX.amount, size: 9, f: bold });
  y -= 12;
  page.drawLine({ start: { x: margin, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  y -= 12;

  const ensureRoom = () => {
    if (y < 90) {
      page = doc.addPage([595.28, 841.89]);
      y = 841.89 - margin;
    }
  };

  for (const item of items) {
    ensureRoom();
    const label = item.isLateEntry ? `${item.serviceName} (late entry)` : item.serviceName;
    draw(item.department, { x: colX.dept, size: 9 });
    draw(label.length > 34 ? label.slice(0, 31) + "..." : label, { x: colX.service, size: 9 });
    draw(item.loggedBy?.name || "-", { x: colX.staff, size: 9 });
    draw(new Date(item.timestamp).toLocaleDateString(), { x: colX.when, size: 9 });
    draw(money(item.amount), { x: colX.amount, size: 9 });
    y -= lineHeight;
  }

  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  y -= 20;

  draw("Subtotal by Department", { size: 11, f: bold });
  y -= lineHeight;
  const subtotals = bill.subtotalByDept || {};
  for (const [dept, amt] of Object.entries(subtotals)) {
    ensureRoom();
    draw(dept, { x: margin, size: 10 });
    draw(money(amt), { x: colX.amount, size: 10 });
    y -= lineHeight;
  }

  y -= 10;
  draw("GRAND TOTAL", { x: margin, size: 13, f: bold });
  draw(money(bill.grandTotal), { x: colX.amount, size: 13, f: bold });

  const bytes = await doc.save();
  const key = `bills/${bill.id}.pdf`;
  // Return whatever uploadBillPdf actually produced (a real S3 key when
  // S3_BILLS_BUCKET is configured, or a self-contained base64 data URL on
  // this test deployment) -- not the local `key` var, which discarded the
  // data-URL fallback and left every bill's pdfUrl as a dead, unresolvable path.
  return uploadBillPdf(key, bytes);
}

module.exports = { generateFinalBillPdf };
