import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./static";

const app = express();

// Required behind Caddy (or any reverse proxy) so secure cookies and
// req.protocol / X-Forwarded-Proto behave correctly over HTTPS.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, service: "inspect360" });
});

// CORS middleware - Allow requests from Expo dev server and mobile apps
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;

  const envOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (process.env.BASE_URL) {
    envOrigins.push(process.env.BASE_URL.replace(/\/$/, ""));
  }

  // Allow requests from Expo dev server (localhost:8081) and other common dev origins
  const allowedOrigins = [
    "http://localhost:8081",
    "http://localhost:19006",
    "http://localhost:19000",
    "http://localhost:5005",
    "http://localhost:5000",
    "https://portal.inspect360.ai",
    ...envOrigins,
  ];

  // In development, allow any localhost origin, local network IPs, or requests without origin (mobile apps)
  const isDevelopment = process.env.NODE_ENV === "development";
  const isLocalhost = origin?.includes("localhost") || origin?.includes("127.0.0.1");
  const isLocalNetwork = isDevelopment && origin && /^http:\/\/192\.168\.\d+\.\d+/.test(origin);
  const isAllowed = isDevelopment
    ? isLocalhost || isLocalNetwork || !origin
    : !origin || allowedOrigins.includes(origin);

  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Cache-Control, Pragma, Expires");
    res.setHeader("Access-Control-Expose-Headers", "Set-Cookie, ETag");
  }

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// Use JSON parser for all routes except Stripe webhook which needs raw body
// Increase limit for transcribe-base64 (base64 audio can be ~35MB for 25MB audio)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhooks/stripe') {
    next();
  } else if (req.path === '/api/audio/transcribe-base64' || req.path === '/api/objects/upload-audio-base64') {
    express.json({ limit: '35mb' })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    const startTime = Date.now();
    console.log("🚀 Starting server...");

    const routesStartTime = Date.now();
    const server = await registerRoutes(app);
    const routesTime = Date.now() - routesStartTime;
    console.log(`✅ Routes registered successfully (took ${routesTime}ms)`);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    const viteStartTime = Date.now();
    if (app.get("env") === "development") {
      // Dynamic import keeps vite out of the production Docker image
      const { setupVite } = await import("./vite");
      await setupVite(app, server);
      console.log(`✅ Vite setup completed (took ${Date.now() - viteStartTime}ms)`);
    } else {
      serveStatic(app);
      console.log(`✅ Static files served (took ${Date.now() - viteStartTime}ms)`);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5005;
    // Use 0.0.0.0 to allow access from other devices on the same network (e.g., mobile phones)
    const host = process.env.HOST || "0.0.0.0";

    // Setup monthly reset scheduler
    // Check if scheduler should be enabled (can be disabled via env var for testing)
    if (process.env.ENABLE_MONTHLY_RESET_SCHEDULER !== "false") {
      try {
        // Use setInterval to check for subscriptions that need reset daily
        // This is more reliable than cron in serverless environments
        const checkInterval = 24 * 60 * 60 * 1000; // 24 hours
        const { monthlyResetService } = await import("./monthlyResetService");
        
        // Run immediately on startup to catch any missed resets
        setImmediate(async () => {
          try {
            console.log("[Scheduler] Running initial monthly reset check...");
            const result = await monthlyResetService.processMonthlyResets();
            console.log(`[Scheduler] Initial check complete: ${result.processed} processed, ${result.errors} errors`);
          } catch (error) {
            console.error("[Scheduler] Error in initial monthly reset check:", error);
          }
        });

        // Schedule daily checks
        setInterval(async () => {
          try {
            console.log("[Scheduler] Running scheduled monthly reset check...");
            const result = await monthlyResetService.processMonthlyResets();
            console.log(`[Scheduler] Scheduled check complete: ${result.processed} processed, ${result.errors} errors`);
          } catch (error) {
            console.error("[Scheduler] Error in scheduled monthly reset check:", error);
          }
        }, checkInterval);

        console.log("✅ Monthly reset scheduler initialized (runs daily)");
      } catch (error) {
        console.error("❌ Failed to initialize monthly reset scheduler:", error);
        // Don't fail server startup if scheduler fails
      }
    } else {
      console.log("⚠️ Monthly reset scheduler disabled (ENABLE_MONTHLY_RESET_SCHEDULER=false)");
    }

    // Use traditional listen format for better Windows compatibility
    // Windows doesn't support reusePort option
    const totalStartupTime = Date.now() - startTime;
    if (process.platform === "win32") {
      server.listen(port, host, () => {
        log(`serving on http://${host}:${port}`);
        console.log(`✅ Server started successfully on http://${host}:${port} (total startup: ${totalStartupTime}ms)`);
      });
    } else {
      // Unix systems can use the options object with reusePort
      server.listen({
        port,
        host,
        reusePort: true,
      }, () => {
        log(`serving on http://${host}:${port}`);
        console.log(`✅ Server started successfully on http://${host}:${port} (total startup: ${totalStartupTime}ms)`);
      });
    }
  } catch (error) {
    console.error("❌ Fatal error during server startup:", error);
    process.exit(1);
  }
})();
