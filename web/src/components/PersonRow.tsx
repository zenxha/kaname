/** One person: number, name, minutes and the lines they ride. Tapped, it opens into their trip. */
import type { MatrixData } from "../../core/data";
import type { RouteHop } from "../../core/routes";
import { formatClock } from "../../core/time";
import type { PersonResult } from "../../core/types";
import { t, type Lang } from "../model/i18n";
import { lineChips, rideSteps, type RideStep } from "../model/itinerary";
import { railwayName, stationName } from "../model/names";
import { spareMinutes, TIGHT_MIN } from "../model/summary";

interface Props {
  readonly id: string;
  readonly data: MatrixData;
  readonly lang: Lang;
  readonly number: number;
  readonly label: string;
  readonly result: PersonResult | undefined;
  readonly hops: readonly RouteHop[];
  readonly meet: number;
  readonly meetingEnd: number | null;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onEdit: () => void;
}

function lineLong(data: MatrixData, railway: number, lang: Lang): string {
  const r = data.railways[railway];
  return r === undefined ? "" : lang === "ja" ? r.ja : r.en;
}

function stepText(data: MatrixData, s: RideStep, lang: Lang): string {
  const station = stationName(data.stations[s.station], lang);
  if (s.kind === "arrive") return t(lang, "stepArrive", { station });
  const line = lineLong(data, s.railway, lang);
  if (s.kind === "board") return t(lang, "stepBoard", { station, line });
  if (s.kind === "change") return t(lang, "stepChange", { station, line });
  if (s.kind === "stay") return t(lang, "stepStay", { station, line });
  return t(lang, "stepWalk", { from: stationName(data.stations[s.from], lang), station, line });
}

function Chip({ data, railway, lang }: { readonly data: MatrixData; readonly railway: number; readonly lang: Lang }) {
  const color = data.railways[railway]?.color ?? "#888888";
  return <span className="chip"><i style={{ background: color }} aria-hidden="true" />{railwayName(data, railway, lang)}</span>;
}

function LastTrain({ data, lang, result, meet, meetingEnd }: Pick<Props, "data" | "lang" | "meet" | "meetingEnd"> & { readonly result: PersonResult }) {
  if (result.lastDeparture === null || result.homeMinutes === 0) return null;
  const station = stationName(data.stations[meet], lang);
  const spare = spareMinutes(result.lastDeparture, meetingEnd);
  const text = t(lang, "lastTrainHome", { station, time: formatClock(result.lastDeparture) });
  return (
    <p className={spare !== null && spare < TIGHT_MIN ? "last tight" : "last"}>
      {spare === null ? text : `${text} · ${t(lang, "spareAfterEnd", { n: spare })}`}
    </p>
  );
}

export function PersonRow({ id, data, lang, number, label, result, hops, meet, meetingEnd, open, onOpen, onEdit }: Props) {
  if (result === undefined) {
    return (
      <li className="prow">
        <button type="button" className="prow-main" data-person={id} onClick={onEdit} aria-label={t(lang, "editPerson", { who: label })}>
          <span className="badge" aria-hidden="true">{number}</span><span className="pname">{label}</span><span className="pmins">—</span>
        </button>
      </li>
    );
  }
  const minutes = result.homeMinutes > 0
    ? t(lang, "thereBack", { out: result.outMinutes, back: result.homeMinutes })
    : t(lang, "thereOnly", { out: result.outMinutes });
  const elsewhere = result.homeStation !== result.startStation;
  const steps = rideSteps(data, hops);
  return (
    <li className={open ? "prow open" : "prow"}>
      <button type="button" className="prow-main" data-person={id} aria-expanded={open} onClick={onOpen}>
        <span className="badge" aria-hidden="true">{number}</span>
        <span className="pname">{label}</span>
        <span className="pmins">{minutes}</span>
        <span className="chips">
          {lineChips(data, hops).map((r, i) => <Chip key={`${r}-${i}`} data={data} railway={r} lang={lang} />)}
          {elsewhere && <span className="phome">{t(lang, "homeTo", { station: stationName(data.stations[data.byId.get(result.homeStation) ?? -1], lang) })}</span>}
        </span>
      </button>
      {open && (
        <div className="pdetail">
          <ol className="itin">
            {steps.length === 0
              ? <li>{t(lang, "alreadyThere", { station: stationName(data.stations[meet], lang) })}</li>
              : steps.map((s, i) => <li key={i}>{stepText(data, s, lang)}</li>)}
          </ol>
          <LastTrain data={data} lang={lang} result={result} meet={meet} meetingEnd={meetingEnd} />
          <button type="button" className="btn" onClick={onEdit}>{t(lang, "editPerson", { who: label })}</button>
        </div>
      )}
    </li>
  );
}
