import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const electronOut = path.join(root, "dist", "electron");
const releaseOut = path.join(root, "dist", "mac");
const releaseApp = path.join(releaseOut, "Mougle Studio Pro.app");
const releaseZip = path.join(releaseOut, "Mougle-Studio-Pro-mac.zip");
const releaseDmg = path.join(releaseOut, "Mougle-Studio-Pro.dmg");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith(".app")) out.push(full);
      else out.push(...walk(full));
    }
  }
  return out;
}

function findFile(dir: string, ext: string): string | null {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, ext);
      if (found) return found;
    } else if (entry.name.endsWith(ext)) {
      return full;
    }
  }
  return null;
}

function dittoCopy(src: string, dest: string) {
  fs.rmSync(dest, { recursive: true, force: true });
  execFileSync("/usr/bin/ditto", [src, dest], { stdio: "inherit" });
}

const builtApp = walk(electronOut).find((p) => path.basename(p) === "Mougle Studio Pro.app");
if (!builtApp) {
  throw new Error(`Electron app not found under ${electronOut}`);
}

fs.rmSync(releaseOut, { recursive: true, force: true });
fs.mkdirSync(releaseOut, { recursive: true });
dittoCopy(builtApp, releaseApp);
fs.rmSync(path.join(releaseApp, "Contents", "Resources", "app-update.yml"), { force: true });

fs.rmSync(releaseZip, { force: true });
execFileSync(
  "/usr/bin/ditto",
  ["-c", "-k", "--norsrc", "--keepParent", "Mougle Studio Pro.app", "Mougle-Studio-Pro-mac.zip"],
  { cwd: releaseOut, stdio: "inherit" },
);

const dmg = findFile(electronOut, ".dmg");
if (dmg) {
  fs.copyFileSync(dmg, releaseDmg);
}

fs.writeFileSync(path.join(releaseOut, "README_INSTALL_MAC.md"), `# Mougle Studio Pro v0.2.0 — Mac Install Guide

## Install From ZIP

Unzip:

\`\`\`bash
unzip Mougle-Studio-Pro-mac.zip
\`\`\`

Open:

\`\`\`text
Mougle Studio Pro.app
\`\`\`

If macOS blocks the unsigned app, Control-click the app, choose Open, then confirm Open. Only do this for a package from your own Mougle workspace.

## DMG

Run \`npm run mac:dist\` to attempt a DMG build. Some sandboxed macOS environments cannot create disk images and will fall back to the native \`.app\` plus ZIP release.

## Configure API

Open Settings and set Mougle API Base URL. For local testing use:

\`\`\`text
http://127.0.0.1:5001
\`\`\`

## Cinema 4D Downloads

Open Cinema 4D Studio, enter a draft room ID, then use Download Cinema 4D Script or Download Production Package ZIP.

## Safety

This app is a controller/preview app only. It does not enable real Unreal execution, real Cinema 4D rendering, Movie Render Queue, Sequencer, real 4D hardware, or publishing.
`);

fs.writeFileSync(path.join(releaseOut, "RELEASE_NOTES.md"), `# Mougle Studio Pro v0.2.0

## Native Electron Status

This release packages Mougle Studio Pro as a real Electron macOS application using BrowserWindow. It no longer launches a raw browser page for the packaged app.

## Implemented Modules

- Dashboard
- Production Preview Studio
- Cinema 4D Studio
- Newsroom Creator
- Podcast Room Creator
- Avatar Studio
- Media Package Studio
- Unreal Dry-Run Studio
- 4D Sandbox Studio
- Settings

## Safety Guarantees

No real Unreal execution, real Cinema 4D rendering, Movie Render Queue, Sequencer start, real 4D hardware, publishing, YouTube upload, social posting, or live streaming is enabled.

## Known Limitations

The app is unsigned and not notarized. DMG creation depends on local electron-builder support.
`);

console.log(`Native Electron app: ${releaseApp}`);
console.log(`Release ZIP: ${releaseZip}`);
if (fs.existsSync(releaseDmg)) console.log(`Release DMG: ${releaseDmg}`);
