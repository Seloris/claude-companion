// How a stored session is reopened: the desktop app's link (FR-16, BR-19) and the command that resumes it in a terminal
// (FR-17, BR-16, BR-20). Pure functions, shared by the ingestion, workspaces and live features.

export const DESKTOP_ENTRYPOINT = "claude-desktop";

export const DESKTOP_SESSION_ID = /^local_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The session id is a file name of the logs folder: only the characters of an id go into a command, and it never starts
// with a dash, which `claude` would read as an option.
const SESSION_ID = /^\w[\w-]*$/;

// Each character breaks at least one of PowerShell, cmd and bash even inside double quotes (BR-20):
// `"` closes the quotes, and so do the curly double quotes U+201C, U+201D and U+201E in PowerShell; `$` and a backtick
// expand in PowerShell and bash; `%` expands in cmd; `!` expands in an interactive bash; a line break ends the command;
// the other control characters act on the terminal (a tab completes, an escape sequence, `[` included, can end a
// bracketed paste); `[` `]` `*` `?` are wildcards of PowerShell's `pushd` (Push-Location -Path); two backslashes in a
// row are folded by bash, and also exclude UNC paths.
// eslint-disable-next-line no-control-regex -- the control characters are what the pattern excludes
const UNQUOTABLE_FOLDER = /["“”„$`%![\]*?\x00-\x1f\x7f]|\\\\/;

export function desktopSessionIdOf(status: { entrypoint?: string | null | undefined; hostSessionId?: string | null | undefined }): string | null {
  const id = status.hostSessionId;
  return status.entrypoint === DESKTOP_ENTRYPOINT && id !== undefined && id !== null && DESKTOP_SESSION_ID.test(id) ? id : null;
}

export function toDesktopLink(desktopSessionId: string | null): string | null {
  return desktopSessionId !== null && DESKTOP_SESSION_ID.test(desktopSessionId)
    ? `claude://claude.ai/epitaxy/${desktopSessionId}`
    : null;
}

// Two lines joined by a newline, with no trailing one:
// - a newline is the only separator PowerShell 5.1, PowerShell 7, cmd and bash share (`&&` fails in PowerShell 5.1,
//   `;` does not separate in cmd, a bare `&` is a parse error in PowerShell 5.1 and backgrounds `pushd` in bash);
// - `claude` has no option for its working directory, so the folder change is needed; `pushd`, not `cd`, since it exists
//   in all four shells and switches the drive in cmd, where `cd` needs `/d` (which PowerShell rejects);
// - double quotes keep spaces in all four shells;
// - no trailing newline: nothing starts without the person's Enter.
export function toResumeCommand(startFolder: string | null, sessionId: string): string | null {
  if (startFolder === null || startFolder === "" || !SESSION_ID.test(sessionId) || UNQUOTABLE_FOLDER.test(startFolder)) {
    return null;
  }
  // A trailing backslash (a drive root) would read as an escaped quote in bash.
  const folder = startFolder.endsWith("\\") ? `${startFolder}.` : startFolder;
  return `pushd "${folder}"\nclaude --resume ${sessionId}`;
}
