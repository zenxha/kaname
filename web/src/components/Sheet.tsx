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
  readonly children: ReactNode;
}

/** A drag shorter than this is a tap on the handle. */
const TAP_PX = 6;

export function Sheet({ stacked, snap, viewport, onSnap, label, moreLabel, lessLabel, children }: Props) {
  const [dragged, setDragged] = useState<number | null>(null);
  const start = useRef<{ readonly y: number; readonly visible: number; moved: boolean } | null>(null);
  if (!stacked) return <aside className="panel" aria-label={label}>{children}</aside>;

  const height = viewport - FULL_GAP_PX;
  const visible = dragged ?? visibleHeight(snap, viewport);
  const clamp = (v: number) => Math.min(height, Math.max(Math.min(PEEK_PX, viewport / 2), v));
  const end = () => {
    const s = start.current;
    start.current = null;
    setDragged(null);
    if (s === null) return;
    onSnap(s.moved ? nearestSnap(visible, viewport) : nextSnap(snap));
  };

  return (
    <section className={dragged === null ? "sheet" : "sheet dragging"} data-snap={snap} aria-label={label}
      style={{ height, transform: `translateY(${height - visible}px)` }}>
      <button type="button" className="grab" aria-label={snap === "full" ? lessLabel : moreLabel}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = { y: e.clientY, visible, moved: false };
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (s === null) return;
          const dy = e.clientY - s.y;
          if (Math.abs(dy) > TAP_PX) s.moved = true;
          if (s.moved) setDragged(clamp(s.visible - dy));
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSnap(nextSnap(snap));
          }
        }} />
      <div className="sheet-body">{children}</div>
    </section>
  );
}
