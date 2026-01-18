const input = document.getElementById("file");
const status = document.getElementById("status");

input.addEventListener("change", async () => {
  const text = await input.files[0].text();
  const rows = text.split(/\r?\n/).filter(l => l.trim());

  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // 🔥 TU JEST CAŁA MAGIA UNICODE
  const fontBytes = await fetch("NotoSansSC-Regular.ttf").then(r => r.arrayBuffer());
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });

  const page = pdfDoc.addPage([595, 842]);

  let y = 800;
  for (const row of rows) {
    const [han, pin, pl] = row.split(";").map(x => x.trim());
    page.drawText(`${han}  ${pin}  ${pl}`, {
      x: 40,
      y,
      size: 24,
      font
    });
    y -= 32;
  }

  const pdfBytes = await pdfDoc.save();
  download(pdfBytes);
  status.textContent = "PDF OK (Unicode)";
});

function download(bytes) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "test.pdf";
  a.click();
}
