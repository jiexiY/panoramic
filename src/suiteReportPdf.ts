import { jsPDF } from "jspdf";
import type { SuiteId } from "./suiteRecords.ts";

// Plain text only: no HTML, external images, remote conversion or record uploads.
export function createSuiteReportPdf(room: SuiteId, report: string, generatedAt = new Date()) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title: `Panoramic - Suite ${room} report`, subject: "Suite response records and activity", creator: "Panoramic", author: "Panoramic" });
  const margin = 18, width = 174, bottom = 276;
  let y = 44, size = 10, bold = false;
  const clean = (value: string) => value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/[\u2010-\u2015]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2192/g, "->");
  const unicode = (value: string) => /[^\x20-\x7e\xa0-\xff]/u.test(value);
  // Standard PDF fonts cover Latin text. For other scripts, preserve the browser's
  // actual glyphs as a high-resolution line image instead of silently losing names.
  let canvas: HTMLCanvasElement | undefined;
  const context = () => {
    if (typeof document === "undefined") throw new Error("Export multilingual reports from the Panoramic browser workspace.");
    canvas ??= document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser could not render the report text.");
    ctx.font = `${bold ? "600" : "400"} ${size * 4}px Arial, sans-serif`;
    return ctx;
  };
  const measure = (text: string) => unicode(text) ? context().measureText(text).width * 25.4 / (72 * 4) : pdf.getTextWidth(text);
  const wrap = (text: string) => {
    const lines: string[] = []; let line = "";
    for (const word of text.split(/\s+/u)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const character of word) {
        if (line && measure(line + character) > width) { lines.push(line); line = ""; }
        line += character;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  const pageHeader = (first: boolean) => {
    pdf.setTextColor(52, 78, 65); pdf.setFont("helvetica", "bold"); pdf.setFontSize(first ? 12 : 10);
    pdf.text("PANORAMIC", margin, 17);
    pdf.setFontSize(first ? 23 : 12); pdf.text(`Suite ${room} report`, margin, first ? 29 : 26);
    pdf.setDrawColor(203, 216, 204); pdf.line(margin, first ? 35 : 31, 192, first ? 35 : 31);
  };
  pageHeader(true);
  for (const raw of report.split("\n").slice(1)) {
    const text = clean(raw).trim();
    if (!text) { y += 3; continue; }
    const heading = /^(OBSERVATIONS|RESPONSE|PANORAMIC · RESPONSE RECORD)$/.test(text);
    size = heading ? 11 : 10; bold = heading;
    pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size);
    const lines = wrap(text);
    if (heading && y + 22 > bottom) { pdf.addPage(); pageHeader(false); y = 40; }
    if (heading) y += 3;
    for (const line of lines) {
      if (y > bottom) { pdf.addPage(); pageHeader(false); y = 40; }
      pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size);
      pdf.setTextColor(heading ? 52 : 48, heading ? 78 : 62, heading ? 65 : 58);
      if (unicode(line)) {
        let ctx = context();
        const pixels = Math.ceil(ctx.measureText(line).width) + 8;
        canvas!.width = pixels; canvas!.height = size * 6;
        ctx = context(); ctx.fillStyle = "#303e3a"; ctx.textBaseline = "alphabetic";
        ctx.fillText(line, 2, size * 4);
        pdf.addImage(canvas!.toDataURL("image/png"), "PNG", margin, y - size * 25.4 / 72, pixels * 25.4 / (72 * 4), size * 6 * 25.4 / (72 * 4));
      } else pdf.text(line, margin, y);
      y += heading ? 7 : 5.6;
    }
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setDrawColor(220, 228, 219); pdf.line(margin, 282, 192, 282);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(105, 119, 108);
    pdf.text(`Exported ${generatedAt.toISOString().slice(0, 19).replace("T", " ")} UTC`, margin, 288);
    pdf.text(`${page} / ${pages}`, 192, 288, { align: "right" });
  }
  return pdf;
}
