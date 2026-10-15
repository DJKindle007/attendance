/** The end-of-day tardy spreadsheet. Columns match what the office needs to correct OnCourse. */
import ExcelJS from 'exceljs';
import type { TardyRow } from './domain/report';
import { formatLongDate } from './time';

export async function buildTardyXlsx(rows: TardyRow[], dateKey: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kindle Attendance';
  wb.created = new Date();
  const ws = wb.addWorksheet('Tardy', { views: [{ state: 'frozen', ySplit: 2 }] });

  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = `Late arrivals, ${formatLongDate(dateKey)} (${rows.length} student${rows.length === 1 ? '' : 's'})`;
  ws.getCell('A1').font = { bold: true, size: 13 };

  ws.getRow(2).values = ['Last Name', 'First Name', 'Local ID', 'Grade', 'Homeroom', 'Arrival Time', 'DeansList Mark at Report Time'];
  ws.getRow(2).font = { bold: true };
  ws.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F0EF' } };
  ws.columns = [{ width: 18 }, { width: 18 }, { width: 14 }, { width: 8 }, { width: 10 }, { width: 14 }, { width: 28 }];

  for (const r of rows) {
    ws.addRow([r.lastName, r.firstName, r.localId, r.grade, r.homeroom, r.arrivedAtText, r.deansListMark]);
  }
  ws.autoFilter = { from: 'A2', to: 'G2' };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

export function tardyFileName(dateKey: string): string {
  return `tardy-${dateKey}.xlsx`;
}
