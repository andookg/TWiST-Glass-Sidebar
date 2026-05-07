import { spawn } from "node:child_process";
import { access, copyFile, mkdir } from "node:fs/promises";
import { constants } from "node:fs";

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(".env.local")) && (await exists(".env.example"))) {
  await copyFile(".env.example", ".env.local");
  console.log("Created .env.local from .env.example.");
}

await mkdir(".data", { recursive: true, mode: 0o700 });

console.log("Starting TWiST Glass Sidebar on http://127.0.0.1:3000");
console.log("Press Ctrl+C to stop.");

const child = spawn("npm", ["run", "dev:local"], {
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
