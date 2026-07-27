import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function serveStatic(app: Express) {
  // Bundled entry is /app/dist/index.js → static files in /app/dist/public
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    const altPath = path.resolve(import.meta.dirname, "..", "dist", "public");
    if (!fs.existsSync(altPath)) {
      throw new Error(
        `Could not find the build directory: ${distPath} (or ${altPath}). Run 'npm run build' first.`,
      );
    }
    app.use(express.static(altPath));
    app.use("*", (_req, res) => {
      res.sendFile(path.resolve(altPath, "index.html"));
    });
    return;
  }

  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
