import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReportSpec } from "./types.js";

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 60;
const LINE_SPACING = 1.4;

/**
 * Pure(ish) — produces a Uint8Array PDF for a ReportSpec. Layout is
 * single-column, sans-serif, no images. Sufficient for digital-product
 * deliverables; visual polish is a v2 concern. Hero/cover images are
 * a separate concern handled by the storefront page, not this PDF.
 */
export async function generatePdf(spec: ReportSpec): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;
  const usableWidth = PAGE_WIDTH - 2 * MARGIN;

  function newPage(): void {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursorY = PAGE_HEIGHT - MARGIN;
  }

  function ensureRoom(neededHeight: number): void {
    if (cursorY - neededHeight < MARGIN) newPage();
  }

  function drawWrapped(
    text: string,
    fontSize: number,
    font: typeof fontRegular,
    color = rgb(0.1, 0.1, 0.1),
    extraGap = 0
  ): void {
    const lineHeight = fontSize * LINE_SPACING;
    const words = text.split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      const w = font.widthOfTextAtSize(candidate, fontSize);
      if (w > usableWidth && line) {
        ensureRoom(lineHeight);
        page.drawText(line, { x: MARGIN, y: cursorY, size: fontSize, font, color });
        cursorY -= lineHeight;
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) {
      ensureRoom(lineHeight);
      page.drawText(line, { x: MARGIN, y: cursorY, size: fontSize, font, color });
      cursorY -= lineHeight;
    }
    cursorY -= extraGap;
  }

  // Title
  drawWrapped(spec.title, 26, fontBold, rgb(0, 0, 0), 6);
  if (spec.subtitle) {
    drawWrapped(spec.subtitle, 13, fontItalic, rgb(0.35, 0.35, 0.35), 18);
  } else {
    cursorY -= 12;
  }

  // Sections
  for (const section of spec.sections) {
    ensureRoom(40);
    drawWrapped(section.heading, 16, fontBold, rgb(0, 0, 0), 4);
    if (section.paragraphs) {
      for (const p of section.paragraphs) {
        drawWrapped(p, 11, fontRegular, rgb(0.1, 0.1, 0.1), 6);
      }
    }
    if (section.bullets) {
      for (const bullet of section.bullets) {
        drawWrapped(`•  ${bullet}`, 11, fontRegular, rgb(0.1, 0.1, 0.1), 2);
      }
      cursorY -= 6;
    }
    cursorY -= 6;
  }

  // Footer
  if (spec.footer) {
    cursorY -= 12;
    drawWrapped(spec.footer, 9, fontItalic, rgb(0.4, 0.4, 0.4));
  }

  return doc.save();
}
