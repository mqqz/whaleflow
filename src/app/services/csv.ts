import Papa from "papaparse";

type CsvRow = Record<string, string | undefined>;

const ensureFinite = (value: number, field: string, rowIndex: number) => {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number for ${field} at row ${rowIndex + 1}.`);
  }
  return value;
};

export const toSafeNumber = (value: unknown, field: string, rowIndex: number) => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return ensureFinite(parsed, field, rowIndex);
};

export const toSafeDate = (value: unknown, field: string, rowIndex: number) => {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date for ${field} at row ${rowIndex + 1}.`);
  }
  return date;
};

export async function fetchCsv<T>(
  url: string,
  rowMapper: (row: CsvRow, rowIndex: number) => T | null,
): Promise<T[]> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch CSV ${url}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(`Failed to parse CSV ${url}: ${first?.message ?? "Unknown parse error"}`);
  }

  const rows: T[] = [];
  for (let idx = 0; idx < parsed.data.length; idx += 1) {
    const mapped = rowMapper(parsed.data[idx] ?? {}, idx);
    if (mapped !== null) {
      rows.push(mapped);
    }
  }

  return rows;
}
