import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createRefreshScheduler } from "../../src/features/ingestion/ingestion.scheduler.js";
import { refreshRuns, refreshSchedules } from "../../src/features/ingestion/ingestion.table.js";
import { createTestContext } from "../setup.js";
import { userLine, writeSession } from "./log-builders.js";

const MINUTE = 60_000;

describe("RefreshScheduler", () => {
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

  async function runCount() {
    return (await ctx.db.select().from(refreshRuns)).length;
  }

  it("arms the default interval of 10 minutes when no schedule is stored", async () => {
    // Act
    await ctx.scheduler().start();

    // Assert
    expect(ctx.timer.pending()).toEqual([10 * MINUTE]);
  });

  it("arms the stored interval", async () => {
    // Arrange
    await ctx.ingestionRepo.saveRefreshSchedule({ intervalMinutes: 30, updatedAt: ctx.clock.now() });

    // Act
    await ctx.scheduler().start();

    // Assert
    expect(ctx.timer.pending()).toEqual([30 * MINUTE]);
  });

  it("arms nothing when the stored schedule is off", async () => {
    // Arrange
    await ctx.ingestionRepo.saveRefreshSchedule({ intervalMinutes: null, updatedAt: ctx.clock.now() });

    // Act
    await ctx.scheduler().start();

    // Assert
    expect(ctx.timer.pending()).toEqual([]);
  });

  it("starts an incremental refresh when the timer fires, and arms the next tick", async () => {
    // Arrange
    await writeSession(ctx.logsDir, "C--WS-demo", { lines: [userLine("Go")] });
    await ctx.scheduler().start();

    // Act
    ctx.timer.fire();
    const pendingAfterFire = ctx.timer.pending();
    await ctx.ingestion.whenIdle();

    // Assert
    const runs = await ctx.db.select().from(refreshRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ mode: "incremental", status: "succeeded", sessionsAdded: 1 });
    expect(pendingAfterFire).toEqual([10 * MINUTE]);
  });

  it("starts no second run when a refresh is in progress, and still arms the next tick", async () => {
    // Arrange
    await ctx.scheduler().start();
    // Not awaited: the running flag is set before the first await, so the run is still in progress when the timer fires.
    const manual = ctx.ingestion.start();

    // Act
    ctx.timer.fire();
    await manual;
    await ctx.ingestion.whenIdle();

    // Assert
    expect(await runCount()).toBe(1);
    expect(ctx.timer.pending()).toEqual([10 * MINUTE]);
  });

  it("saves a new interval, re-arms from now and starts no refresh", async () => {
    // Arrange
    await ctx.scheduler().start();

    // Act
    const schedule = await ctx.scheduler().setSchedule({ intervalMinutes: 5 });
    await ctx.ingestion.whenIdle();

    // Assert
    expect(schedule).toEqual({ intervalMinutes: 5 });
    expect(await ctx.db.select().from(refreshSchedules)).toMatchObject([{ id: 1, intervalMinutes: 5 }]);
    expect(ctx.timer.pending()).toEqual([5 * MINUTE]);
    expect(await runCount()).toBe(0);
  });

  it("leaves nothing armed when the schedule is turned off", async () => {
    // Arrange
    await ctx.scheduler().start();

    // Act
    await ctx.scheduler().setSchedule({ intervalMinutes: null });

    // Assert
    expect(ctx.timer.pending()).toEqual([]);
    expect(await ctx.scheduler().getSchedule()).toEqual({ intervalMinutes: null });
  });

  it("arms the saved interval in a new scheduler over the same database", async () => {
    // Arrange
    await ctx.scheduler().setSchedule({ intervalMinutes: 60 });
    ctx.timer.clear();
    const restarted = ctx.buildScheduler();

    // Act
    await restarted.start();

    // Assert
    expect(ctx.timer.pending()).toEqual([60 * MINUTE]);
    restarted.stop();
  });

  it("keeps a schedule set while start() was still reading the stored one", async () => {
    // Arrange: the stored value is read late, after setSchedule has finished (PGlite alone would answer in order)
    let releaseRead: () => void = () => undefined;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const lateRepo = {
      ...ctx.ingestionRepo,
      findRefreshSchedule: async () => {
        const stored = await ctx.ingestionRepo.findRefreshSchedule();
        await readGate;
        return stored;
      },
    };
    const scheduled: number[] = [];
    const scheduler = createRefreshScheduler({
      ingestion: ctx.ingestion,
      ingestionRepo: lateRepo,
      clock: ctx.clock,
      timer: {
        schedule: (run, delayMs) => {
          scheduled.push(delayMs);
          return ctx.timer.schedule(run, delayMs);
        },
      },
    });

    // Act
    const starting = scheduler.start();
    await scheduler.setSchedule({ intervalMinutes: 5 });
    releaseRead();
    await starting;

    // Assert
    expect(scheduled).toEqual([5 * MINUTE]);
    expect(ctx.timer.pending()).toEqual([5 * MINUTE]);
    scheduler.stop();
  });
});
