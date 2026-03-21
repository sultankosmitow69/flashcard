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
  "0": "#000000",
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
      status.textContent = "Brak poprawnych wierszy. Oczekuję: znak; pinyin; polski; ton";
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

    const toneKey = parts[3];
    const color = COLOR_MAP[toneKey] || "#000000";

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
    cell.className = `cell ${side === "front" ? "frontCell" : "backCell"}`;
    cell.style.gridRow = String(r + 1);
    cell.style.gridColumn = String(useC + 1);

    if (side === "front") {
      const t = (card.han || "").trim();
      if (t) {
        const big = document.createElement("div");
        big.className = "frontText";
        big.textContent = t;
        big.style.color = card.color || "#000000";
        cell.appendChild(big);
      }
    } else {
      const p = (card.pinyin || "").trim();
      const pl = (card.pl || "").trim();

      if (p || pl) {
        const layout = document.createElement("div");
        layout.className = "backLayout";

        for (let row = 1; row <= 6; row++) {
          const rowEl = document.createElement("div");
          rowEl.className = "backRow";

          if (row === 3) {
            rowEl.classList.add("backPinyin");
            rowEl.textContent = p;
          } else if (row === 6) {
            rowEl.classList.add("backPl");
            rowEl.textContent = pl ? `(${pl})` : "";
          }

          layout.appendChild(rowEl);
        }

        cell.appendChild(layout);
      }
    }

    grid.appendChild(cell);
  }

  return page;
}

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
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
  box-sizing: border-box;
  overflow: hidden;
  background: #fff;
}

/* PRZÓD */
.frontCell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.frontText {
  font-family: "SimSun", "NSimSun", "Songti SC", serif;
  font-size: 180pt;
  font-weight: 400;
  line-height: 1;
  text-align: center;
  width: 100%;
}

/* TYŁ */
.backCell {
  padding: 0;
}

.backLayout {
  height: 100%;
  width: 100%;
  display: grid;
  grid-template-rows: repeat(6, 1fr);
  color: #000000;
  font-family: "Bookman Old Style", "Book Antiqua", Georgia, serif;
  font-size: 22pt;
  line-height: 1;
  box-sizing: border-box;
  padding: 0 6mm;
}

.backRow {
  margin: 0;
  padding: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  color: #000000;
}

.backPinyin {
  justify-content: center;
  text-align: center;
  font-weight: 700;
}

.backPl {
  justify-content: flex-start;
  text-align: left;
  font-weight: 400;
}

@media print {
  body {
    margin: 0;
  }
}
  `;
  document.head.appendChild(style);
}
