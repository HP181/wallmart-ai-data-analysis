/**
 * RFC 4180 CSV encoding with spreadsheet formula-injection protection.
 *
 * Exported CSVs get opened in Excel and Google Sheets, which treat a cell that
 * starts with = + - @ (or a tab / carriage return) as a formula. Text cells
 * that begin with one of those characters are prefixed with an apostrophe so
 * they stay inert. Numbers are written as-is, so negative numbers are fine.
 */

const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text: string;
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  } else if (typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  } else if (value instanceof Date) {
    text = Number.isNaN(value.getTime()) ? "" : value.toISOString();
  } else {
    text = String(value);
  }

  if (FORMULA_TRIGGERS.test(text)) text = `'${text}`;

  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export const CSV_NEWLINE = "\r\n";

export function toCsvLine(values: unknown[]): string {
  return values.map(escapeCsvCell).join(",") + CSV_NEWLINE;
}
