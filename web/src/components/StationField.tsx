import { useDeferredValue, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type { MatrixData, StationRecord } from "../../core/data";
import { useAddresses } from "../data/addresses";
import { looksLikeAddress, MAX_QUERY, searchAddresses, type Town } from "../model/address";
import { t, type Lang } from "../model/i18n";
import type { Place } from "../model/scenario";
import { searchStations } from "../model/search";
import { useStationSearch } from "./searchContext";

interface Props {
  readonly data: MatrixData;
  readonly lang: Lang;
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly onPick: (place: Place) => void;
  /** A button at the end of the field, such as "use my location". */
  readonly trailing?: ReactNode;
}

type Option = { readonly kind: "station"; readonly station: StationRecord } | { readonly kind: "address"; readonly town: Town };

const STATIONS_SHOWN = 6;
const ADDRESSES_SHOWN = 4;

function toPlace(o: Option): Place {
  if (o.kind === "station") return { station: o.station.id };
  return { lng: o.town.at[0], lat: o.town.at[1], address: `${o.town.city}${o.town.name}` };
}

/**
 * Combobox: type a station (Japanese, English or kana) or an address, and pick it from the list.
 * Stations come first; addresses follow in their own group once the address index has loaded.
 */
export function StationField({ data, lang, label, value, placeholder, onPick, trailing }: Props) {
  const id = useId();
  const { kana, base } = useStationSearch();
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  // The list follows the typing a moment behind, so a slow phone never drops a keystroke.
  const shown = useDeferredValue(query);
  const wantsAddress = shown !== null && looksLikeAddress(shown);
  const addresses = useAddresses(base, wantsAddress);
  const options = useMemo<Option[]>(() => {
    if (!shown) return [];
    const stations = searchStations(data, shown, STATIONS_SHOWN, kana).map((station): Option => ({ kind: "station", station }));
    const towns = addresses.status === "ready" ? searchAddresses(addresses.index, shown, ADDRESSES_SHOWN) : [];
    return [...stations, ...towns.map((town): Option => ({ kind: "address", town }))];
  }, [data, kana, shown, addresses]);
  const open = query !== null && options.length > 0;
  const groups = [
    { key: "stations", label: t(lang, "stations"), start: 0, options: options.filter((o) => o.kind === "station") },
    { key: "addresses", label: t(lang, "addresses"), start: options.findIndex((o) => o.kind === "address"), options: options.filter((o) => o.kind === "address") },
  ].filter((g) => g.options.length > 0)
    // Addresses always say what they are; stations need a heading only when addresses follow.
    .map((g, _, all) => ({ ...g, labelled: g.key === "addresses" || all.length > 1 }));

  const pick = (i: number) => {
    const o = options[i];
    if (o === undefined) return;
    onPick(toPlace(o));
    setQuery(null);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter also confirms a Japanese IME conversion; that must not pick a station.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      setQuery(query ?? value);
      setActive(0);
    } else if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape") {
      setQuery(null);
    }
  };

  return (
    <div className="field">
      <div className="combo">
        <div className="inline-input">
          <label htmlFor={id} className="prefix">{label}</label>
          <input
            id={id}
            className="bare"
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? `${id}-list` : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open ? `${id}-${active}` : undefined}
            autoComplete="off"
            maxLength={MAX_QUERY}
            placeholder={placeholder}
            value={query ?? value}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            onBlur={() => setQuery(null)}
          />
          {trailing}
        </div>
        {open && (
          <div className="options" role="listbox" id={`${id}-list`} aria-label={label}>
            {groups.map((g) => (
              <ul key={g.key} role="group" aria-labelledby={g.labelled ? `${id}-${g.key}` : undefined}>
                {g.labelled && <li role="presentation" className="group-label" id={`${id}-${g.key}`}>{g.label}</li>}
                {g.options.map((o, j) => {
                  const i = g.start + j;
                  return (
                    <li
                      key={o.kind === "station" ? o.station.id : `${o.town.city}${o.town.name}`}
                      id={`${id}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(i);
                      }}
                    >
                      {o.kind === "station" ? (
                        <>
                          <span>{lang === "ja" ? o.station.ja : o.station.en}</span>
                          <small>{lang === "ja" ? o.station.en : o.station.ja}</small>
                        </>
                      ) : (
                        <>
                          <span>{o.town.name}</span>
                          <small>{o.town.city}</small>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
        )}
      </div>
      {wantsAddress && addresses.status === "error" && <p className="snap" role="status">{t(lang, "addressesFailed")}</p>}
    </div>
  );
}
