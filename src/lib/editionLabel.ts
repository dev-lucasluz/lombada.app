/**
 * Texto de apoio da edição, sem repetir o título da obra:
 * "One Piece" + edição "One Piece, Panini" → "Panini";
 * "Naruto" + edição "Naruto Gold, Panini" → "Naruto Gold, Panini".
 */
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export function editionLabel(edition: { name: string; publisher: string | null }, workTitle: string): string | null {
  const parts: string[] = [];
  if (norm(edition.name) !== norm(workTitle)) parts.push(edition.name);
  if (edition.publisher) parts.push(edition.publisher);
  return parts.length ? parts.join(", ") : null;
}
