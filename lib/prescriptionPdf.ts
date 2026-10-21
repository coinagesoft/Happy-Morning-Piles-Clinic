import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import {
  Prescription,
  CLINIC_INFO,
  describeTiming,
  formatRxDate,
} from './prescriptionTemplate';

// A4 in PDF points
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 44;
const CONTENT_W = PAGE_W - MARGIN * 2;
const RIGHT = PAGE_W - MARGIN;
const BOTTOM_RESERVE = 78; // space kept free above the footer

// Palette: one deep navy accent, neutral greys (prints cleanly in black and white)
const NAVY = rgb(0.098, 0.122, 0.325); // #191F53
const INK = rgb(0.09, 0.11, 0.15); // #171C26
const GRAY = rgb(0.38, 0.41, 0.46); // #616975
const MID = rgb(0.58, 0.61, 0.66); // #949CA8
const RULE = rgb(0.75, 0.78, 0.83); // #BFC7D4
const HAIR = rgb(0.9, 0.91, 0.94); // #E6E8F0
const HEAD_FILL = rgb(0.94, 0.95, 0.97); // #F0F2F7

/** Standard PDF fonts only cover Latin text; drop anything the font can't draw so the PDF never fails. */
function clean(text: string, font: PDFFont): string {
  const supported = font.getCharacterSet();
  let out = '';
  for (const ch of String(text ?? '').replace(/\t/g, ' ')) {
    if (ch === '\n') {
      out += ch;
      continue;
    }
    if (ch === '\u2019' || ch === '\u2018') out += "'";
    else if (ch === '\u201C' || ch === '\u201D') out += '"';
    else if (ch === '\u20B9') out += 'Rs.';
    else if (supported.includes(ch.codePointAt(0)!)) out += ch;
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of clean(text, font).split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        // very long single word: hard-split
        let w = word;
        while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
          let cut = w.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--;
          lines.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        line = w;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function generatePrescriptionPdf(rx: Prescription): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifBoldItalic = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);

  pdf.setTitle(`Prescription - ${clean(rx.patientName, regular)}`);
  pdf.setAuthor(CLINIC_INFO.doctorName);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  type Color = ReturnType<typeof rgb>;
  type TextOpts = { font?: PDFFont; size?: number; color?: Color };

  const text = (value: string, x: number, yy: number, opts: TextOpts = {}) => {
    const font = opts.font || regular;
    const t = clean(value, font);
    if (t) page.drawText(t, { x, y: yy, size: opts.size || 10, font, color: opts.color || INK });
  };

  const textRight = (value: string, xRight: number, yy: number, opts: TextOpts = {}) => {
    const font = opts.font || regular;
    const t = clean(value, font);
    if (t) {
      page.drawText(t, {
        x: xRight - font.widthOfTextAtSize(t, opts.size || 10),
        y: yy,
        size: opts.size || 10,
        font,
        color: opts.color || INK,
      });
    }
  };

  const textCentered = (value: string, xCenter: number, yy: number, opts: TextOpts = {}) => {
    const font = opts.font || regular;
    const t = clean(value, font);
    if (t) {
      page.drawText(t, {
        x: xCenter - font.widthOfTextAtSize(t, opts.size || 10) / 2,
        y: yy,
        size: opts.size || 10,
        font,
        color: opts.color || INK,
      });
    }
  };

  const hline = (yy: number, thickness: number, color: Color, x1 = MARGIN, x2 = RIGHT) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color });

  const vline = (xx: number, y1: number, y2: number, thickness: number, color: Color) =>
    page.drawLine({ start: { x: xx, y: y1 }, end: { x: xx, y: y2 }, thickness, color });

  /** Heavy rule with a fine rule beneath it: the letterhead / running-header divider. */
  const doubleRule = (yy: number) => {
    hline(yy, 1.8, NAVY);
    hline(yy - 3.5, 0.5, RULE);
  };

  /** Running header for pages 2+. */
  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    text(CLINIC_INFO.doctorName, MARGIN, PAGE_H - MARGIN - 6, { font: serifBold, size: 14, color: NAVY });
    textRight(
      `Prescription for ${rx.patientName}   |   ${formatRxDate(rx.date)}`,
      RIGHT,
      PAGE_H - MARGIN - 5,
      { size: 8.5, color: GRAY }
    );
    doubleRule(PAGE_H - MARGIN - 16);
    y = PAGE_H - MARGIN - 46;
  };

  const ensure = (needed: number) => {
    if (y - needed < MARGIN + BOTTOM_RESERVE) newPage();
  };

  /** Section label followed by a fine rule across the page. */
  const sectionHeading = (title: string) => {
    const t = clean(title, bold);
    text(t, MARGIN, y, { font: bold, size: 9.5, color: NAVY });
    hline(y + 3, 0.6, RULE, MARGIN + bold.widthOfTextAtSize(t, 9.5) + 10, RIGHT);
    y -= 18;
  };

  // ---------- Letterhead ----------
  const qualLines = wrap(CLINIC_INFO.qualification, regular, 8, CONTENT_W * 0.55);
  const addrLines = wrap(CLINIC_INFO.address, regular, 8.5, CONTENT_W * 0.36);

  const nameBase = y - 22;
  text(CLINIC_INFO.doctorName, MARGIN, nameBase, { font: serifBold, size: 26, color: NAVY });
  let ly = nameBase - 16;
  qualLines.forEach((l) => {
    text(l, MARGIN, ly, { size: 8, color: GRAY });
    ly -= 11;
  });
  const leftEnd = ly + 11;

  let ry = nameBase + 6;
  textRight(CLINIC_INFO.clinicName, RIGHT, ry, { font: bold, size: 11, color: INK });
  ry -= 14;
  addrLines.forEach((l) => {
    textRight(l, RIGHT, ry, { size: 8.5, color: GRAY });
    ry -= 11;
  });
  textRight(`Phone: ${CLINIC_INFO.phone}`, RIGHT, ry, { size: 8.5, color: GRAY });
  const rightEnd = ry;

  y = Math.min(leftEnd, rightEnd) - 14;
  doubleRule(y);
  y -= 30;

  // ---------- Patient details (ruled form) ----------
  const cells = [
    { label: 'Patient name', value: rx.patientName || '-', w: CONTENT_W * 0.4 },
    { label: 'Age', value: rx.patientAge ? `${rx.patientAge} years` : '-', w: CONTENT_W * 0.14 },
    { label: 'Phone', value: rx.patientPhone || '-', w: CONTENT_W * 0.26 },
    { label: 'Date', value: formatRxDate(rx.date) || '-', w: CONTENT_W * 0.2 },
  ];
  const formH = 40;
  page.drawRectangle({
    x: MARGIN,
    y: y - formH,
    width: CONTENT_W,
    height: formH,
    borderColor: RULE,
    borderWidth: 0.8,
  });
  let cx = MARGIN;
  cells.forEach((c, i) => {
    if (i > 0) vline(cx, y, y - formH, 0.6, RULE);
    text(c.label, cx + 10, y - 13, { size: 7.5, color: GRAY });
    const lines = wrap(c.value, bold, 10.5, c.w - 20);
    text(lines[0] || '-', cx + 10, y - 29, { font: bold, size: 10.5 });
    cx += c.w;
  });
  y -= formH + 28;

  // ---------- Diagnosis ----------
  if (rx.diagnosis.trim()) {
    sectionHeading('Complaints / Diagnosis');
    wrap(rx.diagnosis, regular, 10.5, CONTENT_W).forEach((l) => {
      ensure(16);
      text(l, MARGIN, y, { size: 10.5 });
      y -= 15;
    });
    y -= 14;
  }

  // ---------- Rx ----------
  ensure(100);
  text('Rx', MARGIN, y - 16, { font: serifBoldItalic, size: 24, color: NAVY });
  y -= 34;

  // ---------- Medicines table ----------
  const widths = [24, 146, 62, 114, 72, 85]; // sums to CONTENT_W (503.28)
  const sum = widths.reduce((a, b) => a + b, 0);
  widths[1] += CONTENT_W - sum; // absorb rounding into the medicine column
  const xs: number[] = [];
  widths.reduce((acc, w) => {
    xs.push(acc);
    return acc + w;
  }, MARGIN);
  const PAD = 8;

  const drawHeader = () => {
    const h = 24;
    page.drawRectangle({
      x: MARGIN,
      y: y - h,
      width: CONTENT_W,
      height: h,
      color: HEAD_FILL,
      borderColor: RULE,
      borderWidth: 0.8,
    });
    const labels = ['#', 'Medicine', 'Quantity', 'When to take', 'Food', 'Duration'];
    labels.forEach((l, i) => text(l, xs[i] + (i === 0 ? 7 : PAD), y - 15.5, { font: bold, size: 8.5, color: NAVY }));
    y -= h;
  };
  drawHeader();

  const meds = rx.medicines.filter((m) => m.name.trim());
  if (meds.length === 0) {
    vline(MARGIN, y, y - 40, 0.8, RULE);
    vline(RIGHT, y, y - 40, 0.8, RULE);
    text('No medicines added.', xs[1], y - 24, { color: GRAY });
    y -= 40;
  }

  meds.forEach((m, i) => {
    const potency = m.potency ? clean(m.potency, bold) : '';
    const label = potency ? `${clean(m.name, bold)}  ${potency}` : clean(m.name, bold);
    const nameLines = wrap(label, bold, 10.5, widths[1] - PAD * 2);
    const noteLines = m.instructions ? wrap(m.instructions, italic, 8.5, widths[1] - PAD * 2) : [];
    const qtyLines = wrap(m.quantity || '-', regular, 10, widths[2] - PAD * 2);
    const schedule = [m.morning && 'Morning', m.afternoon && 'Afternoon', m.night && 'Night']
      .filter(Boolean)
      .join(', ');
    const whenLines = wrap(schedule || '-', regular, 10, widths[3] - PAD * 2);
    const foodLines = wrap(describeTiming(m.timing) || '-', regular, 10, widths[4] - PAD * 2);
    const durLines = wrap(m.duration || '-', regular, 10, widths[5] - PAD * 2);

    const h1 = nameLines.length * 14 + (noteLines.length ? 3 + noteLines.length * 11 : 0);
    const h2 = qtyLines.length * 13;
    const h3 = whenLines.length * 13;
    const h4 = foodLines.length * 13;
    const h5 = durLines.length * 13;
    const rowH = Math.max(h1, h2, h3, h4, h5, 14) + 22;

    if (y - rowH < MARGIN + BOTTOM_RESERVE) {
      hline(y, 0.8, RULE); // close the table on this page
      newPage();
      drawHeader();
    }

    const top = y - 16;

    text(String(i + 1), xs[0] + 7, top, { color: GRAY });

    let ty = top;
    nameLines.forEach((l, idx) => {
      if (idx === 0 && potency && l.endsWith(potency)) {
        const base = l.slice(0, l.length - potency.length).trimEnd();
        text(base, xs[1] + PAD, ty, { font: bold, size: 10.5 });
        text(potency, xs[1] + PAD + bold.widthOfTextAtSize(base + '  ', 10.5), ty, { size: 10.5 });
      } else {
        text(l, xs[1] + PAD, ty, { font: bold, size: 10.5 });
      }
      ty -= 14;
    });
    noteLines.forEach((l) => {
      text(l, xs[1] + PAD, ty - 1, { font: italic, size: 8.5, color: GRAY });
      ty -= 11;
    });

    const drawCol = (lines: string[], colIdx: number) => {
      let cy = top;
      lines.forEach((l) => {
        text(l, xs[colIdx] + PAD, cy);
        cy -= 13;
      });
    };
    drawCol(qtyLines, 2);
    drawCol(whenLines, 3);
    drawCol(foodLines, 4);
    drawCol(durLines, 5);

    // side borders + hairline between rows
    vline(MARGIN, y, y - rowH, 0.8, RULE);
    vline(RIGHT, y, y - rowH, 0.8, RULE);
    y -= rowH;
    if (i < meds.length - 1) hline(y, 0.5, HAIR);
  });

  hline(y, 0.8, RULE);
  y -= 30;

  // ---------- Advice ----------
  if (rx.advice.trim()) {
    ensure(54);
    sectionHeading('Advice / Diet');
    wrap(rx.advice, regular, 10.5, CONTENT_W).forEach((l) => {
      ensure(18);
      text(l, MARGIN, y, { size: 10.5 });
      y -= 16;
    });
    y -= 14;
  }

  // ---------- Follow-up ----------
  if (rx.followUp.trim()) {
    const fl = wrap(rx.followUp, bold, 10.5, CONTENT_W);
    ensure(fl.length * 16 + 34);
    sectionHeading('Follow-up');
    fl.forEach((l) => {
      text(l, MARGIN, y, { font: bold, size: 10.5 });
      y -= 16;
    });
    y -= 10;
  }

  // ---------- Signature (always on the last page) ----------
  ensure(96);
  const sigY = Math.min(y - 52, MARGIN + 76);
  const sigW = 190;
  hline(sigY, 0.8, INK, RIGHT - sigW, RIGHT);
  textCentered(CLINIC_INFO.doctorName, RIGHT - sigW / 2, sigY - 14, { font: bold, size: 10.5 });
  textCentered('Signature', RIGHT - sigW / 2, sigY - 26, { size: 8, color: GRAY });

  text(`This prescription was issued by ${CLINIC_INFO.clinicName}.`, MARGIN, sigY + 2, { size: 8, color: GRAY });
  text('Take medicines only as directed.', MARGIN, sigY - 9, { size: 8, color: GRAY });

  // ---------- Footer on every page ----------
  const pages = pdf.getPages();
  pages.forEach((p, idx) => {
    page = p;
    hline(40, 0.6, RULE);
    textCentered(`${CLINIC_INFO.clinicName}   |   ${CLINIC_INFO.address}`, PAGE_W / 2, 27, { size: 7.5, color: GRAY });
    textCentered(`Phone: ${CLINIC_INFO.phone}`, PAGE_W / 2, 17, { size: 7.5, color: GRAY });
    if (pages.length > 1) {
      textRight(`Page ${idx + 1} of ${pages.length}`, RIGHT, 17, { size: 7.5, color: MID });
    }
  });

  return pdf.save();
}

export function prescriptionFileName(rx: Prescription): string {
  const safe = (rx.patientName || 'patient').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `Prescription-${safe || 'patient'}-${rx.date}.pdf`;
}