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

/** The design's sample group: four people from the four corners of the network. */
export const DEFAULT_PEOPLE: readonly Person[] = [
  { id: "p1", label: "Aiko", start: { station: "omiya" }, home: { station: "kichijoji" } },
  { id: "p2", label: "Ben", start: { station: "yokohama" }, home: { station: "machida" } },
  { id: "p3", label: "Chie", start: { station: "chiba" }, home: { station: "kinshicho" } },
  { id: "p4", label: "Dai", start: { station: "tachikawa" }, home: { station: "ueno" } },
];

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

/** People with a start become engine participants; labels fall back to their number. */
export function toParticipants(people: readonly Person[]): ParticipantInput[] {
  return people.flatMap((p, i): ParticipantInput[] => {
    if (p.start === null) return [];
    const label = p.label.trim() || `#${i + 1}`;
    return [p.home === null ? { label, start: p.start } : { label, start: p.start, home: p.home }];
  });
}
