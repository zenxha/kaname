import type { MatrixData } from "../../core/data";
import type { RouteHop } from "../../core/routes";
import type { PersonResult } from "../../core/types";
import { t, type Lang } from "../model/i18n";
import { railwayName, stationById, stationName } from "../model/names";
import type { PersonSummary } from "../model/summary";

interface Props {
  readonly data: MatrixData;
  readonly lang: Lang;
  readonly index: number;
  readonly color: string;
  readonly label: string;
  readonly meet: string;
  readonly result: PersonResult | undefined;
  readonly summary: PersonSummary | undefined;
  readonly outHops: readonly RouteHop[];
  readonly homeHops: readonly RouteHop[];
  readonly maxTotal: number;
  readonly onEdit: () => void;
}

function lines(data: MatrixData, hops: readonly RouteHop[], lang: Lang): string {
  return [...new Set(hops.map((h) => railwayName(data, h.railway, lang)))].join(" / ");
}

export function PersonCard({ data, lang, index, color, label, meet, result, summary, outHops, homeHops, maxTotal, onEdit }: Props) {
  const from = result ? stationName(stationById(data, result.startStation), lang) : "—";
  const home = result ? stationName(stationById(data, result.homeStation), lang) : "—";
  const scale = (n: number) => `${Math.max(0, (n / Math.max(maxTotal, 1)) * 100)}%`;
  return (
    <button type="button" className="person" onClick={onEdit} aria-label={t(lang, "editPerson", { who: label })}>
      <span className="person-head">
        <span className="dot" style={{ background: color }} aria-hidden="true">{index + 1}</span>
        <span className="person-name">{label}</span>
        {summary?.tight && summary.spare !== null ? (
          <span className="badge">{t(lang, "tight", { n: summary.spare })}</span>
        ) : (
          <span className="person-total">{summary ? t(lang, "minutes", { n: summary.total }) : "—"}</span>
        )}
      </span>
      {result && (
        <span className="person-body">
          <span className="person-path">{from} → <b>{meet}</b> → {home}</span>
          <span className="person-bar" aria-hidden="true">
            <span style={{ width: scale(result.outMinutes), background: color }} />
            <span style={{ width: scale(result.homeMinutes), background: color, opacity: 0.4 }} />
          </span>
          <span className="person-legs">
            {t(lang, "minutes", { n: result.outMinutes })} {lines(data, outHops, lang)}
            {result.homeMinutes > 0 && <> · {t(lang, "minutes", { n: result.homeMinutes })} {lines(data, homeHops, lang)}</>}
          </span>
        </span>
      )}
    </button>
  );
}
