/**
 * Célula de CSV (Excel em português usa ponto e vírgula): aspas escapadas e, se o texto começar com = + - @
 * (ou tabulação/retorno), um apóstrofo na frente para o Excel/Planilhas não executarem como fórmula.
 * Títulos de obras são editáveis por quem as cadastra e vão parar na planilha de quem exporta.
 */
export function csvCell(value: string | number): string {
  const text = String(value);
  const safe = typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
