import { access, rename, rm } from "node:fs/promises";
import { spawn } from "node:child_process";

const apiDirectory = "app/api";
const hiddenApiDirectory = ".api-sites-build";

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

if (await exists(hiddenApiDirectory)) {
  throw new Error(`${hiddenApiDirectory} already exists; restore or remove it before building.`);
}

await rename(apiDirectory, hiddenApiDirectory);
try {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], {
    env: { ...process.env, SITES_EXPORT: "1" },
    stdio: "inherit",
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`Sites build failed with exit code ${exitCode}.`);
} finally {
  await rename(hiddenApiDirectory, apiDirectory);
}

await rm("dist", { recursive: true, force: true });
await rename("out", "dist");
console.log("Sites static output is ready in dist/.");
