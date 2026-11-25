/**
 * Generate Rent Management implementation report PDF into rent managment/
 * Run: npx tsx scripts/generate-rent-management-report-pdf.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "rent managment");
const htmlPath = path.join(outDir, "RENT_MANAGEMENT_IMPLEMENTATION_REPORT.html");
const outPdf = path.join(outDir, "RENT_MANAGEMENT_IMPLEMENTATION_REPORT.pdf");

function findChrome(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    const fromPuppeteer = execSync(
      `node -e "try{console.log(require('puppeteer').executablePath())}catch(e){}"`,
      { encoding: "utf8", cwd: root },
    ).trim();
    if (fromPuppeteer && fs.existsSync(fromPuppeteer)) return fromPuppeteer;
  } catch {
    /* ignore */
  }
  return undefined;
}

async function main() {
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Missing HTML report at ${htmlPath}`);
  }
  const html = fs.readFileSync(htmlPath, "utf8");
  const executablePath = findChrome();

  let browser;
  if (executablePath) {
    const puppeteerCore = await import("puppeteer-core");
    browser = await puppeteerCore.default.launch({
      headless: true,
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  } else {
    const puppeteer = await import("puppeteer");
    browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: outPdf,
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" },
    });
  } finally {
    await browser.close();
  }

  console.log(`Wrote ${outPdf}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
