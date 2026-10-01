import type { CollectionItem } from "./db";

/**
 * Cores das lombadas. Cada volume tem uma cor diferente, como numa estante de
 * verdade: a série tem um tom de partida e cada volume gira 67° a partir dele,
 * então volumes vizinhos nunca repetem a cor e cada série tem uma combinação
 * própria. O tom de partida segue a ordem em que a série entrou na coleção
 * (ângulo áureo), para não mudar quando outras séries entram depois.
 */
const GOLDEN = 137.508;

/** Tom de partida da n-ésima série da coleção. */
export function seriesHueAt(index: number): number {
  return Math.round((index * GOLDEN + 25) % 360);
}

/** Mapa coleção → tom de partida, pela ordem de entrada (mais antiga primeiro). */
export function seriesHues(items: CollectionItem[]): Map<string, number> {
  const ordered = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return new Map(ordered.map((item, i) => [item.id, seriesHueAt(i)]));
}

/** Reserva para quando a coleção ainda não carregou: tom estável a partir do id. */
export function seriesHue(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return seriesHueAt(Math.abs(hash) % 997);
}

/** Cor do volume `n` (1, 2, 3...) de uma série com tom de partida `hue`. */
export function volumeColor(hue: number, n: number): string {
  const h = Math.round((hue + (n - 1) * 67) % 360);
  // pequena variação de claridade para parecer livros diferentes
  const l = [0.6, 0.55, 0.64, 0.58][n % 4];
  return `oklch(${l} 0.15 ${h})`;
}
