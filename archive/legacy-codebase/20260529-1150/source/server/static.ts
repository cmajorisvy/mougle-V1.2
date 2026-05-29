import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist — except for /api,
  // where missing handlers must return JSON 404 (not the SPA shell).
  app.use("/{*path}", (req, res) => {
    if (req.originalUrl.startsWith("/api/") || req.originalUrl === "/api") {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
