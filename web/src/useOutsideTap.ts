/** A tap or click outside an element, such as a tap beside the person editor to close it. */
import { useEffect, useRef, type RefObject } from "react";

/** A press that moves more than this many pixels before it ends is a drag (a map pan, a scroll), not a tap. */
const TAP_SLOP = 8;

export function useOutsideTap(ref: RefObject<HTMLElement | null>, onOutside: () => void): void {
  const latest = useRef(onOutside);
  useEffect(() => {
    latest.current = onOutside;
  });
  useEffect(() => {
    // Decided when the press starts, while the pressed element still exists. A pick from the station list
    // removes the list before the press ends, and some browsers then send the click to an element outside
    // the editor. Acted on at the click, after the browser chose its target, so the closing editor does
    // not move what the tap lands on.
    let start: { x: number; y: number } | null = null;
    const outside = (target: EventTarget | null) => target instanceof Node && ref.current !== null && !ref.current.contains(target);
    const down = (e: PointerEvent) => {
      start = outside(e.target) ? { x: e.clientX, y: e.clientY } : null;
    };
    const click = (e: MouseEvent) => {
      const tap = start !== null && Math.hypot(e.clientX - start.x, e.clientY - start.y) <= TAP_SLOP;
      start = null;
      if (tap && outside(e.target)) latest.current();
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("click", click, true);
    };
  }, [ref]);
}
