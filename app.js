const fileInput = document.getElementById("file");
const statusEl = document.getElementById("status");

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  statusEl.className = "hint";
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
    if (!line || line.startsWith("#")) continue;

    let parts;
    if (line.includes(";")) parts = line.split(";").map(s => s.trim());
    else parts = line.split(",").map(s => s.trim());

    if (parts.length < 3) continue;

    const han = parts[0] ?? "";
    const pinyin = parts[1] ?? "";
    const pl = parts.slice(2).join(line.includes(";") ? ";" : ",").trim();

    if (!han) continue;
    cards.push({ han, pinyin, pl });
  }
  return cards;
}

async function buildPdf(cards) {
  const { PDFDocument } = PDFLib;

  const pdfDoc = await PDFDocument.create();

  // 🔥 Kluczowe: rejestracja fontkit dla TTF/OTF
  pdfDoc.registerFontkit(fontkit);

  // 🔥 Wczytaj czcionkę z repo (musi istnieć obok index.html/app.js)
  const fontBytes = await fetch("./NotoSansSC-Regular.otf").then(r => {
    if (!r.ok) throw new Error("Brak pliku czcionki NotoSansSC-Regular.otf w repo (dodaj go obok index.html).");
    return r.arrayBuffer();
  });

  // 🔥 Osadź czcionkę (subset zmniejsza rozmiar PDF)
  const cjkFont = await pdfDoc.embedFont(fontBytes, { subset: true });

  // A4 portrait
  const A4_W = 595.28;
  const A4_H = 841.89;

  const COLS = 2;
  const ROWS = 4;
  const PER_PAGE = COLS * ROWS;

  const margin = 28;
  const gutter = 12;

  const usableW = A4_W - 2 * margin;
  const usableH = A4_H - 2 * margin;

  const cellW = (usableW - (COLS - 1) * gutter) / COLS;
  const cellH = (usableH - (ROWS - 1) * gutter) / ROWS;

  for (let i = 0; i < cards.length; i += PER_PAGE) {
    const batch = cards.slice(i, i + PER_PAGE);
    while (batch.length < PER_PAGE) batch.push({ han: "", pinyin: "", pl: "" });

    // FRONT (znak chiński)
    {
      const page = pdfDoc.addPage([A4_W, A4_H]);
      drawCutLines(page, margin, margin, usableW, usableH, COLS, ROWS, cellW, cellH, gutter);

      for (let idx = 0; idx < PER_PAGE; idx++) {
        const r = Math.floor(idx / COLS);
        const c = idx % COLS;

        const x = margin + c * (cellW + gutter);
        const y = A4_H - margin - (r + 1) * cellH - r * gutter;

        drawRect(page, x, y, cellW, cellH);

        const han = (batch[idx].han || "").trim();
        if (!han) continue;

        // Chińskie znaki zwykle mogą być DUŻE
        const fs = pickFontSize(han, 44, 28);
        drawCenteredText(page, cjkFont, han, fs, x, y, cellW, cellH);
      }
    }

    // BACK (pinyin + PL) — flip on long edge => mirror w poziomie (zamiana kolumn)
    {
      const page = pdfDoc.addPage([A4_W, A4_H]);
      drawCutLines(page, margin, margin, usableW, usableH, COLS, ROWS, cellW, cellH, gutter);

      for (let idx = 0; idx < PER_PAGE; idx++) {
        const r = Math.floor(idx / COLS);
        const c = idx % COLS;
        const mirroredC = (COLS - 1 - c);

        const x = margin + mirroredC * (cellW + gutter);
        const y = A4_H - margin - (r + 1) * cellH - r * gutter;

        drawRect(page, x, y, cellW, cellH);

        const pinyin = (batch[idx].pinyin || "").trim();
        const pl = (batch[idx].pl || "").trim();
        if (!pinyin && !pl) continue;

        const fs1 = pickFontSize(pinyin, 16, 11);
        const fs2 = pickFontSize(pl, 20, 12);

        drawTwoLineCentered(page, cjkFont, pinyin, fs1, pl, fs2, x, y, cellW, cellH);
      }
    }
  }

  return await pdfDoc.save();
}

/* drawing helpers */

function drawRect(page, x, y, w, h) {
  page.drawRectangle({ x, y, width: w, height: h, borderWidth: 0.6 });
}

function drawCutLines(page, x0, y0, w, h, cols, rows, cellW, cellH, gutter) {
  for (let i = 1; i < cols; i++) {
    const x = x0 + i * (cellW + gutter) - gutter / 2;
    page.drawLine({ start: { x, y: y0 }, end: { x, y: y0 + h }, thickness: 0.3 });
  }
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
  const has1 = !!(line1 && line1.trim());
  const has2 = !!(line2 && line2.trim());

  const totalH = (has1 ? fs1 : 0) + (has2 ? fs2 : 0) + (has1 && has2 ? gap : 0);
  let cy = y + (h + totalH) / 2;

  if (has1) {
    cy -= fs1;
    const w1 = font.widthOfTextAtSize(line1, fs1);
    page.drawText(line1, { x: x + (w - w1) / 2, y: cy, size: fs1, font });
    cy -= gap;
  }
  if (has2) {
    cy -= fs2;
    const w2 = font.widthOfTextAtSize(line2, fs2);
    page.drawText(line2, { x: x + (w - w2) / 2, y: cy, size: fs2, font });
  }
}

function pickFontSize(text, max, min) {
  const t = (text || "").trim();
  if (!t) return min;
  if (t.length <= 4) return max;
  if (t.length <= 10) return Math.max(min, max - 8);
  if (t.length <= 16) return Math.max(min, max - 12);
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
