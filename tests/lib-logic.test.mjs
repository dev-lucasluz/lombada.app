/**
 * Testa a lógica pura do app (faixas de volumes, séries de livros, agrupar lombadas, encaixe da estante).
 * Rodar: npm run test:logic
 */
import { build } from "esbuild";
import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs";

const root = fileURLToPath(new URL("..", import.meta.url)).replaceAll("\\", "/");
const tmp = `${root}node_modules/.tmp`;
fs.mkdirSync(tmp, { recursive: true });
const entry = `${tmp}/lib-logic.entry.ts`;
fs.writeFileSync(
  entry,
  `export * from "${root}src/lib/ranges";
export { groupBookSeries } from "${root}src/lib/bookSeries";
export { normalizeTitle, groupSpines } from "${root}src/lib/quickAdd";
export { ownedWithinTotal } from "${root}src/lib/db";
export { editionLabel } from "${root}src/lib/editionLabel";
export { packShelf } from "${root}src/lib/packShelf";
export { isStandalone } from "${root}src/components/BookShelf";
export { seriesUnits } from "${root}src/components/Shelf";`,
);
const outfile = `${tmp}/lib-logic.bundle.mjs`;
await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  logLevel: "error",
  jsx: "automatic",
  loader: { ".css": "empty" },
  define: { "import.meta.env": '{"DEV":false,"VITE_DEMO":"false","VITE_SUPABASE_URL":"http://x","VITE_SUPABASE_PUBLISHABLE_KEY":"k"}' },
});
const L = await import(pathToFileURL(outfile).href);

let pass = 0;
let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(ok ? "OK   " : "FALHA", name, ok ? "" : `\n   obtido   ${JSON.stringify(got)}\n   esperado ${JSON.stringify(want)}`);
};

// faixas de volumes
eq("parseRanges 1-3, 5, 7 a 9", L.parseRanges("1-3, 5, 7 a 9"), [1, 2, 3, 5, 7, 8, 9]);
eq("parseRanges limita a 999", L.parseRanges("990-1005").every((n) => n <= 999), true);
eq("formatRanges", L.formatRanges([1, 2, 3, 5, 7, 8, 9]), "1–3, 5, 7–9");
eq("missingVolumes", L.missingVolumes([1, 2, 3, 5], 8), [4, 6, 7, 8]);
eq("missingVolumes sem total", L.missingVolumes([1, 2], null), []);
eq("ownedWithinTotal", L.ownedWithinTotal([5, 1, 200, 3], 10), [1, 3, 5]);
eq("ownedWithinTotal sem total", L.ownedWithinTotal([5, 1], null), [1, 5]);
eq("normalizeTitle tira acento, caixa e pontuação", L.normalizeTitle("  A Seleção — Vol. 1!"), "a selecao vol 1");
eq("editionLabel não repete o título", L.editionLabel({ name: "One Piece", publisher: "Panini" }, "One Piece"), "Panini");
eq("editionLabel de edição diferente", L.editionLabel({ name: "Naruto Gold", publisher: "Panini" }, "Naruto"), "Naruto Gold, Panini");

// séries de livros
const mk = (id, title, series, num, total, owned = [1]) => ({
  id,
  created_at: "2026-01-01",
  notes: null,
  owned,
  edition: {
    id: "e" + id,
    work_id: "w" + id,
    name: "Edição",
    publisher: null,
    total_volumes: 1,
    is_finished: true,
    series_name: series,
    series_number: num,
    series_total: total,
    work: { id: "w" + id, kind: "book", title, original_title: null, authors: [], cover_url: null, original_volumes: null, anilist_id: null, google_books_id: null },
  },
});
const items = [mk("1", "A Elite", "A Seleção", 2, 5), mk("2", "A Seleção", " a seleção ", 1, null), mk("3", "Solto", null, null, null), mk("4", "Harry", "Harry Potter", 3, 7)];
const groups = L.groupBookSeries(items);
eq("agrupa por nome sem diferenciar caixa nem espaços", groups.map((g) => g.books.length), [2, 1]);
eq("nome: empate vale o do livro nº 1", groups[0].name, "a seleção");
eq("nome: a grafia mais usada vence", L.groupBookSeries([mk("a", "X", " a seleção ", 1, null), mk("b", "Y", "A Seleção", 2, null), mk("c", "Z", "A Seleção", 3, null)])[0].name, "A Seleção");
eq("livros em ordem de número", groups[0].books.map((b) => b.edition.series_number), [1, 2]);
eq("total = maior entre o informado, o maior número e a quantidade", [groups[0].total, groups[0].declaredTotal, groups[1].total], [5, 5, 7]);
eq("livros que a pessoa tem", groups[0].owned, [1, 2]);
eq("sem série não agrupa", L.groupBookSeries([mk("9", "Solto", null, null, null)]), []);
eq("livro sem número vai por último", L.groupBookSeries([mk("a", "X", "S", null, null), mk("b", "Y", "S", 1, null)])[0].books.map((b) => b.id), ["b", "a"]);

// foto: junta lombadas da mesma série
eq(
  "groupSpines junta a mesma série e fica com a pior confiança",
  L.groupSpines([
    { title: "Naruto", volume: 1, confidence: "alta" },
    { title: "naruto", volume: 2, confidence: "media" },
    { title: "Bleach", volume: null, confidence: "baixa" },
  ]).map((s) => [s.title, s.owned, s.confidence]),
  [["Naruto", [1, 2], "media"], ["Bleach", [], "baixa"]],
);

// estante
eq("seriesUnits (2–4 volumes: 1; até 40: 2; mais: 4)", [1, 2, 4, 5, 40, 41, 110].map(L.seriesUnits), [2, 1, 1, 2, 2, 4, 4]);
const single = mk("s", "x", null, null, null);
const multi = { ...single, edition: { ...single.edition, total_volumes: 3 } };
eq("isStandalone: total 1 é avulso, 3 não", [L.isStandalone(single), L.isStandalone(multi)], [true, false]);
const packed = L.packShelf([2, 2, 1, 4, 1, 2], (u) => u, 6, {});
let sum = 0;
let rowsClosed = true;
for (const cell of packed.placed) {
  sum += cell.span;
  if (sum > 6) rowsClosed = false;
  if (sum === 6) sum = 0;
}
eq("packShelf: nenhuma linha passa de 6 meias-colunas e todas fecham", rowsClosed && sum === 0, true);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
