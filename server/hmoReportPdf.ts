import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** Minimal HMO assessment summary PDF via shared report patterns. */
export async function buildHmoAssessmentPdf(params: {
  propertyAddress: string;
  overallStatus: string;
  evidenceCompleteness: number;
  findings: Array<{ checkId: string; status: string; severity: string; reason?: string }>;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 800;
  const draw = (text: string, size = 11, useBold = false) => {
    page.drawText(text.slice(0, 100), {
      x: 40,
      y,
      size,
      font: useBold ? bold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= size + 6;
  };
  draw("HMO Compliance Assessment", 16, true);
  draw(`Property: ${params.propertyAddress}`);
  draw(`Overall status: ${params.overallStatus}`);
  draw(`Evidence completeness: ${params.evidenceCompleteness}%`);
  draw("Findings", 13, true);
  for (const f of params.findings.slice(0, 40)) {
    draw(`${f.checkId} · ${f.severity} · ${f.status}`);
    if (f.reason) draw(`  ${f.reason}`, 9);
    if (y < 60) break;
  }
  return doc.save();
}
