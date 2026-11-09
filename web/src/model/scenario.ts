/** The group being planned, as the UI edits it. Every update returns a new array. */
import type { LocationInput, ParticipantInput } from "../../core/types";

export type Place = LocationInput;

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

export function addPerson(people: readonly Person[], label: string): Person[] {
  return [...people, { id: nextId(people), label, start: null, home: null }];
}

export function updatePerson(people: readonly Person[], id: string, change: Partial<Omit<Person, "id">>): Person[] {
  return people.map((p) => (p.id === id ? { ...p, ...change } : p));
}

export function removePerson(people: readonly Person[], id: string): Person[] {
  return people.filter((p) => p.id !== id);
}

/** People with a start become engine participants; an unnamed person is named by their number. */
export function toParticipants(people: readonly Person[], unnamed: (n: number) => string = (n) => `#${n}`): ParticipantInput[] {
  return people.flatMap((p, i): ParticipantInput[] => {
    if (p.start === null) return [];
    const label = p.label.trim() || unnamed(i + 1);
    return [p.home === null ? { label, start: p.start } : { label, start: p.start, home: p.home }];
  });
}
