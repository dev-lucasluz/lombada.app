/** Agrupa números em faixas contínuas: [1,2,3,5,7,8] → "1–3, 5, 7–8" */
export function formatRanges(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start: number | null = null;
  let prev: number | null = null;

  for (const n of sorted) {
    if (start === null) {
      start = prev = n;
    } else if (n === prev! + 1) {
      prev = n;
    } else {
      parts.push(start === prev ? `${start}` : `${start}–${prev}`);
      start = prev = n;
    }
  }
  if (start !== null) parts.push(start === prev ? `${start}` : `${start}–${prev}`);
  return parts.join(", ");
}

/** Volumes que faltam para completar 1..total. Sem total conhecido, considera até o maior que a pessoa tem. */
export function missingVolumes(owned: number[], total: number | null): number[] {
  const set = new Set(owned);
  const limit = total ?? Math.max(0, ...owned);
  const missing: number[] = [];
  for (let n = 1; n <= limit; n++) if (!set.has(n)) missing.push(n);
  return missing;
}

/** Lê o que a pessoa digitou ("1-30, 45, 50 a 52") e devolve os números. Ignora trechos inválidos. */
export function parseRanges(text: string): number[] {
  const normalized = text
    .toLowerCase()
    .replace(/\s*(?:–|-|\bat[eé]\b|\ba\b)\s*/g, "-");
  const result: number[] = [];
  for (const part of normalized.split(/[,;\s]+/)) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m && Number(m[1]) <= 999 && Number(m[2]) <= 999) result.push(...between(Number(m[1]), Number(m[2])));
    else if (/^\d+$/.test(part)) result.push(Number(part));
  }
  return [...new Set(result)].filter((n) => n > 0 && n <= 999);
}

/** Todos os números entre a e b, inclusive, em qualquer ordem. */
export function between(a: number, b: number): number[] {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}
