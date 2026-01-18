const input = document.getElementById("file");
const status = document.getElementById("status");

input.addEventListener("change", async () => {
  try {
    status.textContent = "Czytam plik…";

    const text = await input.files[0].text();
    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("#"));

    if (!lines.length) {
      status.textContent = "Plik pusty lub niepoprawny.";
      return;
    }

    const cards = [];
    for (const line of lines) {
      const sep = line.includes(";") ? ";" : ",";
      const parts = line.split(sep).map(p => p.trim());
      if (parts.length < 3) continue;

      cards.push({
        han: parts[0],
        pinyin: parts[1],
        pl: parts.slice(2).join(sep)
      });
    }

    if (!cards.length) {
      status.textContent = "Nie znaleziono poprawnych wierszy (3 kolumny).";
      return;
    }

    status.textContent = "Generuję PDF…";

    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // 🔥 KLUCZ: pełne osadzenie fontu Unicode (bez subset)
    const fontBytes = await fetch("./NotoSansSC-Regular.ttf").then(r => {
      if (!r.ok) throw new Error("Nie można załadować NotoSansSC-Regular.ttf");
      return r.arrayBuffer();
    });

    const font = await pdfDoc.embedFont(fontBytes, {
      subset: false
    });

    // A4
    const PAGE_W = 595.28;
    const PAGE_H = 841.89;

    const COLS = 2;
    const ROWS = 4;
    const PER_PAGE = COLS * ROWS;

    const margin = 28;
    const gutter = 12;

    const usableW = PAGE_W - 2 * margin;
    const usableH = PAGE_H - 2 * margin;
    const cellW = (usableW - (COLS - 1) * gutter) / COLS;
    const cellH = (usableH - (ROWS - 1) * gutter) / ROWS;

    for (let i = 0; i < cards.length; i += PER_PAGE) {
      const batch = cards.slice(i, i + PER_PAGE);
      while (batch.length < PER_PAGE) {
        batch.push({ han: "", pinyin: "", pl: "" });
      }

      // ---------- FRONT (chińskie znaki) ----------
      {
        const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        drawCutLines(page);

        for (let idx = 0; idx < PER_PAGE; idx++) {
          const r = Math.floor(idx / COLS);
          const c = idx % COLS;

          const x = margin + c * (cellW + gutter);
          const y = PAGE_H - margin - (r + 1) * cellH - r * gutter;

          page.drawRectangle({ x, y, width: cellW, height: cellH, borderWidth: 0.6 });

          const text = batch[idx].han;
          if (!text) continue;

          const size = text.length <= 2 ? 52 : 36;
          drawCentered(page, font, text, size, x, y, cellW, cellH);
        }
      }

      // ---------- BACK (pinyin + polski) ----------
      // flip on long edge → mirror columns
      {
        const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        drawCutLines(page);

        for (let idx = 0; idx < PER_PAGE; idx++) {
          const r = Math.floor(idx / COLS);
          const c = idx % COLS;
          const mc = COLS - 1 - c;

          const x = margin + mc * (cellW + gutter);
          const y = PAGE_H - margin - (r + 1) * cellH - r * gutter;

          page.drawRectangle({ x, y, width: cellW, height: cellH, borderWidth: 0.6 });

          const { pinyin, pl } = batch[idx];
          if (!pinyin && !pl) continue;

          drawTwoLines(page, font, pinyin, 16, pl, 20, x, y, cellW, cellH);
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    download(pdfBytes, "fiszki.pdf");
    status.textContent = "Gotowe – PDF pobrany.";

  } catch (e) {
    status.textContent = "Błąd: " + e.message;
  }
});

function drawCentered(page, font, text, size, x, y, w, h) {
  const tw = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: x + (w - tw) / 2,
    y: y + (h - size) / 2,
    size,
    font
  });
}

function drawTwoLines(page, font, t1, s1, t2, s2, x, y, w, h) {
  const gap = 8;
  const total = (t1 ? s1 : 0) + (t2 ? s2 : 0) + (t1 && t2 ? gap : 0);
  let cy = y + (h + total) / 2;

  if (t1) {
    cy -= s1;
    const w1 = font.widthOfTextAtSize(t1, s1);
    page.drawText(t1, { x: x + (w - w1) / 2, y: cy, size: s1, font });
    cy -= gap;
  }
  if (t2) {
    cy -= s2;
    const w2 = font.widthOfTextAtSize(t2, s2);
    page.drawText(t2, { x: x + (w - w2) / 2, y: cy, size: s2, font });
  }
}

function drawCutLines(page) {
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const margin = 28;
  const gutter = 12;
  const COLS = 2;
  const ROWS = 4;

  const usableW = PAGE_W - 2 * margin;
  const usableH = PAGE_H - 2 * margin;
  const cellW = (usableW - (COLS - 1) * gutter) / COLS;
  const cellH = (usableH - (ROWS - 1) * gutter) / ROWS;

  for (let i = 1; i < COLS; i++) {
    const x = margin + i * (cellW + gutter) - gutter / 2;
    page.drawLine({ start: { x, y: margin }, end: { x, y: margin + usableH }, thickness: 0.3 });
  }
  for (let j = 1; j < ROWS; j++) {
    const y = margin + j * (cellH + gutter) - gutter / 2;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + usableW, y }, thickness: 0.3 });
  }
}

function download(bytes, name) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}
