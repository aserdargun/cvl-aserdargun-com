// Records which commit produced the artifact, so a deployed build can be traced
// back to source without guessing.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function gitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const sha = gitSha();
if (!sha) {
  console.error("write-release: no git commit could be read, refusing to write release.json");
  process.exit(1);
}

writeFileSync(
  new URL("../release.json", import.meta.url),
  `${JSON.stringify({ schemaVersion: "1.0", commit: sha, builtAt: new Date().toISOString() }, null, 2)}\n`,
);
