import { useId, useMemo, useState, type KeyboardEvent } from "react";
import type { MatrixData, StationRecord } from "../../core/data";
import { useAddresses } from "../data/addresses";
import { looksLikeAddress, searchAddresses, type Town } from "../model/address";
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
export function StationField({ data, lang, label, value, placeholder, onPick }: Props) {
  const id = useId();
  const { kana, base } = useStationSearch();
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const addresses = useAddresses(base, query !== null && looksLikeAddress(query));
  const options = useMemo<Option[]>(() => {
    if (!query) return [];
    const stations = searchStations(data, query, STATIONS_SHOWN, kana).map((station): Option => ({ kind: "station", station }));
    const towns = addresses.status === "ready" ? searchAddresses(addresses.index, query, ADDRESSES_SHOWN) : [];
    return [...stations, ...towns.map((town): Option => ({ kind: "address", town }))];
  }, [data, kana, query, addresses]);
  const open = query !== null && options.length > 0;
  const firstAddress = options.findIndex((o) => o.kind === "address");

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
      <label htmlFor={id}>{label}</label>
      <div className="combo">
        <input
          id={id}
          className="input"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? `${id}-list` : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${id}-${active}` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={query ?? value}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          onBlur={() => setQuery(null)}
        />
        {open && (
          <ul className="options" role="listbox" id={`${id}-list`} aria-label={label}>
            {options.map((o, i) => (
              <li
                key={o.kind === "station" ? o.station.id : `${o.town.city}${o.town.name}`}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === firstAddress ? `${o.kind} first-address` : o.kind}
                data-group={i === firstAddress ? t(lang, "addresses") : undefined}
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
