import { readFile } from "node:fs/promises";
import type { Lead } from "./types.js";

const REQUIRED_COLUMNS = [
  "name",
  "company",
  "company_size",
  "industry",
  "source",
  "last_interaction_date",
] as const;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      row.push(cell);
      cell = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      cell += character;
    }
  }

  if (inQuotes) throw new Error("CSV has an unclosed quoted field.");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

export async function loadLeads(inputPath: string): Promise<{
  leads: Lead[];
  warnings: string[];
}> {
  const text = await readFile(inputPath, "utf8");
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error("The input CSV is empty.");

  const headers = rows[0]!.map((header) => header.trim().replace(/^\uFEFF/, ""));
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw new Error(`CSV is missing required column(s): ${missing.join(", ")}`);
  }

  const indexes = new Map(headers.map((header, index) => [header, index]));
  const warnings: string[] = [];
  const leads = rows.slice(1).map((cells, rowIndex) => {
    const sourceRow = rowIndex + 2;
    if (cells.length !== headers.length) {
      warnings.push(
        `CSV row ${sourceRow} has ${cells.length} value(s), expected ${headers.length}; missing cells were left blank.`,
      );
    }
    const value = (column: (typeof REQUIRED_COLUMNS)[number]) =>
      (cells[indexes.get(column)!] ?? "").trim();

    return {
      lead_id: `lead_${String(rowIndex + 1).padStart(4, "0")}`,
      name: value("name"),
      company: value("company"),
      company_size: value("company_size"),
      industry: value("industry"),
      source: value("source"),
      last_interaction_date: value("last_interaction_date"),
    };
  });

  return { leads, warnings };
}
