/** Map markers as DOM buttons: people (numbered), the 要 seal, and the other stations. */
import { Marker } from "maplibre-gl";
import { SPLAT } from "../model/stamp";
import type { MapPerson, MapStation } from "./types";

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

function button(className: string, label: string, onTap: () => void): HTMLButtonElement {
  const b = node("button", className);
  b.type = "button";
  b.setAttribute("aria-label", label);
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onTap();
  });
  return b;
}

/** The badge sits on the station; the name and minutes hang to its right. */
export function personMarker(p: MapPerson, minutes: string, label: string, onTap: () => void): { marker: Marker; el: HTMLElement } {
  const el = button("mk-person", label, onTap);
  el.dataset.marker = p.id;
  const tag = node("span", "mk-label", `${p.label} `);
  tag.append(node("small", "", minutes));
  el.append(node("span", "mk-badge", String(p.number)), tag);
  return { marker: new Marker({ element: el }).setLngLat([...p.start]), el };
}

/** The ink that flies when the seal hits the paper; theme.css moves each dot by its --dx and --dy. */
function splat(): HTMLElement {
  const box = node("span", "seal-splat");
  box.setAttribute("aria-hidden", "true");
  for (const d of SPLAT) {
    const dot = node("i", "");
    dot.style.setProperty("--dx", `${d.dx}px`);
    dot.style.setProperty("--dy", `${d.dy}px`);
    dot.style.setProperty("--s", `${d.size}px`);
    box.append(dot);
  }
  return box;
}

/** `waiting`: the seal stays hidden until the lines arrive, then stamps. */
export function sealMarker(meet: MapStation, label: string, waiting: boolean, onTap: () => void): { marker: Marker; seal: HTMLElement } {
  const el = button("mk-meet", label, onTap);
  const seal = node("span", waiting ? "seal wait" : "seal", "要");
  el.append(seal, splat(), node("span", "mk-name", meet.name));
  return { marker: new Marker({ element: el }).setLngLat([...meet.at]), seal };
}

/** A 44 px button around a small numbered square. */
export function stationMarker(s: MapStation, label: string, onTap: () => void): { marker: Marker; el: HTMLElement } {
  const el = button("mk-cand", label, onTap);
  el.append(node("span", "mk-cand-box", String(s.rank)));
  return { marker: new Marker({ element: el }).setLngLat([...s.at]), el };
}
