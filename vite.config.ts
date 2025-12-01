import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Ensure relative paths in build output (not absolute)
    rollupOptions: {
      output: {
        // Use relative paths for all assets
        assetFileNames: 'assets/[name].[hash][extname]',
        chunkFileNames: 'assets/[name].[hash].js',
        entryFileNames: 'assets/[name].[hash].js',
      },
    },
  },
  server: {
    fs: {
      // Less strict to allow workspace setups and sibling projects
      strict: false,
      deny: ["**/.*"],
      // Explicitly allow the sibling Inspect360 directory
      allow: [
        path.resolve(import.meta.dirname),
        path.resolve(import.meta.dirname, "..", "Inspect360"),
      ],
    },
    hmr: process.env.NODE_ENV === 'development' ? {
      // Fix WebSocket connection issues in development
      protocol: 'ws',
      host: 'localhost',
      // Use PORT from env or default to 5000/5005
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
      overlay: false, // Disable error overlay
    } : undefined,
  },
  optimizeDeps: {
    // Force re-optimization on dependency changes
    force: false,
    // Exclude problematic dependencies from pre-bundling if needed
    exclude: [],
    // Include dependencies that need pre-bundling
    include: [],
  },
});
