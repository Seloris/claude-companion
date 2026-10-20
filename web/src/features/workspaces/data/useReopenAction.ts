import { isDesktopLink } from "../../../shared/lib/desktopLink.ts";
import { useLiveStateQuery } from "../../live/data/useLiveStateQuery.ts";

export type ReopenAction = { kind: "desktop"; href: string } | { kind: "resume"; command: string } | { kind: "none" };

interface ReopenableSession {
  id: string;
  desktopLink: string | null;
  resumeCommand: string | null;
}

// What a session offers to be reopened (FR-16, FR-17). The layout runs the live poll (every 3 seconds, on every page),
// and that poll is what removes the copy button from a session that becomes live (BR-15): this hook only reads the
// shared query, it adds no request.
export function useReopenAction(): (session: ReopenableSession) => ReopenAction {
  const { data: live, isError } = useLiveStateQuery({ isPolling: false });

  return (session) => {
    const liveSession = live?.workspaces
      .flatMap((workspace) => workspace.sessions)
      .find((candidate) => candidate.sessionId === session.id);

    // BR-18: the link wins; a session that is live without a stored link yet takes the live state's.
    const href = session.desktopLink ?? liveSession?.desktopLink ?? null;
    if (href !== null && isDesktopLink(href)) return { kind: "desktop", href };

    // BR-15: without a trustworthy live state (not loaded, a failed refetch keeps stale data, folder unreadable) the
    // page cannot tell that the session is not live, so it offers no command.
    if (live === undefined || isError || !live.isSessionsDirReadable) return { kind: "none" };
    if (liveSession !== undefined) return { kind: "none" };

    return session.resumeCommand === null ? { kind: "none" } : { kind: "resume", command: session.resumeCommand };
  };
}
