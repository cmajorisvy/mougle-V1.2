import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const mode = process.argv[2] === "dist" ? "dist" : "package";
const builderBin = path.join(root, "node_modules", ".bin", "electron-builder");
const electronOut = path.join(root, "dist", "electron");

function removeByExt(dir: string, ext: string) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) removeByExt(full, ext);
    else if (entry.name.endsWith(ext)) fs.rmSync(full, { force: true });
  }
}

function runBuilder(targets: string[]) {
  return spawnSync(
    builderBin,
    [
      "--config",
      "apps/mougle-studio-pro/electron-builder.yml",
      "--mac",
      ...targets,
      "--publish",
      "never",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        ELECTRON_CACHE: path.join(root, ".cache", "electron"),
        ELECTRON_BUILDER_CACHE: path.join(root, ".cache", "electron-builder"),
      },
      stdio: "inherit",
    },
  );
}

if (mode === "package") {
  const result = runBuilder(["dir", "zip"]);
  process.exit(result.status ?? 1);
}

const dmgResult = runBuilder(["dir", "zip", "dmg"]);
if (dmgResult.status === 0) process.exit(0);

console.warn("DMG build unavailable in this environment; falling back to native .app + ZIP.");
removeByExt(electronOut, ".dmg");
removeByExt(electronOut, ".dmg.blockmap");

const fallbackResult = runBuilder(["dir", "zip"]);
process.exit(fallbackResult.status ?? 1);
