import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_SESSIONS, writeFreshBoard, writeLiveDemo } from "./demo/live-demo.js";

// `npm run demo`: the live demo dataset, one sleeping process per fake session (so each status file's pid is alive), and
// the API on it, on its own port and database: the person's real API keeps 3100 and .data/pglite.

const PORT = "3101";
const FRESH_BOARD_EVERY_MS = 10_000;

// Resolved from this file, never from the current folder: the folders below are emptied.
const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoDir = path.join(apiDir, "fixtures", "live-demo");
const dbDir = path.join(apiDir, ".data", "pglite-demo");
const projectsDir = path.join(demoDir, "projects");
const sessionsDir = path.join(demoDir, "sessions");
const boardsDir = path.join(demoDir, "factory-board");

// A sleeper exits once the runner, whose pid it is given, is gone: a crashed demo leaves no process behind. With
// `node -e`, the first argument is process.argv[1].
const SLEEPER = `const runner = Number(process.argv[1]); setInterval(() => { try { process.kill(runner, 0); } catch { process.exit(0); } }, 2000);`;

// A demo already running owns the two folders below: they are never emptied under it.
function isPortBusy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

// Only these two folders are ever emptied, each checked against its expected last segments first.
async function resetFolder(folder: string, segments: string[]): Promise<void> {
  const tail = folder.split(path.sep).slice(-segments.length);
  if (path.dirname(path.dirname(folder)) !== apiDir || tail.join("/") !== segments.join("/")) {
    throw new Error(`refusing to empty ${folder}`);
  }
  await rm(folder, { recursive: true, force: true });
  await mkdir(folder, { recursive: true });
}

function startSleeper(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", SLEEPER, String(process.pid)], { stdio: "ignore" });
    child.once("spawn", () => resolve(child));
    child.once("error", reject);
  });
}

const sleepers: ChildProcess[] = [];
let api: ChildProcess | null = null;
let freshBoardTimer: NodeJS.Timeout | null = null;

function killSleepers(): void {
  for (const sleeper of sleepers) if (sleeper.exitCode === null) sleeper.kill();
}

function stop(code: number): void {
  if (freshBoardTimer !== null) clearInterval(freshBoardTimer);
  killSleepers();
  if (api !== null && api.exitCode === null) api.kill();
  process.exit(code);
}

// The last resort: whatever ends the runner, the sleepers die with it.
process.on("exit", killSleepers);
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

if (await isPortBusy(Number(PORT))) {
  console.error(`Port ${PORT} is in use, probably by a demo already running: stop it first.`);
  process.exit(1);
}

try {
  await resetFolder(demoDir, ["fixtures", "live-demo"]);
  await resetFolder(dbDir, [".data", "pglite-demo"]);
  for (let index = 0; index < DEMO_SESSIONS.length; index += 1) sleepers.push(await startSleeper());
  const pids = sleepers.map((sleeper) => sleeper.pid).filter((pid): pid is number => pid !== undefined);
  await writeLiveDemo({ projectsDir, sessionsDir, boardsDir, now: Date.now(), pids });
} catch (error) {
  console.error("the live demo could not be written", error);
  stop(1);
}

// Without it the fresh board would go stale after 60 s. A rename over a file being read can fail on Windows: the next
// tick tries again.
freshBoardTimer = setInterval(() => {
  writeFreshBoard(boardsDir, Date.now()).catch((error: unknown) => console.error("the fresh demo board could not be rewritten", error));
}, FRESH_BOARD_EVERY_MS);

// One node process, no watch: killing it frees the port at once (a tsx watch wrapper would leave its child on Windows).
api = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
  cwd: apiDir,
  stdio: "inherit",
  env: {
    ...process.env,
    PORT,
    PGLITE_DIR: dbDir,
    CLAUDE_PROJECTS_DIR: projectsDir,
    CLAUDE_SESSIONS_DIR: sessionsDir,
    CLAUDE_FACTORY_BOARD_DIR: boardsDir,
    // Absent on purpose: the demo reads nothing of ~/.claude.
    CLAUDE_SETTINGS_FILE: path.join(demoDir, "settings.json"),
    CLAUDE_PLUGINS_FILE: path.join(demoDir, "installed_plugins.json"),
  },
});
// A busy port makes the API exit with its own message: the runner stops with it.
api.once("exit", (code) => stop(code ?? 0));

console.log(`live demo: ${DEMO_SESSIONS.length} sessions under ${demoDir}`);
console.log(`  API   http://localhost:${PORT}`);
console.log("  front cd web && npm run dev:demo → http://localhost:5180");
console.log("  Ctrl+C stops the API and every demo process");
