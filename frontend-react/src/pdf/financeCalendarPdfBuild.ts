import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { FinanceCalendarDetail } from '../services/financeCalendar';
import {
  WEEKDAYS,
  activitiesForDay,
  activitySpanDays,
  buildMonthGrid,
  chunkWeeks,
  formatPeriodLabel,
  localDateKey,
  marksByDayKey,
  activityColorHex,
} from '../pages/finance/calendar/calendarUtils';

const GREEN = rgb(0.02, 0.59, 0.41); // primary-600
const GREEN_DARK = rgb(0.02, 0.47, 0.33);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.45, 0.45, 0.45);
const RED = rgb(0.75, 0.15, 0.15);
const BLUE = rgb(0.1, 0.35, 0.65);
const BORDER = rgb(0.82, 0.82, 0.82);
const LIGHT = rgb(0.96, 0.96, 0.96);

const M = 28;
const HEADER_H = 22;
const DAY_BAR_H = 14;
const FONT = 6;
const LINE_H = FONT + 2;
/** Altura mínima del cuerpo de cada celda (debajo del número del día). */
const MIN_ROW_BODY_H = 48;
const ROW_GAP = 1;
const PAGE_W = 842;
const PAGE_H = 595;

type PdfLine = { text: string; color: ReturnType<typeof rgb> };

type WeekCellData = {
  cell: ReturnType<typeof buildMonthGrid>[number];
  lines: PdfLine[];
  maxChars: number;
};

function countVisualLines(lines: PdfLine[], maxChars: number): number {
  let n = 0;
  for (const item of lines) {
    n += wrapLines(item.text, maxChars, 2).length;
  }
  return n;
}

function buildWeekCellData(
  week: ReturnType<typeof chunkWeeks>[number],
  markMap: ReturnType<typeof marksByDayKey>,
  acts: FinanceCalendarDetail['activities'],
  colW: number,
): { cellData: WeekCellData[]; rowH: number } {
  const maxChars = Math.max(8, Math.floor((colW - 1) / (FONT * 0.45)));
  let maxVisualLines = 0;

  const cellData = week.map((cell) => {
    if (!cell.inMonth) {
      return { cell, lines: [] as PdfLine[], maxChars };
    }
    const key = localDateKey(cell.date);
    const lines: PdfLine[] = [];
    for (const m of markMap.get(key) ?? []) {
      lines.push({ text: m.label.toUpperCase(), color: markColor(m.kind) });
    }
    for (const a of activitiesForDay(acts ?? [], cell.dayNum)) {
      const { start, end } = activitySpanDays(a);
      const span = start !== end ? ` (${start}-${end})` : '';
      lines.push({ text: `${a.name}${span}`, color: activityTextPdfColor(a.text_color) });
    }
    maxVisualLines = Math.max(maxVisualLines, countVisualLines(lines, maxChars));
    return { cell, lines, maxChars };
  });

  const bodyH = Math.max(MIN_ROW_BODY_H, maxVisualLines * LINE_H + 4);
  const rowH = DAY_BAR_H + bodyH;
  return { cellData, rowH };
}

function drawWeekdayHeader(page: PDFPage, y: number, colW: number, fontBold: PDFFont) {
  WEEKDAYS.forEach((day, i) => {
    const x = M + i * colW;
    page.drawRectangle({
      x,
      y: topY(page, y + HEADER_H),
      width: colW - 1,
      height: HEADER_H,
      color: GREEN,
    });
    const tw = fontBold.widthOfTextAtSize(day.toUpperCase(), 7);
    page.drawText(day.toUpperCase(), {
      x: x + (colW - 1 - tw) / 2,
      y: topY(page, y + HEADER_H / 2 + 2.5),
      size: 7,
      font: fontBold,
      color: WHITE,
    });
  });
}

function topY(page: PDFPage, fromTop: number) {
  return page.getHeight() - fromTop;
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w.length > maxChars ? w.slice(0, maxChars - 1) + '…' : w;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.slice(0, maxLines);
}

function markColor(kind: string) {
  if (kind === 'feriado') return RED;
  if (kind === 'festividad') return rgb(0.45, 0.2, 0.55);
  return BLUE;
}

function activityTextPdfColor(hex?: string) {
  const h = activityColorHex(hex).replace('#', '');
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  );
}

export async function buildFinanceCalendarPdf(detail: FinanceCalendarDetail): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  const pageW = PAGE_W;
  const pageH = PAGE_H;
  const contentW = pageW - M * 2;

  const colW = contentW / 7;
  const periodLabel = formatPeriodLabel(detail.period_ym);
  let y = M;

  page.drawText('ZContable — Calendario de actividades', {
    x: M,
    y: topY(page, y + 12),
    size: 11,
    font: fontBold,
    color: BLACK,
  });
  page.drawText(periodLabel, {
    x: M,
    y: topY(page, y + 26),
    size: 10,
    font,
    color: GRAY,
  });
  if (detail.is_closed) {
    page.drawText('(Calendario cerrado)', {
      x: M + font.widthOfTextAtSize(periodLabel, 10) + 8,
      y: topY(page, y + 26),
      size: 9,
      font: fontBold,
      color: GREEN_DARK,
    });
  }
  y += 38;

  drawWeekdayHeader(page, y, colW, fontBold);
  y += HEADER_H + 2;

  const cells = buildMonthGrid(detail.period_ym);
  const weeks = chunkWeeks(cells);
  const markMap = marksByDayKey(detail.marks ?? []);
  const acts = detail.activities ?? [];

  const weekPlans = weeks.map((week) => buildWeekCellData(week, markMap, acts, colW));
  let rowHeights = weekPlans.map((p) => p.rowH);

  const gridArea = pageH - y - M;
  const totalGaps = Math.max(0, weeks.length - 1) * ROW_GAP;
  const totalRows = rowHeights.reduce((sum, h) => sum + h, 0);
  if (totalRows + totalGaps < gridArea) {
    const extra = (gridArea - totalRows - totalGaps) / weeks.length;
    rowHeights = rowHeights.map((h) => h + extra);
  }

  const drawWeekRow = (cellData: WeekCellData[], rowH: number) => {
    cellData.forEach(({ cell, lines, maxChars }, colIdx) => {
      const x = M + colIdx * colW;
      const w = colW - 1;
      const cellTop = y;

      page.drawRectangle({
        x,
        y: topY(page, cellTop + rowH),
        width: w,
        height: rowH,
        borderColor: BORDER,
        borderWidth: 0.5,
        color: cell.inMonth ? WHITE : LIGHT,
      });

      if (cell.inMonth) {
        page.drawRectangle({
          x,
          y: topY(page, cellTop + DAY_BAR_H),
          width: w,
          height: DAY_BAR_H,
          color: GREEN,
        });
        const dn = String(cell.dayNum);
        const dtw = fontBold.widthOfTextAtSize(dn, 8);
        page.drawText(dn, {
          x: x + (w - dtw) / 2,
          y: topY(page, cellTop + DAY_BAR_H / 2 + 2.5),
          size: 8,
          font: fontBold,
          color: WHITE,
        });

        let ly = cellTop + DAY_BAR_H + 4;
        for (const item of lines) {
          const wrapped = wrapLines(item.text, maxChars, 2);
          for (const ln of wrapped) {
            if (ly + FONT > cellTop + rowH - 2) break;
            page.drawText(ln, {
              x: x + 2,
              y: topY(page, ly + FONT),
              size: FONT,
              font,
              color: item.color,
            });
            ly += LINE_H;
          }
        }
      }
    });

    y += rowH + ROW_GAP;
  };

  for (let wi = 0; wi < weeks.length; wi++) {
    const rowH = rowHeights[wi] ?? MIN_ROW_BODY_H + DAY_BAR_H;
    if (y + rowH + M > pageH && wi > 0) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = M;
      drawWeekdayHeader(page, y, colW, fontBold);
      y += HEADER_H + 2;
      const remaining = weeks.length - wi;
      const remainingHeights = rowHeights.slice(wi);
      const area = pageH - y - M;
      const gaps = Math.max(0, remaining - 1) * ROW_GAP;
      const sum = remainingHeights.reduce((a, b) => a + b, 0);
      if (sum + gaps < area) {
        const extra = (area - sum - gaps) / remaining;
        for (let j = wi; j < weeks.length; j++) {
          rowHeights[j] = (rowHeights[j] ?? rowH) + extra;
        }
      }
    }
    drawWeekRow(weekPlans[wi]!.cellData, rowHeights[wi]!);
  }

  return doc.save();
}

export function financeCalendarPdfFilename(periodYm: string): string {
  return `calendario-${periodYm}.pdf`;
}
