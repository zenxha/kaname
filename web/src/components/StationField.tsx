import { useId, useMemo, useState, type KeyboardEvent } from "react";
import type { MatrixData } from "../../core/data";
import type { Lang } from "../model/i18n";
import { searchStations } from "../model/search";

interface Props {
  readonly data: MatrixData;
  readonly lang: Lang;
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly onPick: (stationId: string) => void;
}

/** Combobox: type a station in Japanese or English and pick it from the list. */
export function StationField({ data, lang, label, value, placeholder, onPick }: Props) {
  const id = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const options = useMemo(() => (query ? searchStations(data, query, 6) : []), [data, query]);
  const open = query !== null && options.length > 0;

  const pick = (i: number) => {
    const s = options[i];
    if (s === undefined) return;
    onPick(s.id);
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
          <ul className="options" role="listbox" id={`${id}-list`}>
            {options.map((s, i) => (
              <li
                key={s.id}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(i);
                }}
              >
                <span>{lang === "ja" ? s.ja : s.en}</span>
                <small>{lang === "ja" ? s.en : s.ja}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
