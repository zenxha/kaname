/** Small line icons, drawn here so the app needs no icon library. They take the text color. */
import type { ReactNode } from "react";

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Icon({ children }: { readonly children: ReactNode }) {
  return <svg className="icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">{children}</svg>;
}

export function PencilIcon() {
  return <Icon><path {...STROKE} d="M4 16l.9-3.6 8.6-8.6a1.9 1.9 0 0 1 2.7 2.7l-8.6 8.6L4 16zM12.3 5l2.7 2.7" /></Icon>;
}

export function CheckIcon() {
  return <Icon><path {...STROKE} strokeWidth={2.1} d="M4.5 10.5l3.6 3.6 7.4-8" /></Icon>;
}

export function TrashIcon() {
  return <Icon><path {...STROKE} d="M3.8 5.8h12.4M8 5.8V4h4v1.8M5.6 5.8l.8 10.4h7.2l.8-10.4M8.6 9v4.4M11.4 9v4.4" /></Icon>;
}

export function LocateIcon() {
  return (
    <Icon>
      <circle {...STROKE} cx="10" cy="10" r="4.6" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" />
      <path {...STROKE} d="M10 2.4v2.8M10 14.8v2.8M2.4 10h2.8M14.8 10h2.8" />
    </Icon>
  );
}
