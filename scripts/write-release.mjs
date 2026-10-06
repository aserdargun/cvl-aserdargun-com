// Stamps the artifact with the commit that produced it and copies the public
// schema next to it, so a deployed build can be traced back to source and the
// run schema is reachable from the published address.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

function gitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: root }).trim();
  } catch {
    return null;
  }
}

const sha = gitSha();
if (!sha) {
  console.error("write-release: no git commit could be read, refusing to stamp the artifact");
  process.exit(1);
}

writeFileSync(
  path.join(dist, "release.json"),
  `${JSON.stringify({ schemaVersion: "1.0", commit: sha, builtAt: new Date().toISOString() }, null, 2)}\n`,
);

function copyTree(from, to) {
  if (!statSync(from, { throwIfNoEntry: false })?.isDirectory()) return;
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const destination = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, destination);
    else copyFileSync(source, destination);
  }
}

copyTree(path.join(root, "schemas"), path.join(dist, "schemas"));
copyTree(path.join(root, "public"), path.join(dist, "public"));

console.log(`write-release: stamped ${sha.slice(0, 8)} and copied the public schema.`);