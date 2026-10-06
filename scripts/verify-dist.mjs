// Fail closed when the artifact is not a deployable static laboratory.
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const problems = [];

if (!existsSync(dist)) problems.push("dist/ is missing");
else {
  const indexPath = path.join(dist, "index.html");
  if (!existsSync(indexPath)) problems.push("dist/index.html is missing");
  else {
    const html = readFileSync(indexPath, "utf8");
    if (!/<title>CVL - Computer Vision Laboratory<\/title>/.test(html)) problems.push("index.html does not carry the CVL identity");
    if (!/id="root"/.test(html)) problems.push("index.html has no mount point");
    if (html.includes("localhost:8072")) problems.push("index.html references a development address");
  }
  for (const required of ["release.json", "schemas"]) {
    if (!existsSync(path.join(dist, required))) problems.push(`dist/${required} is missing`);
  }
  const assets = path.join(dist, "assets");
  if (!existsSync(assets)) problems.push("dist/assets is missing");
  else {
    const js = statSync(assets).isDirectory();
    if (!js) problems.push("dist/assets is not a directory");
  }
}

if (problems.length > 0) {
  console.error("verify-dist failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("verify-dist: artifact carries the CVL identity, mount point and release record.");
