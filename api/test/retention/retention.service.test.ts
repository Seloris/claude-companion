import { appendFile, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildSession, buildWorkspace } from "../factories.js";
import { userLine, writeSession } from "../ingestion/log-builders.js";
import { createTestContext } from "../setup.js";

const DAY = 86_400_000;
const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";

describe("RetentionService", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx.dispose();
  });

  // Files get the real time as their modification time, far from the fixed test clock: every test dates its files.
  async function ageFile(file: string, daysAgo: number) {
    const modifiedAt = new Date(ctx.clock.now().getTime() - daysAgo * DAY);
    await utimes(file, modifiedAt, modifiedAt);
    return modifiedAt;
  }

  async function writeAgedSession(sessionId: string, daysAgo: number, subagentDaysAgo?: number) {
    const files = await writeSession(ctx.logsDir, "C--WS-demo", {
      sessionId,
      lines: [userLine("Go", { sessionId })],
      subagents: subagentDaysAgo === undefined ? [] : [[userLine("Sub", { sessionId })]],
    });
    const modifiedAt = await ageFile(files.mainFile, daysAgo);
    if (subagentDaysAgo !== undefined) await ageFile(files.subagentFiles[0]!, subagentDaysAgo);
    return { ...files, modifiedAt };
  }

  async function snapshot(file: string) {
    const stats = await stat(file);
    return { size: stats.size, modifiedAt: stats.mtimeMs, content: await readFile(file, "utf8") };
  }

  describe("retention in force", () => {
    it("uses 30 days and says it is the default when there is no settings file", async () => {
      // Act
      const status = await ctx.retention.getRetention();

      // Assert
      expect(status).toMatchObject({ retentionDays: 30, isDefault: true });
    });

    it("reads cleanupPeriodDays from the settings file", async () => {
      // Arrange
      await writeFile(ctx.settingsFile, JSON.stringify({ theme: "dark", cleanupPeriodDays: 45 }));

      // Act
      const status = await ctx.retention.getRetention();

      // Assert
      expect(status).toMatchObject({ retentionDays: 45, isDefault: false });
    });

    it.each([
      ["zero", JSON.stringify({ cleanupPeriodDays: 0 })],
      ["negative", JSON.stringify({ cleanupPeriodDays: -3 })],
      ["fractional", JSON.stringify({ cleanupPeriodDays: 2.5 })],
      ["a string", JSON.stringify({ cleanupPeriodDays: "30" })],
      ["above the upper bound", JSON.stringify({ cleanupPeriodDays: 36_501 })],
      ["missing", JSON.stringify({ theme: "dark" })],
      ["not valid JSON", "{ cleanupPeriodDays: "],
      ["a JSON array", JSON.stringify([45])],
    ])("falls back to the 30-day default when the setting is %s", async (_case, content) => {
      // Arrange
      await writeFile(ctx.settingsFile, content);

      // Act
      const status = await ctx.retention.getRetention();

      // Assert
      expect(status).toMatchObject({ retentionDays: 30, isDefault: true });
    });
  });

  describe("oldest log", () => {
    it("is the earliest modification time across main and subagent files", async () => {
      // Arrange
      await writeAgedSession(FIRST_ID, 5);
      await writeAgedSession(SECOND_ID, 3, 12);

      // Act
      const status = await ctx.retention.getRetention();

      // Assert
      expect(status.oldestLogAt).toBe(new Date(ctx.clock.now().getTime() - 12 * DAY).toISOString());
    });

    it("is null, with no file at risk, when the logs folder is missing", async () => {
      // Act
      const status = await ctx.retention.getRetention();

      // Assert
      expect(status.oldestLogAt).toBeNull();
      expect(status.unreadAtRisk).toEqual({ fileCount: 0, nearestDeletionAt: null });
    });
  });

  it("counts the archived sessions, Scratch included", async () => {
    // Arrange
    await ctx.seed.session(buildWorkspace(), buildSession(), { isArchived: true });
    await ctx.seed.session(buildWorkspace({ isScratch: true }), buildSession(), { isArchived: true });
    await ctx.seed.session(buildWorkspace(), buildSession());

    // Act
    const status = await ctx.retention.getRetention();

    // Assert
    expect(status.archivedSessionCount).toBe(2);
  });

  describe("unread files at risk", () => {
    it("flags a never-read file whose deletion falls within 7 days", async () => {
      // Arrange
      const { modifiedAt } = await writeAgedSession(FIRST_ID, 25);

      // Act
      const status = await ctx.retention.getRetention();

      // Assert
      expect(status.unreadAtRisk).toEqual({
        fileCount: 1,
        nearestDeletionAt: new Date(modifiedAt.getTime() + 30 * DAY).toISOString(),
      });
    });

    it("does not flag a never-read file that is far from deletion", async () => {
      // Arrange
      await writeAgedSession(FIRST_ID, 10);

      // Act
      const status = await ctx.retention.getRetention();

      // Assert
      expect(status.unreadAtRisk).toEqual({ fileCount: 0, nearestDeletionAt: null });
    });

    it("uses the retention of the settings file", async () => {
      // Arrange
      await writeFile(ctx.settingsFile, JSON.stringify({ cleanupPeriodDays: 14 }));
      await writeAgedSession(FIRST_ID, 10);

      // Act
      const status = await ctx.retention.getRetention();

      // Assert
      expect(status.unreadAtRisk.fileCount).toBe(1);
    });

    it("stops flagging a file once a refresh has read it, and flags it again when it changes", async () => {
      // Arrange
      const { mainFile } = await writeAgedSession(FIRST_ID, 25);
      await ctx.ingestion.refresh();
      const afterRefresh = await ctx.retention.getRetention();

      // Act
      await appendFile(mainFile, JSON.stringify(userLine("More", { sessionId: FIRST_ID })) + "\n");
      await ageFile(mainFile, 25);
      const afterChange = await ctx.retention.getRetention();

      // Assert
      expect(afterRefresh.unreadAtRisk.fileCount).toBe(0);
      expect(afterChange.unreadAtRisk.fileCount).toBe(1);
    });

    it("counts an unread subagent file as its own file", async () => {
      // Arrange
      const { subagentFiles } = await writeAgedSession(FIRST_ID, 25, 26);
      await ctx.ingestion.refresh();
      await appendFile(subagentFiles[0]!, JSON.stringify(userLine("More", { sessionId: FIRST_ID })) + "\n");
      await ageFile(subagentFiles[0]!, 26);

      // Act
      const status = await ctx.retention.getRetention();

      // Assert
      expect(status.unreadAtRisk).toEqual({
        fileCount: 1,
        nearestDeletionAt: new Date(ctx.clock.now().getTime() + 4 * DAY).toISOString(),
      });
    });

    it("flags an overdue file, and gives the earliest deletion date as the nearest", async () => {
      // Arrange
      await writeAgedSession(FIRST_ID, 40);
      await writeAgedSession(SECOND_ID, 28);

      // Act
      const status = await ctx.retention.getRetention();

      // Assert
      expect(status.unreadAtRisk.fileCount).toBe(2);
      expect(status.unreadAtRisk.nearestDeletionAt).toBe(new Date(ctx.clock.now().getTime() - 10 * DAY).toISOString());
    });
  });

  it("leaves the log files and the settings file unchanged", async () => {
    // Arrange
    await writeFile(ctx.settingsFile, JSON.stringify({ cleanupPeriodDays: 45 }));
    const logs = await writeAgedSession(FIRST_ID, 25, 26);
    const files = [ctx.settingsFile, logs.mainFile, ...logs.subagentFiles];
    const before = await Promise.all(files.map(snapshot));

    // Act
    await ctx.retention.getRetention();

    // Assert
    expect(await Promise.all(files.map(snapshot))).toEqual(before);
  });
});
