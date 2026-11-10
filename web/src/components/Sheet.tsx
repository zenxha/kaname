/** On a phone, the result slides up over the map and rests at peek, half or full. On a desktop it is a side panel. */
import { useRef, useState, type ReactNode } from "react";
import { FULL_GAP_PX, nearestSnap, nextSnap, PEEK_PX, visibleHeight, type Snap } from "../model/sheet";

interface Props {
  readonly stacked: boolean;
  readonly snap: Snap;
  readonly viewport: number;
  readonly onSnap: (snap: Snap) => void;
  readonly label: string;
  readonly moreLabel: string;
  readonly lessLabel: string;
  /** What a peeking sheet shows: the answer. */
  readonly head: ReactNode;
  /** The rest, out of reach (and out of the tab order) while the sheet peeks. */
  readonly children: ReactNode;
  /** Rides on the sheet's top edge (Mu, the cat); a full sheet hides it. */
  readonly mascot?: ReactNode;
}

/** A drag shorter than this is a tap on the handle. */
const TAP_PX = 6;

interface Drag {
  readonly y: number;
  readonly from: number;
  moved: boolean;
  /** The latest height, so a fast flick settles from where the finger let go. */
  at: number;
}

export function Sheet({ stacked, snap, viewport, onSnap, label, moreLabel, lessLabel, head, children, mascot }: Props) {
  const [dragged, setDragged] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  if (!stacked) return <aside className="panel" aria-label={label}>{head}{children}</aside>;

  const height = viewport - FULL_GAP_PX;
  const visible = dragged ?? visibleHeight(snap, viewport);
  const clamp = (v: number) => Math.min(height, Math.max(Math.min(PEEK_PX, viewport / 2), v));
  const end = () => {
    const d = drag.current;
    drag.current = null;
    setDragged(null);
    if (d !== null) onSnap(d.moved ? nearestSnap(d.at, viewport) : nextSnap(snap));
  };

  return (
    <section className={dragged === null ? "sheet" : "sheet dragging"} data-snap={snap} aria-label={label}
      style={{ height, transform: `translateY(${height - visible}px)` }}>
      {mascot}
      <button type="button" className="grab" aria-label={snap === "full" ? lessLabel : moreLabel}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, from: visible, moved: false, at: visible };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d === null) return;
          const dy = e.clientY - d.y;
          if (Math.abs(dy) > TAP_PX) d.moved = true;
          if (!d.moved) return;
          d.at = clamp(d.from - dy);
          setDragged(d.at);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onClick={(e) => {
          // A keyboard or a screen reader clicks without pointer events (detail 0); pointers are handled above.
          if (e.detail === 0) onSnap(nextSnap(snap));
        }} />
      <div className="sheet-body" style={{ paddingBottom: `calc(${height - visible}px + 24px + env(safe-area-inset-bottom, 0px))` }}>
        {head}
        <div className="sheet-rest" inert={snap === "peek"}>{children}</div>
      </div>
    </section>
  );
}
