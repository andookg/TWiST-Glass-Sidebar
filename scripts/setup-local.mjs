import { access, copyFile, mkdir, stat } from "node:fs/promises";
import { constants } from "node:fs";

const checks = [];

function pass(label, detail = "") {
  checks.push({ ok: true, label, detail });
}

function warn(label, detail = "") {
  checks.push({ ok: false, label, detail });
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const major = Number(process.versions.node.split(".")[0]);
if (major >= 20) {
  pass("Node version", process.versions.node);
} else {
  warn("Node version", `Expected >=20.11, got ${process.versions.node}`);
}

if (!(await exists(".env.example"))) {
  warn(".env.example", "Missing template file.");
} else if (!(await exists(".env.local"))) {
  await copyFile(".env.example", ".env.local");
  pass(".env.local", "Created from .env.example.");
} else {
  pass(".env.local", "Already exists.");
}

await mkdir(".data", { recursive: true, mode: 0o700 });
const dataStat = await stat(".data");
pass(".data", dataStat.isDirectory() ? "Ready for local runtime secrets and memory." : "Created.");

console.log("TWiST Glass Sidebar setup");
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "WARN"} ${check.label}${check.detail ? ` - ${check.detail}` : ""}`);
}

console.log("\nNext steps:");
console.log("1. Add OPENAI_API_KEY to .env.local or paste it in the in-app Setup panel.");
console.log("2. Run npm run dev:local or npm run activate.");
console.log("3. Open http://127.0.0.1:3000.");
