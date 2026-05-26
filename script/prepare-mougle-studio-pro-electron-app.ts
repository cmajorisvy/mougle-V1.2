import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const webDist = path.join(root, "dist", "mougle-studio-pro");
const shellDir = path.join(root, "apps", "mougle-studio-pro", "electron");
const appDir = path.join(root, "dist", "mougle-studio-pro-electron-app");
const electronOut = path.join(root, "dist", "electron");

function assertExists(target: string, label: string) {
  if (!fs.existsSync(target)) {
    throw new Error(`${label} missing: ${target}`);
  }
}

assertExists(webDist, "Mougle Studio Pro web build");
assertExists(path.join(webDist, "index.html"), "Mougle Studio Pro index.html");
assertExists(shellDir, "Electron shell directory");
assertExists(path.join(shellDir, "main.cjs"), "Electron main process");
assertExists(path.join(shellDir, "preload.cjs"), "Electron preload bridge");

fs.rmSync(appDir, { recursive: true, force: true });
fs.rmSync(electronOut, { recursive: true, force: true });
fs.mkdirSync(path.join(appDir, "electron"), { recursive: true });
fs.mkdirSync(path.join(appDir, "dist"), { recursive: true });

fs.cpSync(shellDir, path.join(appDir, "electron"), {
  recursive: true,
  filter: (src) => !src.includes(`${path.sep}node_modules${path.sep}`),
});
fs.cpSync(webDist, path.join(appDir, "dist", "mougle-studio-pro"), {
  recursive: true,
});

fs.writeFileSync(
  path.join(appDir, "package.json"),
  `${JSON.stringify(
    {
      name: "mougle-studio-pro",
      version: "0.2.0",
      private: true,
      description: "Mougle Studio Pro native Electron controller and preview app.",
      main: "electron/main.cjs",
      license: "UNLICENSED",
      dependencies: {},
      devDependencies: {},
    },
    null,
    2,
  )}\n`,
);

console.log(`Prepared clean Electron app payload: ${appDir}`);
