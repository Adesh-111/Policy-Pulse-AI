import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { generatePolicyReportMarkdown } from "./markdown";
import type { PolicyReportInput } from "./types";

interface TextBlock {
  text: string;
  size: number;
  bold: boolean;
  color: { r: number; g: number; b: number };
  spacingBefore: number;
  spacingAfter: number;
  indent: number;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

function pdfSafeText(value: string): string {
  return value
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "*")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

function markdownBlocks(markdown: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let inQuote = false;
  for (const rawLine of markdown.split("\n")) {
    const line = pdfSafeText(rawLine.trimEnd());
    if (!line.trim()) {
      inQuote = false;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 3;
      blocks.push({
        text: heading[2] ?? "",
        size: level === 1 ? 20 : level === 2 ? 15 : 12,
        bold: true,
        color: level === 1 ? { r: 0.06, g: 0.18, b: 0.28 } : { r: 0.08, g: 0.3, b: 0.42 },
        spacingBefore: level === 1 ? 0 : 10,
        spacingAfter: 5,
        indent: 0,
      });
      continue;
    }
    if (/^\|[-:| ]+\|$/.test(line)) continue;
    if (line.startsWith("|")) {
      blocks.push({
        text: line.slice(1, -1).split("|").map((cell) => cell.trim()).join("  |  "),
        size: 7.5,
        bold: false,
        color: { r: 0.18, g: 0.22, b: 0.25 },
        spacingBefore: 1,
        spacingAfter: 2,
        indent: 0,
      });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      blocks.push({
        text: quote[1] ?? "",
        size: 9,
        bold: false,
        color: { r: 0.25, g: 0.3, b: 0.34 },
        spacingBefore: inQuote ? 0 : 3,
        spacingAfter: 2,
        indent: 12,
      });
      inQuote = true;
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    blocks.push({
      text: (bullet ? `- ${bullet[1]}` : line)
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1"),
      size: 9.5,
      bold: false,
      color: { r: 0.12, g: 0.16, b: 0.2 },
      spacingBefore: 1,
      spacingAfter: 3,
      indent: bullet ? 10 : 0,
    });
  }
  return blocks;
}

function breakLongWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const pieces: string[] = [];
  let piece = "";
  for (const character of word) {
    if (piece && font.widthOfTextAtSize(piece + character, size) > maxWidth) {
      pieces.push(piece);
      piece = character;
    } else {
      piece += character;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).flatMap((word) => breakLongWord(word, font, size, maxWidth));
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function drawHeader(page: PDFPage, font: PDFFont): void {
  page.drawText("POLICYPULSE AI", {
    x: MARGIN,
    y: PAGE_HEIGHT - 28,
    size: 8,
    font,
    color: rgb(0.08, 0.3, 0.42),
  });
  page.drawLine({
    start: { x: MARGIN, y: PAGE_HEIGHT - 34 },
    end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 34 },
    thickness: 0.5,
    color: rgb(0.75, 0.81, 0.84),
  });
}

export async function generatePolicyReportPdf(input: PolicyReportInput): Promise<Uint8Array> {
  const markdown = generatePolicyReportMarkdown(input);
  const pdf = await PDFDocument.create();
  pdf.setTitle(input.state.report?.title ?? "PolicyPulse AI Policy Report");
  pdf.setAuthor(input.generatedBy ?? "PolicyPulse AI");
  pdf.setSubject("Policy change impact, compliance risk, action, approval, evidence, and evaluation report");
  pdf.setCreationDate(new Date(input.generatedAt ?? Date.now()));
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const blocks = markdownBlocks(markdown);
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawHeader(page, bold);
  let y = PAGE_HEIGHT - 58;

  for (const block of blocks) {
    const font = block.bold ? bold : regular;
    const lineHeight = block.size * 1.35;
    const availableWidth = PAGE_WIDTH - MARGIN * 2 - block.indent;
    const lines = wrapText(block.text, font, block.size, availableWidth);
    const requiredHeight = block.spacingBefore + lines.length * lineHeight + block.spacingAfter;
    if (y - requiredHeight < MARGIN + 20) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawHeader(page, bold);
      y = PAGE_HEIGHT - 58;
    }
    y -= block.spacingBefore;
    for (const line of lines) {
      page.drawText(line, {
        x: MARGIN + block.indent,
        y: y - block.size,
        size: block.size,
        font,
        color: rgb(block.color.r, block.color.g, block.color.b),
      });
      y -= lineHeight;
    }
    y -= block.spacingAfter;
  }

  const pages = pdf.getPages();
  pages.forEach((reportPage, index) => {
    const label = `Page ${index + 1} of ${pages.length}`;
    reportPage.drawText(label, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(label, 8),
      y: 22,
      size: 8,
      font: regular,
      color: rgb(0.35, 0.4, 0.44),
    });
    reportPage.drawText(`Workflow ${input.state.runId} | Analysis v${input.state.analysisVersion}`, {
      x: MARGIN,
      y: 22,
      size: 7.5,
      font: regular,
      color: rgb(0.35, 0.4, 0.44),
    });
  });
  return pdf.save();
}
