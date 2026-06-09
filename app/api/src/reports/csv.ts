/**
 * Escapado CSV (RFC 4180): si el campo contiene coma, comilla o salto de línea,
 * se envuelve en comillas dobles y se duplican las comillas internas.
 */
export function csvField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvField).join(',') + '\r\n';
}
