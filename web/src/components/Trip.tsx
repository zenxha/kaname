/**
 * A trip at two levels of detail, built from the same ride steps.
 * Pills (closed row): the lines in order; a through train joins two pills, a walk sits between them.
 * Rail (open row): one row per boarding, naming the station, any walk or through train, and the line.
 */
import type { CSSProperties } from "react";
import type { MatrixData } from "../../core/data";
import { textOn } from "../model/color";
import { t, type Lang } from "../model/i18n";
import { rides, type Ride, type RideStep } from "../model/itinerary";
import { railwayName, stationName } from "../model/names";

interface Props {
  readonly data: MatrixData;
  readonly lang: Lang;
  readonly steps: readonly RideStep[];
}

function WalkIcon() {
  return (
    <svg className="walk-icon" viewBox="0 0 10 14" aria-hidden="true">
      <circle cx="5.5" cy="1.8" r="1.6" />
      <path d="M5 4.2 3.6 8.4 1.4 13M5 4.2l1.6 4.2 2.2 1.6M4.2 6.8 6.6 13M3.6 6 1.6 7.8" fill="none" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const color = (data: MatrixData, railway: number) => data.railways[railway]?.color ?? "#888888";

function Joint({ ride, lang }: { readonly ride: Ride; readonly lang: Lang }) {
  if (ride.kind === "stay") return <span className="joint through"><span className="sr-only">{t(lang, "tagThrough")}</span></span>;
  if (ride.kind === "walk") return <span className="joint"><WalkIcon /><span className="sr-only">{t(lang, "tagWalk")}</span></span>;
  return <span className="joint" aria-hidden="true">›</span>;
}

export function TripPills({ data, lang, steps }: Props) {
  const all = rides(steps);
  return (
    <span className="pills">
      {all.map((r, i) => {
        const joinedRight = all[i + 1]?.kind === "stay";
        const c = color(data, r.railway);
        const cls = `pill${joinedRight ? " join-right" : ""}${r.kind === "stay" ? " join-left" : ""}`;
        return (
          <span key={i} className="pill-group">
            {i > 0 && <Joint ride={r} lang={lang} />}
            <span className={cls} style={{ background: c, color: textOn(c) }}>{railwayName(data, r.railway, lang)}</span>
          </span>
        );
      })}
    </span>
  );
}

function Where({ data, lang, step }: { readonly data: MatrixData; readonly lang: Lang; readonly step: Ride }) {
  const at = stationName(data.stations[step.station], lang);
  if (step.kind === "walk") {
    return (
      <span className="where">
        {stationName(data.stations[step.from], lang)} → {at}
        <span className="tag"><WalkIcon />{t(lang, "tagWalk")}</span>
      </span>
    );
  }
  const tag = step.kind === "stay" ? "tagThrough" : step.kind === "change" ? "tagChange" : null;
  return <span className="where">{at}{tag && <span className="tag">{t(lang, tag)}</span>}</span>;
}

export function TripRail({ data, lang, steps }: Props) {
  const end = steps.at(-1);
  return (
    <ol className="rail">
      {rides(steps).map((s, i) => {
        const c = color(data, s.railway);
        return (
          <li key={i} style={{ "--ride": c } as CSSProperties}>
            <span className={s.kind === "stay" ? "node through" : "node"} aria-hidden="true" />
            <Where data={data} lang={lang} step={s} />
            <span className="line"><i style={{ background: c }} aria-hidden="true" />{railwayName(data, s.railway, lang)}</span>
          </li>
        );
      })}
      {end?.kind === "arrive" && (
        <li className="arrive">
          <span className="node end" aria-hidden="true" />
          <span className="where"><b>{stationName(data.stations[end.station], lang)}</b></span>
          <span className="line">{t(lang, "tagArrive")}</span>
        </li>
      )}
    </ol>
  );
}
