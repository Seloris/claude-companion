import { isDesktopLink } from "../../../shared/lib/desktopLink.ts";

// FR-31, FR-36, FR-38: opens the session in the desktop app after a copy. The one place the live page opens a link by
// script, and only a link of the desktop app's exact shape (BR-18: a session without one is not opened).
export function openDesktopLink(link: string | null): void {
  if (link === null || !isDesktopLink(link)) return;
  window.location.assign(link);
}
