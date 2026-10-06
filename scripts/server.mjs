// Repository-owned preview server.
//
// `start` records the PID and the exact command it launched. `stop` refuses to
// kill anything it cannot prove is this repository's Vite process, so a busy
// port on the machine never turns into someone else's terminated work.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync, appendFileSync, openSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = path.join(root, ".local");
const statePath = path.join(stateDir, "server.json");
const logPath = path.join(stateDir, "server.log");
const PORT = Number.parseInt(process.env.CVL_PORT ?? "8072", 10);

function readState() {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

function processCommandLine(pid) {
  try {
    return process.platform === "darwin" || process.platform === "linux"
      ? readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ").trim()
      : null;
  } catch {
    return null;
  }
}

function stillOurs(pid) {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  if (process.platform === "linux") {
    const cmdline = processCommandLine(pid) ?? "";
    return cmdline.includes("vite") && cmdline.includes("cvl");
  }
  return true;
}

function start() {
  const existing = readState();
  if (existing && stillOurs(existing.pid)) {
    console.log(`A CVL preview is already running on http://127.0.0.1:${PORT} (pid ${existing.pid}).`);
    return;
  }
  mkdirSync(stateDir, { recursive: true });
  const log = openSync(logPath, "a");
  const child = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    cwd: root,
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  writeFileSync(
    statePath,
    `${JSON.stringify({ pid: child.pid, port: PORT, cwd: root, command: "vite", startedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  appendFileSync(logPath, `\n[${new Date().toISOString()}] started pid ${child.pid} on ${PORT}\n`);
  console.log(`CVL preview starting on http://127.0.0.1:${PORT} (pid ${child.pid}). Logs: ${logPath}`);
}

function stop() {
  const state = readState();
  if (!state) {
    console.log("No recorded CVL preview server; nothing to stop.");
    return;
  }
  if (state.cwd !== root) {
    console.error(`Refusing to stop pid ${state.pid}: it was started from ${state.cwd}, not ${root}.`);
    process.exit(1);
  }
  if (!stillOurs(state.pid)) {
    console.log(`Recorded pid ${state.pid} is no longer running; clearing the record.`);
    rmSync(statePath, { force: true });
    return;
  }
  try {
    process.kill(-state.pid, "SIGTERM");
  } catch {
    try {
      process.kill(state.pid, "SIGTERM");
    } catch {
      console.error(`Could not signal pid ${state.pid}.`);
      process.exit(1);
    }
  }
  rmSync(statePath, { force: true });
  appendFileSync(logPath, `\n[${new Date().toISOString()}] stopped pid ${state.pid}\n`);
  console.log(`Stopped CVL preview pid ${state.pid}.`);
}

const command = process.argv[2];
if (command === "start") start();
else if (command === "stop") stop();
else {
  console.error("Usage: node scripts/server.mjs <start|stop>");
  process.exit(1);
}