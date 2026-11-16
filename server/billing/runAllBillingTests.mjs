/**
 * Runs all automated billing test scripts and prints an execution report.
 * Usage: node server/billing/runAllBillingTests.mjs
 *    or: npm run test:billing:all
 */
import { spawnSync } from "child_process";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const suites = [
  {
    id: "FIN-UNIT",
    name: "Financial math (photos, SMS, 10×, floor, proration, readonly, freeze)",
    phase: "A/C/E",
    cmd: ["npx", "tsx", "shared/billingFinancialMath.test.ts"],
  },
  {
    id: "CAT-UNIT",
    name: "Catalog validation core",
    phase: "A",
    cmd: ["npx", "tsx", "server/billing/catalogValidation.test.ts"],
  },
  {
    id: "CAT-BOUND",
    name: "Catalog validation boundaries + seed",
    phase: "A",
    cmd: ["npx", "tsx", "server/billing/catalogValidation.boundaries.test.ts"],
  },
  {
    id: "WH-IDEM",
    name: "Webhook idempotency / duplicate / recovery",
    phase: "B",
    cmd: ["npx", "tsx", "server/billing/webhookIdempotency.test.ts"],
  },
  {
    id: "WF-GUARD",
    name: "Workflow guards (capture, evidence, authz, freeze)",
    phase: "C/E/F",
    cmd: ["npx", "tsx", "server/billing/billingWorkflow.guards.test.ts"],
  },
  {
    id: "ENT",
    name: "Entitlement + zero-credit capture",
    phase: "C",
    cmd: ["npx", "tsx", "shared/entitlement.test.ts"],
  },
];

const results = [];

for (const suite of suites) {
  const started = Date.now();
  const run = spawnSync(suite.cmd[0], suite.cmd.slice(1), {
    cwd: root,
    encoding: "utf8",
    shell: true,
    env: process.env,
  });
  const ok = run.status === 0;
  results.push({
    id: suite.id,
    name: suite.name,
    phase: suite.phase,
    result: ok ? "passed" : "failed",
    ms: Date.now() - started,
    exitCode: run.status,
    tail: (run.stdout || run.stderr || "").trim().split("\n").slice(-5).join("\n"),
  });
  console.log(`${ok ? "PASS" : "FAIL"} ${suite.id} (${suite.phase}) — ${suite.name}`);
  if (!ok) {
    console.log(run.stdout || "");
    console.log(run.stderr || "");
  }
}

const passed = results.filter((r) => r.result === "passed").length;
const failed = results.filter((r) => r.result === "failed").length;

const manualUntested = [
  "M1 Amounts vs Stripe confirmed transaction",
  "M2 Credit ledger vs payment/usage events",
  "M3 Duplicate Stripe webhook resend",
  "M4 Delayed/out-of-order webhook",
  "M5 Zero-credit offline capture E2E",
  "M6 Cross-tenant isolation live",
  "M7 Price freeze after publish live",
  "E2E full Checkout → trial credits journey",
  "E2E payment failure → read_only after 7 days",
  "E2E concurrent consume race",
];

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    automatedPassed: passed,
    automatedFailed: failed,
    blocked: 0,
    manualUntested: manualUntested.length,
  },
  automated: results,
  manualUntested: manualUntested.map((name) => ({
    name,
    result: "untested",
    type: "manual",
  })),
  notes: [
    "Happy-path alone is insufficient — see server/billing/TEST_PLAN.md",
    "Stripe-dependent and Contabo-live scenarios remain manual until test-mode E2E harness exists",
  ],
};

const outPath = path.join(__dirname, "TEST_EXECUTION_REPORT.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));

const md = [
  "# Billing test execution report",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  `**Automated:** ${passed} passed, ${failed} failed, 0 blocked`,
  `**Manual / E2E untested:** ${manualUntested.length} (see TEST_PLAN.md)`,
  "",
  "| ID | Phase | Suite | Result | ms |",
  "|----|-------|-------|--------|----|",
  ...results.map(
    (r) => `| ${r.id} | ${r.phase} | ${r.name} | **${r.result}** | ${r.ms} |`,
  ),
  "",
  "## Untested (manual — do not skip)",
  ...manualUntested.map((n) => `- [ ] ${n}`),
  "",
];
writeFileSync(path.join(__dirname, "TEST_EXECUTION_REPORT.md"), md.join("\n"));

console.log("\n=== EXECUTION SUMMARY ===");
console.log(`Passed: ${passed}  Failed: ${failed}  Blocked: 0  Untested(manual): ${manualUntested.length}`);
console.log(`Wrote ${outPath}`);
console.log(`Wrote ${path.join(__dirname, "TEST_EXECUTION_REPORT.md")}`);

process.exit(failed > 0 ? 1 : 0);
