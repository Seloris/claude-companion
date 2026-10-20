import type { Clock } from "../../shared/clock.js";
import type { Timer } from "../../shared/timer.js";
import type { IngestionRepository } from "./ingestion.repository.js";
import type { RefreshSchedule } from "./ingestion.schema.js";
import type { IngestionService } from "./ingestion.service.js";

// session-ingestion FR-13: the interval when the person never chose one.
export const DEFAULT_REFRESH_INTERVAL_MINUTES = 10;

const MS_PER_MINUTE = 60_000;

export function createRefreshScheduler({
  ingestion,
  ingestionRepo,
  clock,
  timer,
}: {
  ingestion: Pick<IngestionService, "start">;
  ingestionRepo: IngestionRepository;
  clock: Clock;
  timer: Timer;
}) {
  // In memory: one process serves the application; the stored interval is the source of truth across restarts.
  let intervalMinutes: RefreshSchedule["intervalMinutes"] = DEFAULT_REFRESH_INTERVAL_MINUTES;
  let cancelPending: (() => void) | null = null;
  let hasBeenSet = false;

  function arm(): void {
    cancelPending?.();
    cancelPending = null;
    if (intervalMinutes !== null) cancelPending = timer.schedule(tick, intervalMinutes * MS_PER_MINUTE);
  }

  // BR-12: a periodic refresh is an ordinary one. start() starts nothing while a run is in progress (BR-06), so a tick
  // landing on one is a no-op and the chain goes on. Ticks are paced from the tick, not from the end of a refresh.
  function tick(): void {
    ingestion.start({ mode: "incremental" }).catch((error: unknown) => console.error("periodic refresh failed", error));
    arm();
  }

  async function getSchedule(): Promise<RefreshSchedule> {
    const stored = await ingestionRepo.findRefreshSchedule();
    if (stored === null) return { intervalMinutes: DEFAULT_REFRESH_INTERVAL_MINUTES };
    return { intervalMinutes: stored.intervalMinutes as RefreshSchedule["intervalMinutes"] };
  }

  return {
    async start(): Promise<void> {
      const schedule = await getSchedule();
      // A setSchedule that ran while the stored value was being read is the person's latest choice: it wins.
      if (hasBeenSet) return;
      intervalMinutes = schedule.intervalMinutes;
      arm();
    },

    stop(): void {
      cancelPending?.();
      cancelPending = null;
    },

    getSchedule,

    // FR-13: applies at once, with no immediate refresh. The save comes first: a failed write leaves the running
    // schedule as it was.
    async setSchedule({ intervalMinutes: next }: RefreshSchedule): Promise<RefreshSchedule> {
      await ingestionRepo.saveRefreshSchedule({ intervalMinutes: next, updatedAt: clock.now() });
      hasBeenSet = true;
      intervalMinutes = next;
      arm();
      return { intervalMinutes: next };
    },
  };
}

export type RefreshScheduler = ReturnType<typeof createRefreshScheduler>;
