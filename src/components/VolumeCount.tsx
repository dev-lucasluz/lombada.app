import "./VolumeCount.css";

/**
 * Etiqueta "tenho / total" ao lado do nome da série. Completa fica em amarelo;
 * sem total informado mostra só quantos volumes a pessoa tem.
 */
export function VolumeCount({ owned, total }: { owned: number; total: number | null }) {
  const complete = total !== null && total > 0 && owned >= total;
  const label = total ? `${owned} de ${total} volumes${complete ? ", coleção completa" : ""}` : `${owned} volumes`;
  return (
    <span className={complete ? "volume-count is-complete" : "volume-count"} title={label} aria-label={label}>
      <span className="num">{owned}</span>
      {total ? <span className="volume-count-total">/ {total}</span> : <span className="volume-count-total">vol.</span>}
    </span>
  );
}
