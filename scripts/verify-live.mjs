// Same checks, against a deployed address. Reads the commit the workflow built.
import { execFileSync } from "node:child_process";

const baseUrl = (process.env.CVL_BASE_URL ?? "").replace(/\/$/, "");
const expectedCommit = process.env.EXPECTED_COMMIT ?? "";

if (!baseUrl) {
  console.error("verify-live: CVL_BASE_URL is required");
  process.exit(1);
}

async function get(url) {
  const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "cvl-verify-live" } });
  return { status: response.status, type: response.headers.get("content-type") ?? "", body: await response.text() };
}

const problems = [];

const index = await get(`${baseUrl}/`);
if (index.status !== 200) problems.push(`index returned ${index.status}`);
if (!/<title>CVL - Vision Laboratory<\/title>/.test(index.body)) problems.push("index does not carry the CVL identity");

let release = null;
try {
  const releaseResponse = await get(`${baseUrl}/release.json`);
  if (releaseResponse.status !== 200) problems.push(`release.json returned ${releaseResponse.status}`);
  else release = JSON.parse(releaseResponse.body);
} catch {
  problems.push("release.json could not be read");
}

if (expectedCommit) {
  let built = null;
  try {
    built = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    built = null;
  }
  const deployed = release?.commit ?? null;
  if (built && deployed && built !== deployed) problems.push(`deployed commit ${deployed} does not match ${built}`);
  if (deployed && expectedCommit && deployed !== expectedCommit) problems.push(`deployed commit ${deployed} is not ${expectedCommit}`);
}

if (problems.length > 0) {
  console.error("verify-live failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`verify-live: ${baseUrl} serves the CVL identity and release record.`);
