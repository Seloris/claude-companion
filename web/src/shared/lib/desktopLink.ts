// The page renders no other `href` from the api than this exact shape: a link that opens a session in the Claude desktop
// app. Anything else (a `javascript:` URL, another scheme, extra path or query) is dropped, never rendered.
const DESKTOP_LINK = /^claude:\/\/claude\.ai\/epitaxy\/local_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isDesktopLink(href: string): boolean {
  return DESKTOP_LINK.test(href);
}
