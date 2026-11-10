/**
 * Mu, the conductor cat, drawn here so the app needs no image file. Mu peeks over an edge (the top of
 * the sheet on a phone, the bottom of the screen on a desktop), so the picture stops just under the
 * paws. Mu is decoration: hidden from screen readers, and every tap goes through to the map.
 */
import type { Mood } from "../model/mascot";

const FUR = "#f0b46a";
const FUR_LINE = "#d98d3c";
const CAP = "#1f3a5f";
const INK = "#23202a";
const STROKE = { fill: "none", stroke: INK, strokeLinecap: "round" } as const;

interface Props {
  readonly mood: Mood;
  /** What Mu says for a moment, or null. */
  readonly bubble: string | null;
  /** Over the sheet's top edge on a phone, or at the bottom of the screen on a desktop. */
  readonly where: "sheet" | "desk";
}

function Eyes({ mood }: { readonly mood: Mood }) {
  if (mood === "cheer") return <path {...STROKE} strokeWidth={4} d="M75 108 Q82 98 89 108 M111 108 Q118 98 125 108" />;
  if (mood === "sleepy") return <path {...STROKE} strokeWidth={3.5} d="M75 105 Q82 112 89 105 M111 105 Q118 112 125 105" />;
  const big = mood === "sweat";
  return (
    <g>
      <ellipse cx="82" cy="105" rx={big ? 6.5 : 5.5} ry={big ? 8 : 7.5} fill={INK} />
      <ellipse cx="118" cy="105" rx={big ? 6.5 : 5.5} ry={big ? 8 : 7.5} fill={INK} />
      <circle cx="80" cy="102" r="2" fill="#ffffff" />
      <circle cx="116" cy="102" r="2" fill="#ffffff" />
      {big && <path {...STROKE} strokeWidth={3} d="M71 90 L88 95 M129 90 L112 95" />}
    </g>
  );
}

function Mouth({ mood }: { readonly mood: Mood }) {
  if (mood === "cheer") return <path d="M91 126 Q100 140 109 126 Z" fill="#8a2b2b" />;
  if (mood === "sweat") return <path {...STROKE} strokeWidth={2.6} d="M90 131 Q95 127 100 131 Q105 135 110 131" />;
  if (mood === "sleepy") return <circle cx="100" cy="130" r="3.4" fill={INK} />;
  return <path {...STROKE} strokeWidth={2.6} d="M91 128 Q95.5 133 100 128 Q104.5 133 109 128" />;
}

export function Mascot({ mood, bubble, where }: Props) {
  const tilt = mood === "sleepy" ? -20 : -8;
  return (
    <div className={`mascot on-${where}`} data-mood={mood} aria-hidden="true">
      <svg viewBox="0 0 200 184" focusable="false">
        {mood === "cheer" && (
          <g>
            <path d="M34 48 Q34 58 44 58 Q34 58 34 68 Q34 58 24 58 Q34 58 34 48 Z" fill="#c8361d" />
            <path d="M168 42 Q168 50 176 50 Q168 50 168 58 Q168 50 160 50 Q168 50 168 42 Z" fill="#e2a72e" />
            <path d="M172 135 Q172 142 179 142 Q172 142 172 149 Q172 142 165 142 Q172 142 172 135 Z" fill="#c8361d" />
          </g>
        )}
        <path d="M60 200 C60 168 76 152 100 152 C124 152 140 168 140 200 Z" fill={CAP} />
        <path d="M84 153 Q100 176 116 153 Z" fill="#fde7c8" />
        {mood === "cheer" && (
          <g>
            <path {...STROKE} stroke={CAP} strokeWidth={15} d="M70 160 Q52 150 46 126 M130 160 Q148 150 154 126" />
            <circle cx="45" cy="118" r="10" fill={FUR} />
            <circle cx="155" cy="118" r="10" fill={FUR} />
          </g>
        )}
        <path d="M54 88 L58 38 L92 66 Z M146 88 L142 38 L108 66 Z" fill={FUR} />
        <path d="M61 79 L63 51 L82 66 Z M139 79 L137 51 L118 66 Z" fill="#f7b8b0" />
        <ellipse cx="100" cy="108" rx="56" ry="46" fill={FUR} />
        <path {...STROKE} stroke={FUR_LINE} strokeWidth={3} d="M92 68 L94 78 M100 66 L100 78 M108 68 L106 78" />
        <ellipse cx="100" cy="127" rx="22" ry="14" fill="#fde7c8" />
        <path d="M96 118 L104 118 L100 123 Z" fill="#e07a7a" />
        <path {...STROKE} stroke="#8a6a4a" strokeWidth={1.6} d="M78 124 L54 118 M78 129 L54 131 M122 124 L146 118 M122 129 L146 131" />
        <ellipse cx="70" cy="122" rx="8" ry="5" fill="#f59a9a" opacity="0.45" />
        <ellipse cx="130" cy="122" rx="8" ry="5" fill="#f59a9a" opacity="0.45" />
        <Eyes mood={mood} />
        <Mouth mood={mood} />
        <g transform={`rotate(${tilt} 100 56)`}>
          <path d="M76 62 C76 44 86 38 100 38 C114 38 124 44 124 62 Z" fill={CAP} />
          <rect x="76" y="55" width="48" height="8" fill="#c8361d" />
          <path d="M72 62 Q100 70 128 62 L127 67 Q100 76 73 67 Z" fill="#14263f" />
          <circle cx="100" cy="48" r="6.5" fill="#f2c94c" />
          <text x="100" y="51" fontSize="8" fontWeight="700" fill="#c8361d" textAnchor="middle" fontFamily="BIZ UDPGothic, sans-serif">要</text>
        </g>
        {mood === "peek" && (
          <g fill={FUR} stroke={FUR_LINE} strokeWidth={2}>
            <circle cx="68" cy="181" r="11" />
            <circle cx="132" cy="181" r="11" />
          </g>
        )}
        {mood === "sweat" && <path d="M154 72 Q163 88 154 95 Q145 88 154 72 Z" fill="#8fd0f5" stroke="#4aa3d8" strokeWidth={1.5} />}
        {mood === "sleepy" && (
          <g fontFamily="system-ui, sans-serif" fontWeight="700" fill="#5c6168">
            <text x="150" y="58" fontSize="22">Z</text>
            <text x="170" y="40" fontSize="15">z</text>
          </g>
        )}
      </svg>
      {bubble !== null && <span className="mascot-bubble">{bubble}</span>}
    </div>
  );
}
