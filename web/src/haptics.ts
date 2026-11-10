/** One short tap on a phone that can vibrate, once the visitor has touched the page (browsers require it). */
import { BUZZ_MS } from "./model/stamp";

export function tap(): void {
  if (typeof navigator.vibrate !== "function" || !(navigator.userActivation?.hasBeenActive ?? false)) return;
  navigator.vibrate(BUZZ_MS);
}
