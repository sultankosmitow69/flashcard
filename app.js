const input = document.getElementById("file");
const status = document.getElementById("status");
const printRoot = document.getElementById("printRoot");

const COLS = 2;
const ROWS = 4;
const PER_PAGE = COLS * ROWS;

// Druk: dwustronnie po dłuższej krawędzi => na tyle zamieniamy kolumny (mirror w poziomie)
const MIRROR_BACK_H = true;

injectStyles();

input.addEventListener("change", async () => {
  try {
    status.textContent = "Czytam plik…";

    const file = input.files?.[0];
    if (!file) return;

    const text = await file.text();
    const cards = parseCards(text);

    if (!cards.length) {
      status.textContent = "Brak poprawnych wierszy. Oczekuję: znak; pinyin; polski (albo CSV).";
      return;
    }

    status.textContent = `Wczytano ${cards.length} fiszek. Buduję strony do druku…`;

    // Czyść poprzedni podgląd
    printRoot.innerHTML = "";

    // Podział na paczki po 8 (2x4)
    for (let i = 0; i < cards.length; i += PER_PAGE) {
      const batch = cards.slice(i, i + PER_PAGE);
      while (batch.length < PER_PAGE) batch.push({ han: "", pinyin: "", pl: "" });

      // FRONT page
      printRoot.appendChild(buildPage(batch, "front"));

      // BACK page
      printRoot.appendChild(buildPage(batch, "back"));
    }

    status.textContent = "Gotowe. Otwieram okno drukowania (Wybierz: Zapisz do PDF / druk dwustronny).";

    // krótki timeout żeby przeglądarka zdążyła załadować font i wyrenderować
    setTimeout(() => window.print(), 300);

    // reset inputa
    input.value = "";
  } catch (e) {
    status.textContent = "Błąd: " + (e?.message ?? String(e));
  }
});

function parseCards(text) {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("#"));

  const cards = [];
  for (const line of lines) {
    const sep = line.includes(";") ? ";" : ",";
    const parts = line.split(sep).map(p => p.trim());
    if (parts.length < 3) continue;

    cards.push({
      han: parts[0],
      pinyin: parts[1],
      pl: parts.slice(2).join(sep).trim(),
    });
  }
  return cards;
}

function buildPage(batch, side) {
  const page = document.createElement("div");
  page.className = "page";

  // siatka 2x4
  const grid = document.createElement("div");
  grid.className = "grid";
  page.appendChild(grid);

  for (let idx = 0; idx < PER_PAGE; idx++) {
    const r = Math.floor(idx / COLS);
    const c = idx % COLS;

    // mirror na tyle: zamiana kolumn
    const useC = (side === "back" && MIRROR_BACK_H) ? (COLS - 1 - c) : c;
    const placeIdx = r * COLS + useC;

    const card = batch[idx];
    const cell = document.createElement("div");
    cell.className = "cell";

    if (side === "front") {
      const t = (card.han || "").trim();
      if (t) {
        const big = document.createElement("div");
        big.className = "frontText";
        big.textContent = t;
        cell.appendChild(big);
      }
    } else {
      const p = (card.pinyin || "").trim();
      const pl = (card.pl || "").trim();
      if (p || pl) {
        const pEl = document.createElement("div");
        pEl.className = "backPinyin";
        pEl.textContent = p;

        const plEl = document.createElement("div");
        plEl.className = "backPl";
        plEl.textContent = pl;

        cell.appendChild(pEl);
        cell.appendChild(plEl);
      }
    }

    // ustawiamy w gridzie w konkretnej pozycji
    cell.style.gridRow = String(r + 1);
    cell.style.gridColumn = String(useC + 1);

    // UWAGA: żeby nie mieszać kolejności w DOM, po prostu dokładamy,
    // grid i tak ustawi po gridRow/gridColumn.
    grid.appendChild(cell);
  }

  // Linie cięcia (pion + poziom) jako overlay
  const cuts = document.createElement("div");
  cuts.className = "cuts";
  page.appendChild(cuts);

  // pionowa linia między kolumnami
  const v = document.createElement("div");
  v.className = "cutV";
  cuts.appendChild(v);

  // poziome linie między wierszami
  for (let j = 1; j < ROWS; j++) {
    const h = document.createElement("div");
    h.className = "cutH";
    h.style.top = `${(j / ROWS) * 100}%`;
    cuts.appendChild(h);
  }

  return page;
}

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
/* Font (Unicode/CJK) */
@font-face {
  font-family: "NotoSansSC";
  src: url("./NotoSansSC-Regular.ttf") format("truetype");
  font-display: swap;
}

/* Screen */
#status { margin: 12px 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
#printRoot { margin-top: 8px; }

/* Print pages */
.page {
  width: 210mm;
  height: 297mm;
  box-sizing: border-box;
  padding: 10mm;
  position: relative;
  page-break-after: always;
  background: white;
}

/* Grid 2x4 inside printable area */
.grid {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: repeat(${COLS}, 1fr);
  grid-template-rows: repeat(${ROWS}, 1fr);
  gap: 4mm;
}

.cell {
  border: 0.3mm solid #000;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-family: "NotoSansSC", sans-serif;
  text-align: center;
  padding: 3mm;
  box-sizing: border-box;
}

/* Front: huge Hanzi */
.frontText {
  font-size: 18mm;
  line-height: 1.0;
}

/* Back: pinyin + polish */
.backPinyin {
  font-size: 5mm;
  line-height: 1.2;
  margin-bottom: 2mm;
}
.backPl {
  font-size: 6mm;
  line-height: 1.2;
}

/* Cut lines overlay (between cells) */
.cuts {
  position: absolute;
  left: 10mm;
  top: 10mm;
  right: 10mm;
  bottom: 10mm;
  pointer-events: none;
}

.cutV {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 0.3mm;
  background: #000;
  transform: translateX(-2mm); /* korekta o połowę gapu (4mm) */
  opacity: 0.35;
}

.cutH {
  position: absolute;
  left: 0;
  right: 0;
  height: 0.3mm;
  background: #000;
  transform: translateY(-2mm); /* korekta o połowę gapu */
  opacity: 0.35;
}

/* Print settings */
@page { size: A4; margin: 0; }
@media print {
  body { margin: 0; }
  #status, #file { display: none !important; }
  #printRoot { margin: 0; }
}
  `;
  document.head.appendChild(style);
}
