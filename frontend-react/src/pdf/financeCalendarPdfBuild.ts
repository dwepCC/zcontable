import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont, type PDFPage } from 'pdf-lib';
import type { FinanceCalendarDetail } from '../services/financeCalendar';
import { loadImageBlobForPdf, rasterizeImageBlobToPngForPdf } from '../utils/pdfLogo';
import {
  WEEKDAYS,
  activitiesForDay,
  activitySpanDays,
  buildMonthGrid,
  chunkWeeks,
  formatPeriodPdfTitle,
  localDateKey,
  marksByDayKey,
  activityTextDisplayColor,
} from '../pages/finance/calendar/calendarUtils';

/** Imágenes fijas en `frontend-react/public/` para el pie del PDF del calendario. */
export const CALENDAR_PDF_PUBLIC_FOOTER_LEFT = 'calendario-pdf-ilustracion.png';
export const CALENDAR_PDF_PUBLIC_FOOTER_LOGO = 'calendario-pdf-logo.png';

const GREEN = rgb(0.08, 0.38, 0.18);
const NAVY = rgb(0.05, 0.12, 0.38);
const WHITE = rgb(1, 1, 1);
const RED = rgb(0.75, 0.12, 0.12);
const BLUE = rgb(0.1, 0.35, 0.65);
const BORDER = rgb(0.82, 0.82, 0.82);
const LIGHT = rgb(0.96, 0.96, 0.96);

const M = 28;
const TOP_HEADER_H = 46;
const FOOTER_OJO_H = 16;
const FOOTER_ROW_H = 68;
const FOOTER_TOTAL = FOOTER_OJO_H + FOOTER_ROW_H + 6;
const HEADER_H = 22;
const DAY_BAR_H = 14;
const FONT = 6;
const LINE_H = FONT + 2;
const MIN_ROW_BODY_H = 48;
const ROW_GAP = 1;
const PAGE_W = 842;
const PAGE_H = 595;

const FOOTER_NOTICE = 'REVISAR BUZONES LOS DIAS MIERCOLES Y SABADO';

type PdfLine = { text: string; color: ReturnType<typeof rgb> };

type WeekCellData = {
  cell: ReturnType<typeof buildMonthGrid>[number];
  lines: PdfLine[];
  maxChars: number;
};

export type FinanceCalendarPdfOptions = {
  /** Logo del estudio (FirmConfig.logo_url). */
  firmLogoUrl?: string | null;
  /** Aviso central del pie; por defecto el texto estándar del estudio. */
  footerNotice?: string;
};

function publicBaseUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.BASE_URL === 'string') {
    return import.meta.env.BASE_URL;
  }
  return '/';
}

async function fetchPublicAsset(filename: string): Promise<{ bytes: Uint8Array; blob: Blob } | null> {
  if (typeof fetch === 'undefined') return null;
  const path = `${publicBaseUrl()}${filename.replace(/^\//, '')}`;
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), blob };
  } catch {
    return null;
  }
}

async function tryEmbedPngJpeg(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage | null> {
  if (!bytes.length) return null;
  try {
    return await doc.embedPng(bytes);
  } catch {
    /* noop */
  }
  try {
    return await doc.embedJpg(bytes);
  } catch {
    /* noop */
  }
  return null;
}

async function embedImageBytes(
  doc: PDFDocument,
  bytes: Uint8Array | null,
  sourceBlob?: Blob | null,
): Promise<PDFImage | null> {
  if (!bytes?.length) return null;
  const direct = await tryEmbedPngJpeg(doc, bytes);
  if (direct) return direct;
  const blob =
    sourceBlob && sourceBlob.size > 0
      ? sourceBlob
      : new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
  const png = await rasterizeImageBlobToPngForPdf(blob);
  if (!png?.size) return null;
  return tryEmbedPngJpeg(doc, new Uint8Array(await png.arrayBuffer()));
}

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
  const h = activityTextDisplayColor(hex).replace('#', '');
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  );
}

function drawImageFit(
  page: PDFPage,
  img: PDFImage,
  x: number,
  top: number,
  maxW: number,
  maxH: number,
  align: 'left' | 'center' | 'right' = 'left',
) {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  let drawX = x;
  if (align === 'center') drawX = x + (maxW - w) / 2;
  if (align === 'right') drawX = x + maxW - w;
  page.drawImage(img, {
    x: drawX,
    y: topY(page, top + (maxH + h) / 2),
    width: w,
    height: h,
  });
}

function drawPageHeader(
  page: PDFPage,
  title: string,
  firmLogo: PDFImage | null,
  fontTitle: PDFFont,
) {
  const pageW = page.getWidth();
  const logoMaxH = 34;
  const logoMaxW = 110;

  if (firmLogo) {
    drawImageFit(page, firmLogo, M, 8, logoMaxW, logoMaxH, 'left');
  }

  const titleSize = 22;
  const tw = fontTitle.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (pageW - tw) / 2,
    y: topY(page, TOP_HEADER_H / 2 + 6),
    size: titleSize,
    font: fontTitle,
    color: NAVY,
  });
}

function drawPageFooter(
  page: PDFPage,
  fontBold: PDFFont,
  leftImg: PDFImage | null,
  rightImg: PDFImage | null,
  notice: string,
) {
  const pageW = page.getWidth();
  const pageH = page.getHeight();
  const contentW = pageW - M * 2;
  const footerTop = pageH - M - FOOTER_TOTAL;

  page.drawRectangle({
    x: M,
    y: topY(page, footerTop + FOOTER_OJO_H),
    width: contentW,
    height: FOOTER_OJO_H,
    color: GREEN,
  });
  const ojo = 'OJO';
  const ojoSize = 9;
  const ojoW = fontBold.widthOfTextAtSize(ojo, ojoSize);
  page.drawText(ojo, {
    x: M + (contentW - ojoW) / 2,
    y: topY(page, footerTop + FOOTER_OJO_H / 2 + 3),
    size: ojoSize,
    font: fontBold,
    color: WHITE,
  });

  const rowTop = footerTop + FOOTER_OJO_H + 4;
  const colW = contentW / 3;
  const noticeSize = 9;
  const noticeLines = wrapLines(notice.toUpperCase(), 34, 3);
  const noticeBlockH = noticeLines.length * (noticeSize + 3);
  let noticeY = rowTop + (FOOTER_ROW_H - noticeBlockH) / 2 + noticeSize;
  for (const ln of noticeLines) {
    const lw = fontBold.widthOfTextAtSize(ln, noticeSize);
    page.drawText(ln, {
      x: M + colW + (colW - lw) / 2,
      y: topY(page, noticeY),
      size: noticeSize,
      font: fontBold,
      color: RED,
    });
    noticeY += noticeSize + 3;
  }

  if (leftImg) {
    drawImageFit(page, leftImg, M + 4, rowTop + 2, colW - 8, FOOTER_ROW_H - 4, 'left');
  }
  if (rightImg) {
    drawImageFit(page, rightImg, M + colW * 2, rowTop + 2, colW - 4, FOOTER_ROW_H - 4, 'right');
  }
}

export async function buildFinanceCalendarPdf(
  detail: FinanceCalendarDetail,
  options: FinanceCalendarPdfOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontTitle = await doc.embedFont(StandardFonts.TimesRomanBold);

  const [firmLogoBlob, footerLeftAsset, footerLogoAsset] = await Promise.all([
    loadImageBlobForPdf(options.firmLogoUrl),
    fetchPublicAsset(CALENDAR_PDF_PUBLIC_FOOTER_LEFT),
    fetchPublicAsset(CALENDAR_PDF_PUBLIC_FOOTER_LOGO),
  ]);

  const [firmLogoImg, footerLeftImg, footerLogoImg] = await Promise.all([
    firmLogoBlob
      ? embedImageBytes(doc, new Uint8Array(await firmLogoBlob.arrayBuffer()), firmLogoBlob)
      : Promise.resolve(null),
    footerLeftAsset
      ? embedImageBytes(doc, footerLeftAsset.bytes, footerLeftAsset.blob)
      : Promise.resolve(null),
    footerLogoAsset
      ? embedImageBytes(doc, footerLogoAsset.bytes, footerLogoAsset.blob)
      : Promise.resolve(null),
  ]);

  const notice = (options.footerNotice ?? FOOTER_NOTICE).trim() || FOOTER_NOTICE;
  const periodTitle = formatPeriodPdfTitle(detail.period_ym);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  const pageW = PAGE_W;
  const pageH = PAGE_H;
  const contentW = pageW - M * 2;
  const colW = contentW / 7;

  drawPageHeader(page, periodTitle, firmLogoImg, fontTitle);

  let y = M + TOP_HEADER_H;
  drawWeekdayHeader(page, y, colW, fontBold);
  y += HEADER_H + 2;

  const cells = buildMonthGrid(detail.period_ym);
  const weeks = chunkWeeks(cells);
  const markMap = marksByDayKey(detail.marks ?? []);
  const acts = detail.activities ?? [];

  const weekPlans = weeks.map((week) => buildWeekCellData(week, markMap, acts, colW));
  let rowHeights = weekPlans.map((p) => p.rowH);

  const bottomReserve = M + FOOTER_TOTAL;
  const gridArea = pageH - y - bottomReserve;
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
            const lw = font.widthOfTextAtSize(ln, FONT);
            page.drawText(ln, {
              x: x + Math.max(2, (w - lw) / 2),
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
    const pageBottom = pageH - bottomReserve;
    if (y + rowH > pageBottom && wi > 0) {
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

  const pages = doc.getPages();
  const lastPage = pages[pages.length - 1]!;
  drawPageFooter(lastPage, fontBold, footerLeftImg, footerLogoImg, notice);

  return doc.save();
}

export function financeCalendarPdfFilename(periodYm: string): string {
  return `calendario-${periodYm}.pdf`;
}
