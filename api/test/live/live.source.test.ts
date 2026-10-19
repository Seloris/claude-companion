import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findSessionLog, isPidAlive, readStatusFiles } from "../../src/features/live/live.source.js";
import { SESSION_ID, writeSession, userLine } from "../ingestion/log-builders.js";
import { statusFile, writeStatusFile } from "./live-builders.js";

describe("live source", () => {
  let tempRoot: string;
  let sessionsDir: string;
  let logsDir: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "claude-companion-live-source-"));
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    sessionsDir = path.join(tempRoot, "sessions");
    logsDir = path.join(tempRoot, "projects");
    await rm(sessionsDir, { recursive: true, force: true });
    await rm(logsDir, { recursive: true, force: true });
  });

  describe("readStatusFiles", () => {
    it("lists only the {pid}.json files, never the key files beside them", async () => {
      // Arrange
      await writeStatusFile(sessionsDir, statusFile({ pid: 11 }));
      await writeStatusFile(sessionsDir, statusFile({ pid: 22 }));
      await writeFile(path.join(sessionsDir, "11.abcdef.key"), "not a status file");
      await writeFile(path.join(sessionsDir, "notes.json"), JSON.stringify(statusFile({ pid: 33 })));
      await mkdir(path.join(sessionsDir, "44"));

      // Act
      const result = await readStatusFiles(sessionsDir);

      // Assert
      expect(result.isDirReadable).toBe(true);
      expect(result.files.map((file) => file.fileName)).toEqual(["11.json", "22.json"]);
      expect(result.files.map((file) => file.status?.pid)).toEqual([11, 22]);
    });

    it("gives a null status to a file that is not valid", async () => {
      // Arrange
      await writeStatusFile(sessionsDir, statusFile({ pid: 11 }), { content: '{"pid": 11, "sessi' });
      await writeStatusFile(sessionsDir, statusFile({ pid: 22 }), { content: JSON.stringify({ pid: 22 }) });
      await writeStatusFile(sessionsDir, statusFile({ pid: 33, sessionId: "../escape" }));

      // Act
      const result = await readStatusFiles(sessionsDir);

      // Assert
      expect(result.files.map((file) => [file.fileName, file.status])).toEqual([
        ["11.json", null],
        ["22.json", null],
        ["33.json", null],
      ]);
    });

    it("gives a null status to a file whose times cannot be a date", async () => {
      // Arrange
      await writeStatusFile(sessionsDir, statusFile({ pid: 11, startedAt: 1e20 }));
      await writeStatusFile(sessionsDir, statusFile({ pid: 22, updatedAt: -5 }));
      await writeStatusFile(sessionsDir, statusFile({ pid: 33, statusUpdatedAt: 1.5 }));
      await writeStatusFile(sessionsDir, statusFile({ pid: 44, startedAt: 8.64e15 }));

      // Act
      const result = await readStatusFiles(sessionsDir);

      // Assert
      expect(result.files.map((file) => [file.fileName, file.status === null])).toEqual([
        ["11.json", true],
        ["22.json", true],
        ["33.json", true],
        ["44.json", false],
      ]);
    });

    it("keeps the fields Claude Code adds and leaves the optional ones out", async () => {
      // Arrange
      await writeStatusFile(sessionsDir, statusFile({ pid: 11 }), {
        content: JSON.stringify({ pid: 11, sessionId: SESSION_ID, cwd: "C:\\WS\\demo", startedAt: 1, procStart: "x" }),
      });

      // Act
      const result = await readStatusFiles(sessionsDir);

      // Assert
      expect(result.files[0]?.status).toMatchObject({ pid: 11, sessionId: SESSION_ID, startedAt: 1 });
      expect(result.files[0]?.status?.status).toBeUndefined();
    });

    it("reports an unreadable folder when it is missing", async () => {
      // Act
      const result = await readStatusFiles(path.join(tempRoot, "nowhere"));

      // Assert
      expect(result).toEqual({ isDirReadable: false, files: [] });
    });
  });

  describe("isPidAlive", () => {
    it("is true for the running process", () => {
      // Act
      const isAlive = isPidAlive(process.pid);

      // Assert
      expect(isAlive).toBe(true);
    });

    it("is false for a process that has exited", () => {
      // Arrange
      const exited = spawnSync(process.execPath, ["-e", ""]);

      // Act
      const isAlive = isPidAlive(exited.pid);

      // Assert
      expect(isAlive).toBe(false);
    });
  });

  describe("findSessionLog", () => {
    it("finds the main log in any folder of the logs folder", async () => {
      // Arrange
      await writeSession(logsDir, "C--WS-other", { sessionId: "other-session", lines: [userLine("Hi")] });
      const files = await writeSession(logsDir, "c--ws-demo", { lines: [userLine("Hi")] });

      // Act
      const found = await findSessionLog(logsDir, SESSION_ID);

      // Assert
      expect(found).toEqual({ mainPath: files.mainFile, folderPath: path.join(logsDir, "c--ws-demo") });
    });

    it("returns null when no folder holds the log", async () => {
      // Arrange
      await writeSession(logsDir, "C--WS-other", { sessionId: "other-session", lines: [userLine("Hi")] });

      // Act
      const found = await findSessionLog(logsDir, SESSION_ID);

      // Assert
      expect(found).toBeNull();
    });

    it("returns null when the logs folder is missing", async () => {
      // Act
      const found = await findSessionLog(path.join(tempRoot, "nowhere"), SESSION_ID);

      // Assert
      expect(found).toBeNull();
    });
  });
});
