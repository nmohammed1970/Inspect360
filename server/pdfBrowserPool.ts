/**
 * Shared Puppeteer/Chromium browser for PDF generation.
 * Reuses one browser process across requests; each job gets a fresh page.
 */
import chromium from "@sparticuz/chromium";
import puppeteerCore from "puppeteer-core";
import puppeteer from "puppeteer";

const isReplit = process.env.REPL_ID || process.env.REPLIT;
const isServerless = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL || process.env.NETLIFY;
const isDocker =
  process.env.RUNNING_IN_DOCKER === "true" ||
  process.env.USE_SPARTICUZ_CHROMIUM === "true";
const useSparticuz = !!(isReplit || isServerless || isDocker);

type AnyBrowser = {
  newPage: () => Promise<AnyPage>;
  close: () => Promise<void>;
  isConnected?: () => boolean;
  connected?: boolean;
  on?: (event: string, handler: (...args: any[]) => void) => void;
};

type AnyPage = {
  setContent: (html: string, options?: Record<string, unknown>) => Promise<void>;
  pdf: (options: Record<string, unknown>) => Promise<Uint8Array>;
  evaluate: (fn: (...args: any[]) => any, ...args: any[]) => Promise<unknown>;
  close: () => Promise<void>;
};

let browserPromise: Promise<AnyBrowser> | null = null;
let launching: Promise<AnyBrowser> | null = null;

async function launchBrowser(): Promise<AnyBrowser> {
  if (useSparticuz) {
    const executablePath = await chromium.executablePath();
    return (await puppeteerCore.launch({
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
      executablePath,
      headless: true,
    })) as unknown as AnyBrowser;
  }

  return (await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--disable-gpu",
    ],
    headless: true,
  })) as unknown as AnyBrowser;
}

function isBrowserAlive(browser: AnyBrowser): boolean {
  try {
    if (typeof browser.isConnected === "function") return browser.isConnected();
    if (typeof browser.connected === "boolean") return browser.connected;
    return true;
  } catch {
    return false;
  }
}

export async function getPdfBrowser(): Promise<AnyBrowser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (isBrowserAlive(existing)) return existing;
    } catch {
      // fall through and relaunch
    }
    browserPromise = null;
  }

  if (!launching) {
    launching = launchBrowser()
      .then((browser) => {
        browser.on?.("disconnected", () => {
          browserPromise = null;
        });
        browserPromise = Promise.resolve(browser);
        launching = null;
        console.log("[PDF] Chromium browser pool ready");
        return browser;
      })
      .catch((err) => {
        launching = null;
        browserPromise = null;
        throw err;
      });
  }

  return launching;
}

/**
 * Run work on a dedicated page, then close the page (browser stays warm).
 */
export async function withPdfPage<T>(fn: (page: AnyPage) => Promise<T>): Promise<T> {
  const browser = await getPdfBrowser();
  const page = await browser.newPage();
  try {
    return await fn(page);
  } finally {
    await page.close().catch((err) => {
      console.warn("[PDF] Failed to close page:", err);
    });
  }
}

/** Test helper / graceful shutdown. */
export async function closePdfBrowserPool(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  launching = null;
  if (!pending) return;
  try {
    const browser = await pending;
    await browser.close();
  } catch {
    // ignore
  }
}
