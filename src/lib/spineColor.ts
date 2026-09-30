/**
 * Cor de lombada estável por edição: o mesmo título sempre gera a mesma cor,
 * então a prateleira fica colorida sem que ninguém precise escolher.
 * Saturação e luminosidade fixas garantem contraste com o número em branco.
 */
export function spineColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `oklch(0.52 0.13 ${hue})`;
}
