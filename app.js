/* Minimal Flashcards PDF generator:
   - A4 portrait
   - Grid: 2 columns x 4 rows (8 cards per sheet)
   - Page pairs: fronts then backs
   - Duplex long-edge: back side mirrored horizontally (swap columns)
   - Cut grid: borders + full-page cut lines between cells
*/

const fileInput = document.getElementById("file");
const statusEl = document.getElementById("status");

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  statusEl.textContent = "Czytam plik…";
  try {
    const text = await file.text();
    const cards = parseCards(text);

    if (cards.length === 0) {
      throw new Error("Plik nie zawiera poprawnych wierszy (oczekuję 3 pól na wiersz).");
    }

    statusEl.innerHTML = `<span class="ok">OK:</span> ${cards.length} fiszek. Generuję PDF…`;
    const pdfBytes = await buildPdf(cards);

    downloadBytes(pdfBytes, "fiszki.pdf");
    statusEl.innerHTML = `<span class="ok">Gotowe.</span> PDF pobrany jako fiszki.pdf`;
    fileInput.value = "";
  } catch (e) {
    statusEl.className = "err";
    statusEl.textContent = "Błąd:\n" + (e?.message ?? String(e));
  }
});

function parseCards(text) {
  const lines = text.split(/\r?\n/);
  const cards = [];

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;

    // Auto-detect separator: prefer semicolon, otherwise comma (CSV-ish)
    let parts;
    if (line.includes(";")) {
      parts = line.split(";").map(s => s.trim());
    } else {
      // fallback: comma
      parts = line.split(",").map(s => s.trim());
    }

    // Allow CSV with more columns -> take first 3
    if (parts.length < 3) continue;

    const en = parts[0] ?? "";
    const pron = parts[1] ?? "";
    const pl = parts.slice(2).join(parts.includes(";") ? ";" : ",").trim();

    if (!en) continue;
    cards.push({ en, pron, pl });
  }

  return cards;
}

async function buildPdf(cards) {
  const { PDFDocument, StandardFonts } = PDFLib;
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // A4 portrait in points
  const A4_W = 595.28;
  const A4_H = 841.89;

  // Fixed layout: 2x4
  const COLS = 2;
  const ROWS = 4;
  const PER_PAGE = COLS * ROWS;

  // Margins and spacing
  const margin = 28;     // ~10mm
  const gutter = 12;     // space between cards

  const usableW = A4_W - 2 * margin;
  const usableH = A4_H - 2 * margin;

  const cellW = (usableW - (COLS - 1) * gutter) / COLS;
  const cellH = (usableH - (ROWS - 1) * gutter) / ROWS;

  // Split into chunks of 8
  for (let i = 0; i < cards.length; i += PER_PAGE) {
    const batch = cards.slice(i, i + PER_PAGE);
    while (batch.length < PER_PAGE) batch.push({ en: "", pron: "", pl: "" });

    // Front page
    {
      const page = pdfDoc.addPage([A4_W, A4_H]);
      drawCutLines(page, margin, margin, usableW, usableH, COLS, ROWS, cellW, cellH, gutter);

      for (let idx = 0; idx < PER_PAGE; idx++) {
        const r = Math.floor(idx / COLS);
        const c = idx % COLS;

        const x = margin + c * (cellW + gutter);
        const y = A4_H - margin - (r + 1) * cellH - r * gutter;

        drawRect(page, x, y, cellW, cellH);

        const en = batch[idx].en || "";
        if (!en) continue;

        const fs = pickFontSize(en, 30, 18);
        drawCenteredText(page, font, en, fs, x, y, cellW, cellH);
      }
    }

    // Back page (duplex long-edge => mirror horizontally => swap columns)
    {
      const page = pdfDoc.addPage([A4_W, A4_H]);
      drawCutLines(page, margin, margin, usableW, usableH, COLS, ROWS, cellW, cellH, gutter);

      for (let idx = 0; idx < PER_PAGE; idx++) {
        const r = Math.floor(idx / COLS);
        const c = idx % COLS;

        // Mirroring in X: swap columns
        const mirroredC = (COLS - 1 - c);

        const x = margin + mirroredC * (cellW + gutter);
        const y = A4_H - margin - (r + 1) * cellH - r * gutter;

        drawRect(page, x, y, cellW, cellH);

        const pron = (batch[idx].pron || "").trim();
        const pl = (batch[idx].pl || "").trim();
        if (!pron && !pl) continue;

        // Two-line layout (pron smaller, translation larger)
        const line1 = pron;
        const line2 = pl;

        const fs1 = pickFontSize(line1, 16, 11);
        const fs2 = pickFontSize(line2, 20, 12);

        drawTwoLineCentered(page, font, line1, fs1, line2, fs2, x, y, cellW, cellH);
      }
    }
  }

  return await pdfDoc.save();
}

function drawRect(page, x, y, w, h) {
  page.drawRectangle({
    x, y, width: w, height: h,
    borderWidth: 0.6
  });
}

function drawCutLines(page, x0, y0, w, h, cols, rows, cellW, cellH, gutter) {
  // Vertical cut lines between columns (full height of usable area)
  for (let i = 1; i < cols; i++) {
    const x = x0 + i * (cellW + gutter) - gutter / 2;
    page.drawLine({ start: { x, y: y0 }, end: { x, y: y0 + h }, thickness: 0.3 });
  }
  // Horizontal cut lines between rows
  for (let j = 1; j < rows; j++) {
    const y = y0 + j * (cellH + gutter) - gutter / 2;
    page.drawLine({ start: { x: x0, y }, end: { x: x0 + w, y }, thickness: 0.3 });
  }
}

function drawCenteredText(page, font, text, fontSize, x, y, w, h) {
  const safe = text ?? "";
  const textWidth = font.widthOfTextAtSize(safe, fontSize);
  const tx = x + (w - textWidth) / 2;
  const ty = y + (h - fontSize) / 2;

  page.drawText(safe, { x: tx, y: ty, size: fontSize, font });
}

function drawTwoLineCentered(page, font, line1, fs1, line2, fs2, x, y, w, h) {
  const gap = 8;

  const totalH = (line1 ? fs1 : 0) + (line2 ? fs2 : 0) + (line1 && line2 ? gap : 0);
  let cy = y + (h + totalH) / 2;

  if (line1) {
    cy -= fs1;
    const w1 = font.widthOfTextAtSize(line1, fs1);
    page.drawText(line1, { x: x + (w - w1) / 2, y: cy, size: fs1, font });
    cy -= gap;
  }
  if (line2) {
    cy -= fs2;
    const w2 = font.widthOfTextAtSize(line2, fs2);
    page.drawText(line2, { x: x + (w - w2) / 2, y: cy, size: fs2, font });
  }
}

function pickFontSize(text, max, min) {
  // Very simple heuristic: shorter -> bigger. No options, just “good enough”.
  const t = (text || "").trim();
  if (!t) return min;
  if (t.length <= 10) return max;
  if (t.length <= 16) return Math.max(min, max - 6);
  if (t.length <= 24) return Math.max(min, max - 10);
  return min;
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
