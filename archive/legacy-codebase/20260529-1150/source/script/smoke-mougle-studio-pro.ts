import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const releaseDir = path.join(root, "dist", "mac");
const appDir = path.join(releaseDir, "Mougle Studio Pro.app");
const zipPath = path.join(releaseDir, "Mougle-Studio-Pro-mac.zip");
const resourcesApp = path.join(appDir, "Contents", "Resources", "app");
const indexHtml = path.join(resourcesApp, "dist", "mougle-studio-pro", "index.html");
const assetsDir = path.join(resourcesApp, "dist", "mougle-studio-pro", "assets");
const mainFile = path.join(resourcesApp, "electron", "main.cjs");
const preloadFile = path.join(resourcesApp, "electron", "preload.cjs");
const packageMeta = path.join(resourcesApp, "package.json");
const macBinary = path.join(appDir, "Contents", "MacOS", "Mougle Studio Pro");
const nodeModulesDir = path.join(resourcesApp, "node_modules");

function ok(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function exists(file: string, message: string) {
  ok(fs.existsSync(file), `${message}: ${file}`);
}

exists(appDir, "app package missing");
exists(zipPath, "release zip missing");
exists(indexHtml, "built index.html missing");
exists(assetsDir, "assets directory missing");
exists(mainFile, "Electron main file missing");
exists(preloadFile, "Electron preload file missing");
exists(packageMeta, "package metadata missing");
exists(macBinary, "macOS executable missing");
ok(!fs.existsSync(nodeModulesDir), "packaged app must not include node_modules");

const assets = fs.readdirSync(assetsDir);
ok(assets.some((name) => name.endsWith(".js")), "built JS asset missing");
ok(assets.some((name) => name.endsWith(".css")), "built CSS asset missing");

const index = fs.readFileSync(indexHtml, "utf8");
ok(!index.includes('src="/assets/'), "index.html uses absolute /assets path");
ok(!index.includes('href="/assets/'), "index.html uses absolute /assets stylesheet path");
ok(index.includes("./assets/"), "index.html should use relative ./assets paths for file://");

const main = fs.readFileSync(mainFile, "utf8");
ok(main.includes("new BrowserWindow"), "BrowserWindow config missing");
ok(main.includes("loadFile(resolveBuiltIndexHtml())"), "production loadFile missing");
ok(main.includes("loadURL(devUrl)"), "dev loadURL missing");
ok(main.includes("contextIsolation: true"), "contextIsolation must be true");
ok(main.includes("nodeIntegration: false"), "nodeIntegration must be false");
ok(!main.includes('open "$APP_DIR/index.html"'), "fake browser launcher detected");

const preload = fs.readFileSync(preloadFile, "utf8");
ok(preload.includes("contextBridge.exposeInMainWorld"), "safe preload bridge missing");
ok(!preload.includes('require("node:fs")') && !preload.includes("require('node:fs')"), "preload must not expose raw filesystem access");

const binaryHead = fs.readFileSync(macBinary).subarray(0, 256).toString("utf8");
ok(!binaryHead.includes("open ") && !binaryHead.includes("index.html"), "Mac executable is a browser-opening shell script, not Electron");

const zipList = execFileSync("unzip", ["-Z1", zipPath], {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});
ok(zipList.includes("Mougle Studio Pro.app/Contents/MacOS/Mougle Studio Pro"), "ZIP does not contain native app executable");
ok(zipList.includes("Mougle Studio Pro.app/Contents/Resources/app/dist/mougle-studio-pro/index.html"), "ZIP does not contain built app index");
ok(!/\.env|node_modules|client\/public\/downloads|DATABASE_URL|OPENAI_API_KEY|ELEVENLABS|MESHY|RUNWAY|RAZORPAY|secret|api[_-]?key/i.test(zipList), "ZIP includes forbidden secret or bulky paths");

console.log("Mougle Studio Pro mac smoke passed.");
console.log(`App: ${appDir}`);
console.log(`ZIP: ${zipPath}`);
