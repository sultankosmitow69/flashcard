const input = document.getElementById("file");
const status = document.getElementById("status");
const printRoot = document.getElementById("printRoot");

const COLS = 2;
const ROWS = 2;
const PER_PAGE = COLS * ROWS;

// druk dwustronny po dłuższej krawędzi => na tyle zamiana kolumn
const MIRROR_BACK_H = true;

// rozmiar jednej fiszki
const CARD_SIZE_CM = 9;

// mapowanie koloru z CSV
const COLOR_MAP = {
  "4": "#0070C0",
  "3": "#00B050",
  "2": "#E97132",
  "1": "#EE0000",
};

injectStyles();

input.addEventListener("change", async () => {
  try {
    status.textContent = "Czytam plik…";

    const file = input.files?.[0];
    if (!file) return;

    const text = await file.text();
    const cards = parseCards(text);

    if (!cards.length) {
      status.textContent = "Brak poprawnych wierszy. Oczekuję: znak; pinyin; polski; kolor";
      return;
    }

    status.textContent = `Wczytano ${cards.length} fiszek. Przygotowuję wydruk…`;

    printRoot.innerHTML = "";

    for (let i = 0; i < cards.length; i += PER_PAGE) {
      const batch = cards.slice(i, i + PER_PAGE);
      while (batch.length < PER_PAGE) {
        batch.push({ han: "", pinyin: "", pl: "", color: "#000000" });
      }

      printRoot.appendChild(buildPage(batch, "front"));
      printRoot.appendChild(buildPage(batch, "back"));
    }

    status.textContent = "Gotowe. Otwieram okno drukowania…";

    setTimeout(() => {
      window.print();
    }, 300);

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

    if (parts.length < 4) continue;

    const colorKey = parts[3];
    const color = COLOR_MAP[colorKey] || "#000000";

    cards.push({
      han: parts[0],
      pinyin: parts[1],
      pl: parts[2],
      color
    });
  }

  return cards;
}

function buildPage(batch, side) {
  const page = document.createElement("div");
  page.className = "page";

  const grid = document.createElement("div");
  grid.className = "grid";
  page.appendChild(grid);

  for (let idx = 0; idx < PER_PAGE; idx++) {
    const r = Math.floor(idx / COLS);
    const c = idx % COLS;

    const useC = (side === "back" && MIRROR_BACK_H) ? (COLS - 1 - c) : c;

    const card = batch[idx];
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.style.gridRow = String(r + 1);
    cell.style.gridColumn = String(useC + 1);
    cell.style.color = card.color || "#000000";

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

    grid.appendChild(cell);
  }

  return page;
}

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
@font-face {
  font-family: "NotoSansSC";
  src: url("./NotoSansSC-Regular.ttf") format("truetype");
  font-display: swap;
}

@page {
  size: A4;
  margin: 0;
}

.page {
  width: 210mm;
  height: 297mm;
  box-sizing: border-box;
  position: relative;
  page-break-after: always;
  background: white;

  display: flex;
  justify-content: center;
  align-items: center;
}

.grid {
  width: calc(${CARD_SIZE_CM}cm * 2);
  height: calc(${CARD_SIZE_CM}cm * 2);
  display: grid;
  grid-template-columns: repeat(${COLS}, ${CARD_SIZE_CM}cm);
  grid-template-rows: repeat(${ROWS}, ${CARD_SIZE_CM}cm);
  gap: 0;
}

.cell {
  width: ${CARD_SIZE_CM}cm;
  height: ${CARD_SIZE_CM}cm;
  border: 0.3mm solid #000;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-family: "NotoSansSC", sans-serif;
  text-align: center;
  padding: 4mm;
  box-sizing: border-box;
  overflow: hidden;
}

.frontText {
  font-size: 28mm;
  line-height: 1;
  font-weight: 500;
}

.backPinyin {
  font-size: 7mm;
  line-height: 1.2;
  margin-bottom: 4mm;
}

.backPl {
  font-size: 8mm;
  line-height: 1.2;
}

@media print {
  body {
    margin: 0;
  }
}
  `;
  document.head.appendChild(style);
}
