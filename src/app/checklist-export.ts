import type { Task } from './checklist/checklist';

export interface ExportedFile {
  file: File;
  date: string;
  summary: string;
}

type ExcelModule = typeof import('exceljs');
let excelPromise: Promise<ExcelModule> | null = null;

/** Lazily load ExcelJS so it isn't part of the initial app bundle. */
export function loadExcel(): Promise<ExcelModule> {
  if (!excelPromise) {
    excelPromise = import('exceljs').then((m: any) => (m.default ?? m) as ExcelModule);
    excelPromise.catch(() => (excelPromise = null));
  }
  return excelPromise;
}

const BLUE = 'FF0033A0';
const GREEN_BG = 'FFE8F5E9';
const RED_BG = 'FFFCE4EC';

/** Build an .xlsx file for a checklist day. `date` is YYYY-MM-DD. */
export async function buildChecklistWorkbook(date: string, tasks: Task[]): Promise<ExportedFile> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ballard Checklist';
  wb.created = new Date();

  const total = tasks.length;
  const done = tasks.filter(t => t.completed).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const sections = [...new Set(tasks.map(t => t.section))];

  // ---- Tasks sheet: every individual task and whether it was completed ----
  const ws = wb.addWorksheet('Tasks', {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [{ width: 6 }, { width: 24 }, { width: 56 }, { width: 14 }];

  ws.mergeCells('A1:D1');
  const title = ws.getCell('A1');
  title.value = `Checklist - ${formatDate(date)}`;
  title.font = { bold: true, size: 16, color: { argb: BLUE } };

  ws.mergeCells('A2:B2');
  ws.mergeCells('A3:B3');
  ws.getCell('A2').value = 'Completion';
  ws.getCell('C2').value = `${pct}% (${done} of ${total} tasks completed)`;
  ws.getCell('A3').value = 'Exported';
  ws.getCell('C3').value = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) + ' PT';
  ws.getCell('A2').font = ws.getCell('A3').font = { bold: true };

  const header = ws.getRow(5);
  header.values = ['#', 'Section', 'Task', 'Completed?'];
  header.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    c.alignment = { vertical: 'middle' };
  });
  header.getCell(4).alignment = { horizontal: 'center' };

  const thin = { style: 'thin' as const, color: { argb: 'FFD0D7E5' } };
  let n = 0;
  for (const section of sections) {
    for (const t of tasks.filter(x => x.section === section)) {
      n++;
      const row = ws.addRow([n, t.section, t.name, t.completed ? '✓ Yes' : '✗ No']);
      const status = row.getCell(4);
      status.alignment = { horizontal: 'center', vertical: 'top' };
      status.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: t.completed ? GREEN_BG : RED_BG } };
      status.font = { bold: true, color: { argb: t.completed ? 'FF2E7D32' : 'FFC62828' } };
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
      row.getCell(2).alignment = { vertical: 'top' };
      row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
      row.eachCell(c => (c.border = { top: thin, bottom: thin, left: thin, right: thin }));
    }
  }
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 4 } };

  // ---- Summary sheet ----
  const sum = wb.addWorksheet('Summary by Section');
  sum.columns = [{ width: 28 }, { width: 12 }, { width: 10 }, { width: 14 }];
  const sh = sum.addRow(['Section', 'Completed', 'Total', 'Completion']);
  sh.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
  });
  for (const section of sections) {
    const st = tasks.filter(t => t.section === section);
    const sd = st.filter(t => t.completed).length;
    const r = sum.addRow([section, sd, st.length, st.length ? sd / st.length : 0]);
    r.getCell(4).numFmt = '0%';
  }
  const tr = sum.addRow(['Total', done, total, total ? done / total : 0]);
  tr.font = { bold: true };
  tr.getCell(4).numFmt = '0%';

  const buffer = await wb.xlsx.writeBuffer();
  const file = new File([buffer], `checklist-${date}.xlsx`, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return {
    file,
    date,
    summary: `Checklist for ${formatDate(date)}: ${pct}% complete (${done} of ${total} tasks).`,
  };
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function canShareFile(file: File): boolean {
  return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [file] });
}

/**
 * Share the file through the device share sheet (Mail, Outlook, Gmail...).
 * Returns 'shared' | 'cancelled' | 'needs-tap' (browser requires a fresh tap) | 'fallback'.
 * The fallback downloads the file and opens a pre-filled email to attach it to.
 */
export async function emailFile(exp: ExportedFile): Promise<'shared' | 'cancelled' | 'needs-tap' | 'fallback'> {
  const subject = `Checklist - ${formatDate(exp.date)}`;
  if (canShareFile(exp.file)) {
    try {
      await navigator.share({ files: [exp.file], title: subject, text: exp.summary });
      return 'shared';
    } catch (err: any) {
      if (err?.name === 'AbortError') return 'cancelled';
      if (err?.name === 'NotAllowedError') return 'needs-tap';
      // Any other failure: fall through to download + mailto
    }
  }
  downloadFile(exp.file);
  const body = `${exp.summary}\n\nThe Excel file (${exp.file.name}) was downloaded to this device — please attach it to this email.`;
  setTimeout(() => {
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, 300);
  return 'fallback';
}

function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return `${m}/${d}/${y}`;
}
