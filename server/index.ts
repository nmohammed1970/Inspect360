import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// CORS middleware - Allow requests from Expo dev server and mobile apps
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;

  // Allow requests from Expo dev server (localhost:8081) and other common dev origins
  const allowedOrigins = [
    'http://localhost:8081',
    'http://localhost:19006',
    'http://localhost:19000',
    'http://localhost:5005',
    'http://localhost:5000',
  ];

  // In development, allow any localhost origin
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isAllowed = isDevelopment
    ? (origin?.includes('localhost') || origin?.includes('127.0.0.1') || !origin)
    : allowedOrigins.includes(origin || '');

  if (isAllowed || !origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Cache-Control, Pragma, Expires');
    res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie');
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Use JSON parser for all routes except Stripe webhook which needs raw body
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhooks/stripe') {
    next();
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
