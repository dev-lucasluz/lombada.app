import { useQuery } from "@tanstack/react-query";
import { listCollection } from "../lib/db";

export type SeriesForm = { inSeries: boolean; name: string; number: string; total: string };

export const EMPTY_SERIES: SeriesForm = { inSeries: false, name: "", number: "", total: "" };

/** Campos de série gravados na edição (null quando o livro não faz parte de uma série). */
export function seriesPatch(form: SeriesForm) {
  if (!form.inSeries || !form.name.trim()) return { series_name: null, series_number: null, series_total: null };
  return {
    series_name: form.name.trim().slice(0, 120),
    series_number: form.number ? Number(form.number) : null,
    series_total: form.total ? Number(form.total) : null,
  };
}

/** "Esse livro faz parte de uma série?" — para livros com títulos diferentes (A Seleção, A Elite…). */
export function SeriesFields({ value, onChange, idPrefix }: { value: SeriesForm; onChange: (v: SeriesForm) => void; idPrefix: string }) {
  const collection = useQuery({ queryKey: ["collection"], queryFn: listCollection });
  const names = [...new Set((collection.data ?? []).map((c) => c.edition.series_name?.trim()).filter((n): n is string => !!n))];
  const set = (patch: Partial<SeriesForm>) => onChange({ ...value, ...patch });

  return (
    <div className="series-fields">
      <label className="check-row">
        <input type="checkbox" checked={value.inSeries} onChange={(e) => set({ inSeries: e.target.checked })} />
        <span>
          Esse livro faz parte de uma série
          <small className="hint"> Para livros com títulos diferentes, como A Seleção, A Elite e A Escolhida: eles ficam juntos na estante.</small>
        </span>
      </label>
      {value.inSeries && (
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor={`${idPrefix}-sname`}>Nome da série</label>
            <input
              id={`${idPrefix}-sname`}
              className="input"
              list={`${idPrefix}-snames`}
              maxLength={120}
              required
              placeholder="Ex.: A Seleção"
              value={value.name}
              onChange={(e) => set({ name: e.target.value })}
            />
            <datalist id={`${idPrefix}-snames`}>
              {names.map((n) => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-snum`}>É o livro nº</label>
            <input id={`${idPrefix}-snum`} className="input" type="number" min={1} max={999} inputMode="numeric" required value={value.number} onChange={(e) => set({ number: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-stotal`}>Livros na série (opcional)</label>
            <input id={`${idPrefix}-stotal`} className="input" type="number" min={1} max={999} inputMode="numeric" placeholder="Ex.: 5" value={value.total} onChange={(e) => set({ total: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  );
}
