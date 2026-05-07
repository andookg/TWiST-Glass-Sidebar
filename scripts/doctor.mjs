import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";

const results = [];
const keyPrefix = ["s", "k"].join("") + "-";
const openAiKeyAssignment = `OPENAI_API_KEY=${keyPrefix}`;

function record(ok, label, detail = "") {
  results.push({ ok, label, detail });
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function gitCheckIgnore(path) {
  const result = spawnSync("git", ["check-ignore", path], { encoding: "utf8" });
  return result.status === 0;
}

const major = Number(process.versions.node.split(".")[0]);
record(major >= 20, "Node >=20.11", process.versions.node);

for (const file of ["package.json", "package-lock.json", ".env.example", "README.md", "AGENTS.md"]) {
  record(await exists(file), file);
}

const envExample = (await readFile(".env.example", "utf8").catch(() => ""));
for (const expected of ["gpt-realtime-whisper", "gpt-realtime-2", "gpt-realtime-translate"]) {
  record(envExample.includes(expected), `.env.example includes ${expected}`);
}

for (const ignored of [".data", ".env.local", ".next", "node_modules"]) {
  record(gitCheckIgnore(ignored), `${ignored} is gitignored`);
}

const status = spawnSync("git", ["status", "--short", "--ignored"], { encoding: "utf8" });
const trackedSecrets = status.stdout
  .split("\n")
  .filter((line) => /^A|^M|\?\?/.test(line))
  .filter((line) => {
    const localSecretPath = /\.data|\.env\.local|runtime-secrets/.test(line);
    return localSecretPath || line.includes(openAiKeyAssignment);
  });
record(trackedSecrets.length === 0, "No obvious tracked secrets", trackedSecrets.join("; "));

const fileList = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8"
});
const secretPattern = new RegExp(
  `(${keyPrefix}(?:proj|or)-[A-Za-z0-9_-]{20,}|${openAiKeyAssignment}(?:proj|or)-[A-Za-z0-9_-]{20,})`
);
const suspiciousFiles = [];
for (const file of fileList.stdout.split("\n").filter(Boolean)) {
  if (/\.(png|jpg|jpeg|gif|mp4|mov|webm|ico|lock)$/i.test(file)) {
    continue;
  }

  const content = await readFile(file, "utf8").catch(() => "");
  if (secretPattern.test(content)) {
    suspiciousFiles.push(file);
  }
}
record(suspiciousFiles.length === 0, "No key-looking strings in commit candidates", suspiciousFiles.join("; "));

const failed = results.filter((result) => !result.ok);
for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.label}${result.detail ? ` - ${result.detail}` : ""}`);
}

if (failed.length > 0) {
  console.error(`\nDoctor found ${failed.length} issue${failed.length === 1 ? "" : "s"}.`);
  process.exit(1);
}

console.log("\nDoctor passed.");
