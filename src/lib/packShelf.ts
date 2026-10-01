/**
 * Arruma as séries em linhas completas da estante, sem nichos vazios.
 *
 * Cada linha tem `perRow` meias-colunas. Seguindo a ordem recebida (últimas
 * adições primeiro), cada linha pega a próxima série que couber; se a próxima
 * da lista não couber, puxa a seguinte que caiba.
 *
 * O que sobra numa linha pode:
 * - virar o nicho de livros avulsos (`fillerAfter`), na linha com a maior sobra;
 * - ou ser dividido entre as séries da linha, para nenhuma ficar com um vão grande.
 */
export function packShelf<T>(
  items: T[],
  unitsOf: (item: T) => number,
  perRow: number,
  { reserveFiller = false } = {},
) {
  const pending = items.map((item) => ({ item, units: Math.min(unitsOf(item), perRow) }));
  const rows: { cells: { item: T; units: number }[]; leftover: number }[] = [];

  while (pending.length > 0) {
    let remaining = perRow;
    const cells: { item: T; units: number }[] = [];
    for (;;) {
      const i = pending.findIndex((p) => p.units <= remaining);
      if (i < 0) break;
      cells.push(pending.splice(i, 1)[0]);
      remaining -= cells[cells.length - 1].units;
      if (remaining === 0) break;
    }
    if (cells.length === 0) break; // não acontece: units é limitado a perRow
    rows.push({ cells, leftover: remaining });
  }

  // Linha que recebe o nicho extra: maior sobra (>= 2), de preferência a mais embaixo
  let fillerRow = -1;
  if (reserveFiller) {
    rows.forEach((r, i) => {
      if (r.leftover >= 2 && (fillerRow < 0 || r.leftover >= rows[fillerRow].leftover)) fillerRow = i;
    });
  }

  const placed: { item: T; span: number; fillerAfter: number }[] = [];
  rows.forEach((r, ri) => {
    const spans = r.cells.map((c) => c.units);
    if (ri !== fillerRow) {
      // Divide a sobra: +1 meia-coluna por série, das últimas para as primeiras
      for (let k = 0; k < r.leftover; k++) spans[spans.length - 1 - (k % spans.length)] += 1;
    }
    r.cells.forEach((c, ci) => {
      const last = ci === r.cells.length - 1;
      placed.push({ item: c.item, span: spans[ci], fillerAfter: ri === fillerRow && last ? r.leftover : 0 });
    });
  });

  return { placed, fillerPlaced: fillerRow >= 0 };
}
