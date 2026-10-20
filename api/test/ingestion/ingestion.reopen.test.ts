import { describe, expect, it } from "vitest";
import { desktopSessionIdOf, toDesktopLink, toResumeCommand } from "../../src/features/ingestion/ingestion.reopen.js";

const SESSION_ID = "0b6f1e2a-1c3d-4e5f-8a9b-0c1d2e3f4a5b";
const DESKTOP_ID = "local_8696f16a-1111-4222-8333-444455556666";

describe("toResumeCommand", () => {
  it("moves to a Windows folder with a space and resumes the session, on two lines", () => {
    // Arrange
    const folder = "C:\\WS\\my project";

    // Act
    const command = toResumeCommand(folder, SESSION_ID);

    // Assert
    expect(command).toBe(`pushd "C:\\WS\\my project"\nclaude --resume ${SESSION_ID}`);
  });

  it("moves to a POSIX folder", () => {
    // Act
    const command = toResumeCommand("/home/me/repo", SESSION_ID);

    // Assert
    expect(command).toBe(`pushd "/home/me/repo"\nclaude --resume ${SESSION_ID}`);
  });

  it("ends with no newline, so that nothing starts without the person's Enter", () => {
    // Act
    const command = toResumeCommand("/home/me/repo", SESSION_ID);

    // Assert
    expect(command?.endsWith("\n")).toBe(false);
  });

  it("appends a dot to a drive root so that the closing quote is not escaped", () => {
    // Act
    const command = toResumeCommand("C:\\", SESSION_ID);

    // Assert
    expect(command).toBe(`pushd "C:\\."\nclaude --resume ${SESSION_ID}`);
  });

  it.each([null, ""])("gives no command for the folder %j", (folder) => {
    // Act / Assert
    expect(toResumeCommand(folder, SESSION_ID)).toBeNull();
  });

  it.each([
    ["a double quote", 'C:\\WS\\a"b'],
    ["a dollar sign", "C:\\WS\\a$b"],
    ["a backtick", "C:\\WS\\a`b"],
    ["a percent sign", "C:\\WS\\a%b"],
    ["an exclamation mark", "C:\\WS\\a!b"],
    ["a line feed", "C:\\WS\\a\nb"],
    ["a carriage return", "C:\\WS\\a\rb"],
    ["an opening bracket", "C:\\WS\\a[1"],
    ["a closing bracket", "C:\\WS\\a]1"],
    ["an asterisk", "C:\\WS\\a*b"],
    ["a question mark", "C:\\WS\\a?b"],
    ["a left curly double quote", "C:\\WS\\a\u201Cb"],
    ["a right curly double quote", "C:\\WS\\a\u201Db"],
    ["a low curly double quote", "C:\\WS\\a\u201Eb"],
    ["a tab", "/home/me/a\tb"],
    ["an escape character", "/home/me/a\u001B[201~b"],
    ["a delete character", "/home/me/a\u007Fb"],
    ["a double backslash", "C:\\WS\\\\a"],
    ["a UNC path", "\\\\server\\share\\repo"],
  ])("gives no command for a folder with %s (BR-20)", (_name, folder) => {
    // Act / Assert
    expect(toResumeCommand(folder, SESSION_ID)).toBeNull();
  });

  it.each(["a b", "a;b", "a$(x)", 'a"b', "", "--dangerously-skip-permissions", "-x"])("gives no command for the session id %j", (sessionId) => {
    // Act / Assert
    expect(toResumeCommand("/home/me/repo", sessionId)).toBeNull();
  });
});

describe("toDesktopLink", () => {
  it("builds the link of a well-formed desktop id", () => {
    // Act / Assert
    expect(toDesktopLink(DESKTOP_ID)).toBe(`claude://claude.ai/epitaxy/${DESKTOP_ID}`);
  });

  it.each([null, "", "local_x", `${DESKTOP_ID}/../x`, DESKTOP_ID.toUpperCase(), SESSION_ID])("gives no link for %j", (id) => {
    // Act / Assert
    expect(toDesktopLink(id)).toBeNull();
  });
});

describe("desktopSessionIdOf", () => {
  it("gives the id of a desktop-app status file", () => {
    // Act / Assert
    expect(desktopSessionIdOf({ entrypoint: "claude-desktop", hostSessionId: DESKTOP_ID })).toBe(DESKTOP_ID);
  });

  it.each([
    ["a CLI entrypoint", { entrypoint: "cli", hostSessionId: DESKTOP_ID }],
    ["no entrypoint", { hostSessionId: DESKTOP_ID }],
    ["no host session id", { entrypoint: "claude-desktop" }],
    ["a null host session id", { entrypoint: "claude-desktop", hostSessionId: null }],
    ["an ill-formed host session id", { entrypoint: "claude-desktop", hostSessionId: "local_not-a-uuid" }],
  ])("gives no id for %s", (_name, status) => {
    // Act / Assert
    expect(desktopSessionIdOf(status)).toBeNull();
  });
});
