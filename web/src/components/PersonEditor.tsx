import { useId, useState } from "react";
import type { MatrixData } from "../../core/data";
import type { Snap } from "../../core/types";
import { t, type Lang } from "../model/i18n";
import { placeName } from "../model/names";
import { MAX_NAME } from "../model/share";
import type { Person, Place } from "../model/scenario";
import { StationField } from "./StationField";

interface Props {
  readonly data: MatrixData;
  readonly lang: Lang;
  readonly person: Person;
  readonly index: number;
  readonly startSnap: Snap | undefined;
  readonly onChange: (change: Partial<Omit<Person, "id">>) => void;
  readonly onRemove: () => void;
  readonly onDone: () => void;
}

export function PersonEditor({ data, lang, person, index, startSnap, onChange, onRemove, onDone }: Props) {
  const nameId = useId();
  const [locError, setLocError] = useState(false);
  const here = startSnap ? `${t(lang, "useLocation")} · ${lang === "ja" ? startSnap.station.ja : startSnap.station.en}` : t(lang, "useLocation");
  const locate = () => {
    setLocError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => onChange({ start: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      () => setLocError(true),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };
  const station = (id: string): Place => ({ station: id });
  return (
    <section className="editor" aria-label={t(lang, "editPerson", { who: person.label || `#${index + 1}` })}>
      <div className="editor-head">
        <span className="badge" aria-hidden="true">{index + 1}</span>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={nameId}>{t(lang, "name")}</label>
          <input id={nameId} className="input" value={person.label} maxLength={MAX_NAME} autoFocus placeholder={t(lang, "namePlaceholder")}
            onChange={(e) => onChange({ label: e.target.value })} />
        </div>
      </div>
      <StationField
        data={data}
        lang={lang}
        label={t(lang, "from")}
        value={placeName(data, person.start, lang, here)}
        placeholder={t(lang, "searchPlaceholder")}
        onPick={(id) => onChange({ start: station(id) })}
      />
      {"geolocation" in navigator && (
        <button type="button" className="btn" onClick={locate}>{t(lang, "useLocation")}</button>
      )}
      {locError && <div className="snap" role="alert">{t(lang, "locationError")}</div>}
      {person.start !== null && "lat" in person.start && startSnap && (
        <div className="snap">→ {lang === "ja" ? startSnap.station.ja : startSnap.station.en} · {t(lang, "minutes", { n: startSnap.walkMinutes })}</div>
      )}
      <label className="check">
        <input type="checkbox" checked={person.home === null} onChange={(e) => onChange({ home: e.target.checked ? null : person.start })} />
        {t(lang, "homeSame")}
      </label>
      {person.home !== null && (
        <StationField
          data={data}
          lang={lang}
          label={t(lang, "home")}
          value={placeName(data, person.home, lang, here)}
          placeholder={t(lang, "searchPlaceholder")}
          onPick={(id) => onChange({ home: station(id) })}
        />
      )}
      <div className="row">
        <button type="button" className="btn primary" onClick={onDone}>{t(lang, "done")}</button>
        <button type="button" className="btn quiet" onClick={onRemove}>{t(lang, "remove")}</button>
      </div>
    </section>
  );
}
