import * as XLSX from "xlsx";
import { normalizeTimeCell } from "@/lib/excelParsing";

const KEYWORDS = {
  start: ["시작예정", "시작 예정", "시작시간", "시작 시각", "시작"],
  program: ["프로그램명", "프로그램"],
  room: ["렉처룸", "렉쳐룸", "강의실", "룸", "장소"]
};

function normalize(v: any): string {
  return v == null ? "" : String(v).replace(/\s/g, "").trim().toLowerCase();
}

function hasKeyword(value: any, keywords: string[]): boolean {
  const text = normalize(value);
  return keywords.some((k) => text.includes(normalize(k)));
}

export type TimetableRow = { program_name: string; location: string; start_time: string };

// Scans the first ~40 rows for a header row that has all three of
// start/program/room columns (same heuristic as the original Python tool:
// score each row by how many keyword columns it matches, keep the best).
export function parseTimetableSheet(sheet: XLSX.WorkSheet): TimetableRow[] {
  const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });

  let headerRowIdx = -1;
  let cols: { start?: number; program?: number; room?: number } = {};
  let bestScore = 0;

  const scanRows = Math.min(grid.length, 40);
  for (let r = 0; r < scanRows; r++) {
    const row = grid[r] || [];
    const found: typeof cols = {};
    row.forEach((cell, c) => {
      if (found.start === undefined && hasKeyword(cell, KEYWORDS.start)) found.start = c;
      if (found.program === undefined && hasKeyword(cell, KEYWORDS.program)) found.program = c;
      if (found.room === undefined && hasKeyword(cell, KEYWORDS.room)) found.room = c;
    });
    const score = Object.keys(found).length;
    if (score > bestScore) {
      bestScore = score;
      headerRowIdx = r;
      cols = found;
    }
  }

  if (bestScore < 3 || headerRowIdx === -1) return [];

  const rows: TimetableRow[] = [];
  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const program = cols.program !== undefined ? row[cols.program] : "";
    const start = cols.start !== undefined ? row[cols.start] : "";
    const room = cols.room !== undefined ? row[cols.room] : "";
    if (!program || start === "" || !room) continue;
    rows.push({
      program_name: String(program).trim(),
      location: String(room).trim(),
      start_time: normalizeTimeCell(start)
    });
  }
  return rows;
}

// Reads every sheet in the workbook and returns only the ones that look
// like real timetables (at least one valid row detected). Sheet order is
// preserved. Deliberately reads WITHOUT cellDates — see excelParsing.ts.
export function parseTimetableWorkbook(buf: ArrayBuffer): { name: string; rows: TimetableRow[] }[] {
  const wb = XLSX.read(buf, { type: "array" });
  return wb.SheetNames.map((name) => ({ name, rows: parseTimetableSheet(wb.Sheets[name]) })).filter(
    (s) => s.rows.length > 0
  );
}
