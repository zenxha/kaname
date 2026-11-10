/**
 * A shared plan link, read on the server the way the app opens it, and the words of its link preview.
 * Preview bots read the page without running the app, so the server finds the same station.
 */
import type { MatrixData } from "../core/data";
import { RankError } from "../core/errors";
import { formatClock } from "../core/time";
import { rank } from "../core/rank";
import type { CandidateResult } from "../core/types";
import { earliestLastTrain, plainSummary, tripMinutes } from "../src/model/compare";
import { t } from "../src/model/i18n";
import { toParticipants } from "../src/model/scenario";
import { decodePlan, encodePlan, peopleOf } from "../src/model/share";

/** Names listed in full; the rest are counted. */
const NAMED = 3;

/**
 * The station the app shows for this link: the one picked by hand (`at`) when it is in the list, else
 * the first. Null when the link has no plan the app can rank, such as one person or unknown stations.
 */
export function answerFor(data: MatrixData, search: string): CandidateResult | null {
  const { plan } = decodePlan(search, (id) => data.byId.has(id));
  if (plan === null) return null;
  const participants = toParticipants(peopleOf(plan), (n) => t("en", "personN", { n }));
  if (participants.length < 2) return null;
  try {
    const { candidates } = rank(participants, { alpha: plan.alpha }, data);
    return candidates.find((c) => c.station.id === plan.at) ?? candidates[0] ?? null;
  } catch (e) {
    if (e instanceof RankError) return null;
    throw e;
  }
}

/**
 * The plan as the app reads it, written back as a link: unknown stations, people past the limit and
 * other parameters drop out, and the slider is in its plain form. So one plan has one picture address.
 */
export function planQuery(data: MatrixData, search: string): string {
  const { plan } = decodePlan(search, (id) => data.byId.has(id));
  return plan === null ? "" : encodePlan(plan, new URLSearchParams());
}

/** "Shizuku and Tora", "Shizuku, Tora and Kai", "A, B, C and 2 more". */
export function namesText(labels: readonly string[]): string {
  if (labels.length <= NAMED) {
    return labels.length < 2 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)!}`;
  }
  return `${labels.slice(0, NAMED).join(", ")} and ${labels.length - NAMED} more`;
}

export interface PreviewText {
  readonly title: string;
  readonly description: string;
  /** The picture, in words, for people who cannot see it. */
  readonly alt: string;
}

/** The trip with the most plain minutes, there and back; the first person wins a tie. */
function longestTrip(best: CandidateResult): { readonly label: string; readonly minutes: number } {
  return best.people.reduce((a, p) => (tripMinutes(p) > a.minutes ? { label: p.label, minutes: tripMinutes(p) } : a),
    { label: best.people[0]?.label ?? "", minutes: tripMinutes(best.people[0]!) });
}

/**
 * One line like the app's ticket, "93 min on average · longest trip 100 min (Shizuku) · last train 23:32 (Tora)":
 * a preview cuts text after about two lines, and a line of facts still reads when cut.
 */
export function previewText(best: CandidateResult): PreviewText {
  const { average } = plainSummary(best);
  const longest = longestTrip(best);
  const station = `${best.station.ja} (${best.station.en})`;
  const last = earliestLastTrain(best);
  return {
    title: `${namesText(best.people.map((p) => p.label))} meet at ${station}`,
    description: [
      `${Math.round(average)} min on average`,
      `longest trip ${longest.minutes} min (${longest.label})`,
      ...(last === null ? [] : [`last train ${formatClock(last.time)} (${last.labels.join(" and ")})`]),
    ].join(" · "),
    alt: `Each person's train route on a Tokyo rail map, to ${station} under a red 要 seal.`,
  };
}
