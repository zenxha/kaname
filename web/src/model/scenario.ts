/** The group being planned, as the UI edits it. Every update returns a new array. */
import { MAX_LABEL_LENGTH, MAX_PARTICIPANTS } from "../../core/participants";
import type { LocationInput, ParticipantInput } from "../../core/types";

/** A station, or a point: a location from the phone, or an address with the text the person picked. */
export type Place = { readonly station: string } | { readonly lat: number; readonly lng: number; readonly address?: string };

/** What the engine takes: the station, or the point without its address text. */
function toLocation(p: Place): LocationInput {
  return "station" in p ? { station: p.station } : { lat: p.lat, lng: p.lng };
}

export interface Person {
  readonly id: string;
  readonly label: string;
  readonly start: Place | null;
  /** null: home is the start */
  readonly home: Place | null;
}

/**
 * The example group the app opens with. Each lives at that station in their story: Shizuku (Whisper of
 * the Heart) at 聖蹟桜ヶ丘, Tora-san (Otoko wa Tsurai yo) at 柴又. They meet at 神保町, the book town.
 */
export const DEFAULT_PEOPLE: readonly Person[] = [
  { id: "p1", label: "Shizuku", start: { station: "seiseki-sakuragaoka" }, home: null },
  { id: "p2", label: "Tora", start: { station: "shibamata" }, home: null },
];

/** True while the group is still the untouched example. */
export function isExample(people: readonly Person[]): boolean {
  return people === DEFAULT_PEOPLE;
}

function nextId(people: readonly Person[]): string {
  const max = people.reduce((m, p) => Math.max(m, Number(p.id.replace(/^p/, "")) || 0), 0);
  return `p${max + 1}`;
}

/** The engine plans at most MAX_PARTICIPANTS people, so the list stops there. */
export function canAddPerson(people: readonly Person[]): boolean {
  return people.length < MAX_PARTICIPANTS;
}

export function addPerson(people: readonly Person[], label: string): Person[] {
  return [...people, { id: nextId(people), label, start: null, home: null }];
}

export function updatePerson(people: readonly Person[], id: string, change: Partial<Omit<Person, "id">>): Person[] {
  return people.map((p) => (p.id === id ? { ...p, ...change } : p));
}

export function removePerson(people: readonly Person[], id: string): Person[] {
  return people.filter((p) => p.id !== id);
}

/** The name as typed, trimmed. A name of only spaces or invisible characters counts as no name. */
export function visibleName(label: string): string {
  return label.replace(/[\s\p{Cf}]/gu, "") === "" ? "" : label.trim();
}

/** `base` and then `suffix`, with `base` cut so the whole fits the engine's label limit. */
function fitLabel(base: string, suffix: string): string {
  const chars = Array.from(base);
  while (chars.join("").length + suffix.length > MAX_LABEL_LENGTH) chars.pop();
  return `${chars.join("")}${suffix}`;
}

/**
 * The engine needs a different label for each person. Two friends can share a name, so a repeated
 * name gets the person's number in the list: Aki and Aki (3).
 */
function uniqueLabel(label: string, n: number, taken: ReadonlySet<string>): string {
  if (!taken.has(label)) return label;
  const numbered = fitLabel(label, ` (${n})`);
  if (!taken.has(numbered)) return numbered;
  let k = 2;
  while (taken.has(fitLabel(label, ` (${n}) ${k}`))) k++;
  return fitLabel(label, ` (${n}) ${k}`);
}

/** People with a start become engine participants; an unnamed person is named by their number. */
export function toParticipants(people: readonly Person[], unnamed: (n: number) => string = (n) => `#${n}`): ParticipantInput[] {
  type Step = { readonly taken: ReadonlySet<string>; readonly out: readonly ParticipantInput[] };
  const step = (acc: Step, p: Person, i: number): Step => {
    if (p.start === null) return acc;
    const label = uniqueLabel(visibleName(p.label) || unnamed(i + 1), i + 1, acc.taken);
    const start = toLocation(p.start);
    const participant: ParticipantInput = p.home === null ? { label, start } : { label, start, home: toLocation(p.home) };
    return { taken: new Set([...acc.taken, label]), out: [...acc.out, participant] };
  };
  return [...people.reduce(step, { taken: new Set<string>(), out: [] }).out];
}
