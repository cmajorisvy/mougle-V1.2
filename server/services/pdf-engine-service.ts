import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { storage } from "../storage";
import type { ProjectBlueprint } from "./project-pipeline-service";
import { generateUniqueName, isNameGeneric, uniquePdfFileName } from "./product-naming-service";

const PDF_DIR = path.join(process.cwd(), "generated_pdfs");

if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

const COLORS = {
  primary: "#1a1a2e",
  secondary: "#16213e",
  accent: "#0f3460",
  highlight: "#e94560",
  text: "#333333",
  textLight: "#666666",
  white: "#ffffff",
  border: "#e0e0e0",
  sectionBg: "#f8f9fa",
};

function addHeader(doc: PDFKit.PDFDocument, text: string, level: 1 | 2 | 3 = 1) {
  const sizes = { 1: 22, 2: 16, 3: 13 };
  const colors = { 1: COLORS.primary, 2: COLORS.accent, 3: COLORS.text };

  if (level === 1) {
    doc.moveDown(0.5);
    doc.rect(doc.x, doc.y, 500, 2).fill(COLORS.highlight);
    doc.moveDown(0.3);
  }

  doc.fontSize(sizes[level])
    .fillColor(colors[level])
    .font("Helvetica-Bold")
    .text(text, { align: "left" });

  doc.moveDown(0.3);
  doc.font("Helvetica").fillColor(COLORS.text).fontSize(10);
}

function addBody(doc: PDFKit.PDFDocument, text: string) {
  doc.fontSize(10)
    .fillColor(COLORS.text)
    .font("Helvetica")
    .text(text, { align: "left", lineGap: 3 });
  doc.moveDown(0.5);
}

function addBullet(doc: PDFKit.PDFDocument, text: string) {
  doc.fontSize(10)
    .fillColor(COLORS.text)
    .font("Helvetica")
    .text(`  •  ${text}`, { indent: 10, lineGap: 2 });
}

function checkPageBreak(doc: PDFKit.PDFDocument, needed: number = 100) {
  if (doc.y + needed > doc.page.height - 80) {
    doc.addPage();
  }
}

function addCoverPage(doc: PDFKit.PDFDocument, title: string, description: string, metadata: ProjectBlueprint["metadata"]) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.primary);

  doc.rect(40, 200, doc.page.width - 80, 4).fill(COLORS.highlight);

  doc.fontSize(32)
    .fillColor(COLORS.white)
    .font("Helvetica-Bold")
    .text(title, 50, 230, { width: doc.page.width - 100, align: "center" });

  doc.moveDown(1);
  doc.fontSize(14)
    .fillColor("#aaaacc")
    .font("Helvetica")
    .text(description, 50, doc.y, { width: doc.page.width - 100, align: "center" });

  doc.rect(40, doc.y + 20, doc.page.width - 80, 2).fill(COLORS.highlight);

  doc.moveDown(3);
  doc.fontSize(11)
    .fillColor("#8888aa")
    .font("Helvetica");

  const details = [
    `Generated: ${new Date(metadata.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    `Source Debate ID: ${metadata.debateId}`,
    `Debate Rounds: ${metadata.totalRounds}`,
    `Participants: ${metadata.participantCount}`,
    `Consensus Score: ${(metadata.consensusScore * 100).toFixed(0)}%`,
  ];

  details.forEach(d => {
    doc.text(d, 50, doc.y, { width: doc.page.width - 100, align: "center" });
    doc.moveDown(0.3);
  });

  doc.moveDown(4);
  doc.fontSize(10)
    .fillColor("#666688")
    .text("Powered by Mougle Intelligence Platform", 50, doc.y, { width: doc.page.width - 100, align: "center" });
  doc.text("www.mougle.com", { align: "center" });

  doc.addPage();
}

function addTableOfContents(doc: PDFKit.PDFDocument, sections: string[]) {
  addHeader(doc, "Table of Contents", 1);
  doc.moveDown(0.5);

  sections.forEach((section, i) => {
    doc.fontSize(11)
      .fillColor(COLORS.accent)
      .font("Helvetica")
      .text(`${i + 1}.  ${section}`, { indent: 10 });
    doc.moveDown(0.3);
  });

  doc.addPage();
}

function addFooter(doc: PDFKit.PDFDocument) {
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8)
      .fillColor(COLORS.textLight)
      .text(
        `Page ${i + 1} of ${pages.count}  |  Mougle Project Blueprint  |  Confidential`,
        50,
        doc.page.height - 40,
        { width: doc.page.width - 100, align: "center" }
      );
  }
}

export async function generatePDF(projectId: string): Promise<{ filePath: string; pages: number; packageId: string }> {
  const project = await storage.getProject(projectId);
  if (!project) throw new Error("Project not found");
  if (!project.blueprintJson) throw new Error("Project has no blueprint - generate one first");

  const blueprint = project.blueprintJson as unknown as ProjectBlueprint;
  let bundleName = project.title || "";
  if (!bundleName || isNameGeneric(bundleName)) {
    bundleName = await generateUniqueName({
      niche: project.projectType || project.topicSlug || "general",
      exists: async (_name, slug) => {
        return fs.existsSync(path.join(PDF_DIR, `${slug}.pdf`));
      },
    });
  }
  const fileName = await uniquePdfFileName(PDF_DIR, bundleName, `.pdf`);
  const filePath = path.join(PDF_DIR, fileName);

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 60, bottom: 60, left: 50, right: 50 },
    bufferPages: true,
    info: {
      Title: project.title,
      Author: "Mougle Intelligence Platform",
      Subject: project.description || "Project Blueprint",
      Creator: "Mougle PDF Engine",
    },
  });

  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  addCoverPage(doc, project.title, project.description || "", blueprint.metadata);

  const tocSections = [
    "Executive Summary",
    "Problem Statement",
    "Research Findings",
    "Evidence Analysis",
    "Solution Design",
    "Feasibility Analysis",
    "Financial Model",
    "Risk Assessment",
    "Implementation Plan",
    "Conclusion",
  ];
  addTableOfContents(doc, tocSections);

  addHeader(doc, "1. Executive Summary", 1);
  addBody(doc, blueprint.executiveSummary);

  checkPageBreak(doc, 150);
  addHeader(doc, "2. Problem Statement", 1);
  addBody(doc, blueprint.problemStatement);

  checkPageBreak(doc, 150);
  addHeader(doc, "3. Research Findings", 1);
  if (blueprint.researchFindings && blueprint.researchFindings.length > 0) {
    blueprint.researchFindings.forEach((finding, i) => {
      checkPageBreak(doc);
      addHeader(doc, `3.${i + 1} ${finding.title}`, 2);
      addBody(doc, finding.content);
      if (finding.subsections) {
        finding.subsections.forEach(sub => {
          checkPageBreak(doc);
          addHeader(doc, sub.title, 3);
          addBody(doc, sub.content);
        });
      }
    });
  }

  checkPageBreak(doc, 150);
  addHeader(doc, "4. Evidence Analysis", 1);
  if (blueprint.evidenceAnalysis && blueprint.evidenceAnalysis.length > 0) {
    blueprint.evidenceAnalysis.forEach((ev, i) => {
      checkPageBreak(doc);
      addHeader(doc, `4.${i + 1} ${ev.title}`, 2);
      addBody(doc, ev.content);
    });
  }

  checkPageBreak(doc, 150);
  addHeader(doc, "5. Solution Design", 1);
  if (blueprint.solutionDesign && blueprint.solutionDesign.length > 0) {
    blueprint.solutionDesign.forEach((sol, i) => {
      checkPageBreak(doc);
      addHeader(doc, `5.${i + 1} ${sol.title}`, 2);
      addBody(doc, sol.content);
      if (sol.subsections) {
        sol.subsections.forEach(sub => {
          checkPageBreak(doc);
          addHeader(doc, sub.title, 3);
          addBody(doc, sub.content);
        });
      }
    });
  }

  checkPageBreak(doc, 200);
  addHeader(doc, "6. Feasibility Analysis", 1);
  if (blueprint.feasibilityAnalysis) {
    const fa = blueprint.feasibilityAnalysis;
    addHeader(doc, "6.1 Technical Feasibility", 2);
    addBody(doc, fa.technical);
    checkPageBreak(doc);
    addHeader(doc, "6.2 Financial Feasibility", 2);
    addBody(doc, fa.financial);
    checkPageBreak(doc);
    addHeader(doc, "6.3 Operational Feasibility", 2);
    addBody(doc, fa.operational);
    checkPageBreak(doc);
    addHeader(doc, "6.4 Timeline", 2);
    addBody(doc, fa.timeline);
  }

  checkPageBreak(doc, 200);
  addHeader(doc, "7. Financial Model", 1);
  if (blueprint.financialModel) {
    const fm = blueprint.financialModel;
    addHeader(doc, "7.1 Estimated Cost", 2);
    addBody(doc, fm.estimatedCost);
    checkPageBreak(doc);
    addHeader(doc, "7.2 Revenue Projection", 2);
    addBody(doc, fm.revenueProjection);
    checkPageBreak(doc);
    addHeader(doc, "7.3 Break-Even Analysis", 2);
    addBody(doc, fm.breakEvenAnalysis);
    checkPageBreak(doc);
    addHeader(doc, "7.4 Funding Requirements", 2);
    addBody(doc, fm.fundingRequirements);
  }

  checkPageBreak(doc, 200);
  addHeader(doc, "8. Risk Assessment", 1);
  if (blueprint.riskAssessment?.risks && blueprint.riskAssessment.risks.length > 0) {
    blueprint.riskAssessment.risks.forEach((risk, i) => {
      checkPageBreak(doc);
      const severityColor = risk.severity === "high" ? "#e94560" : risk.severity === "medium" ? "#ff9f43" : "#2ecc71";
      doc.fontSize(11)
        .fillColor(COLORS.text)
        .font("Helvetica-Bold")
        .text(`Risk ${i + 1}: ${risk.category}`, { continued: true })
        .fillColor(severityColor)
        .text(` [${risk.severity.toUpperCase()}]`);
      doc.font("Helvetica").fillColor(COLORS.text);
      doc.moveDown(0.2);
      addBody(doc, `Description: ${risk.description}`);
      addBody(doc, `Mitigation: ${risk.mitigation}`);
    });
  }

  checkPageBreak(doc, 200);
  addHeader(doc, "9. Implementation Plan", 1);
  if (blueprint.implementationPlan?.phases && blueprint.implementationPlan.phases.length > 0) {
    blueprint.implementationPlan.phases.forEach((phase, i) => {
      checkPageBreak(doc);
      addHeader(doc, `Phase ${i + 1}: ${phase.name}`, 2);
      addBody(doc, `Duration: ${phase.duration}`);

      if (phase.deliverables && phase.deliverables.length > 0) {
        doc.fontSize(11).font("Helvetica-Bold").fillColor(COLORS.text).text("Deliverables:");
        doc.font("Helvetica");
        phase.deliverables.forEach(d => addBullet(doc, d));
        doc.moveDown(0.3);
      }

      if (phase.dependencies && phase.dependencies.length > 0) {
        doc.fontSize(11).font("Helvetica-Bold").fillColor(COLORS.text).text("Dependencies:");
        doc.font("Helvetica");
        phase.dependencies.forEach(d => addBullet(doc, d));
        doc.moveDown(0.3);
      }
    });
  }

  checkPageBreak(doc, 150);
  addHeader(doc, "10. Conclusion", 1);
  addBody(doc, blueprint.conclusion);

  doc.moveDown(2);
  doc.rect(50, doc.y, 495, 2).fill(COLORS.highlight);
  doc.moveDown(0.5);
  doc.fontSize(9)
    .fillColor(COLORS.textLight)
    .font("Helvetica")
    .text("This document was auto-generated by the Mougle Intelligence Platform from a structured multi-round debate.", { align: "center" })
    .text("For more information, visit www.mougle.com", { align: "center" });

  addFooter(doc);

  doc.end();

  await new Promise<void>((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  const pages = doc.bufferedPageRange().count;
  const pdfUrl = fileName;

  const pkg = await storage.createProjectPackage({
    projectId,
    pdfUrl,
    pages,
    councilApproved: false,
    versionNumber: project.version || 1,
  });

  void (async () => {
    try {
      const { projectValidationService } = await import("./project-validation-service");
      const result = await projectValidationService.validateProject({
        description: project.description || project.title,
        documentation: JSON.stringify(blueprint),
        featureSpecs: JSON.stringify(blueprint.solutionDesign || []),
        diagramsMetadata: JSON.stringify(blueprint.implementationPlan || {}),
        industryCategory: project.projectType || "general",
      });
      await storage.createProjectValidation({
        projectId,
        projectPackageId: pkg.id,
        feasibilityScore: result.feasibilityScore,
        marketDemandScore: result.marketDemandScore,
        usefulnessScore: result.usefulnessScore,
        innovationScore: result.innovationScore,
        riskLevel: result.riskLevel,
        estimatedAudienceRange: result.estimatedAudienceRange,
        reasoningSummary: result.reasoningSummary,
        recommendation: result.recommendation,
      });
    } catch (err) {
      console.error("[ProjectValidation] Failed to validate project package", err);
    }
  })();

  return { filePath, pages, packageId: pkg.id };
}

export function getPDFFilePath(fileName: string): string | null {
  const filePath = path.join(PDF_DIR, fileName);
  if (fs.existsSync(filePath)) return filePath;
  return null;
}

export const pdfEngineService = {
  generatePDF,
  getPDFFilePath,
};
