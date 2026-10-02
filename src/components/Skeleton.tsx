import "./Skeleton.css";

/** Blocos cinza no formato do conteúdo que vai chegar (no lugar de "Carregando…"). */
export function Skeleton({ rows = 3, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="skeleton" role="status" aria-label="Carregando">
      {title && <span className="skeleton-title" />}
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skeleton-row" />
      ))}
    </div>
  );
}
