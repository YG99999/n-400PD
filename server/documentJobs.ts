import { execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { mapFormDataToPdfFields } from "./pdfMapper";
import { validatePdfReadiness } from "./pdfValidation";
import { refreshWorkflowState } from "./workflowState";
import { storage } from "./storage";
import { persistGeneratedDocument } from "./documentStorage";
import { config } from "./config";

const PDF_DIR = path.resolve(import.meta.dirname, "pdf");
const ACROFORM_PATH = path.join(PDF_DIR, "n400_acroform.pdf");
const POPULATOR_PATH = path.join(PDF_DIR, "n400_populator.py");
const OUTPUT_DIR = path.resolve("generated_pdfs");

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function resolvePythonCommand(): string {
  const candidates = process.platform === "win32"
    ? [["python"], ["py", "-3"], ["py"]]
    : [["python3"], ["python"]];

  for (const [command, ...args] of candidates) {
    const result = spawnSync(command, [...args, "--version"], { stdio: "ignore" });
    if (result.status === 0) {
      return [command, ...args].map((part) => `"${part}"`).join(" ");
    }
  }

  throw new Error("No Python runtime was found. Install Python with PyMuPDF.");
}

class DocumentJobRunner {
  private processing = new Set<string>();

  async enqueue(sessionId: string, trigger: "payment" | "regenerate") {
    const session = await storage.getSession(sessionId);
    if (!session) throw new Error("Session not found");

    const existingDocument = await storage.getLatestDocumentBySession(session.id);
    const job = await storage.createJob({
      userId: session.userId,
      sessionId: session.id,
      trigger,
      status: "queued",
    });

    const document = existingDocument && existingDocument.status !== "failed"
      ? await storage.updateDocument(existingDocument.id, {
        status: "queued",
        jobId: job.id,
      })
      : await storage.createDocument({
        userId: session.userId,
        sessionId: session.id,
        jobId: job.id,
        kind: "n400_pdf",
        status: "queued",
      });

    await storage.updateJob(job.id, { documentId: document.id });
    if (config.inlineDocumentProcessing) {
      setTimeout(() => {
        void this.process(job.id);
      }, 10);
    }
    return { jobId: job.id, documentId: document.id };
  }

  async process(jobId: string) {
    if (this.processing.has(jobId)) return;
    this.processing.add(jobId);
    try {
      const job = await storage.getJob(jobId);
      if (!job) return;
      const session = await storage.getSession(job.sessionId);
      if (!session) throw new Error("Session not found");

      await storage.updateJob(job.id, { status: "processing", error: undefined });
      if (job.documentId) {
        await storage.updateDocument(job.documentId, { status: "processing" });
      }

      const pdfFields = mapFormDataToPdfFields(session.formData);
      const validationResult = validatePdfReadiness(session.formData, pdfFields);
      if (!validationResult.valid) {
        throw new Error(`PDF generation blocked: ${validationResult.missingFields.join(", ") || validationResult.errors.join(", ")}`);
      }

      const jsonPath = path.join(OUTPUT_DIR, `${session.id}_data.json`);
      const outputPath = path.join(OUTPUT_DIR, `${session.id}_n400.pdf`);
      fs.writeFileSync(jsonPath, JSON.stringify(pdfFields, null, 2));

      const pythonCmd = resolvePythonCommand();
      const cmd = `${pythonCmd} "${POPULATOR_PATH}" "${ACROFORM_PATH}" "${jsonPath}" "${outputPath}"`;
      execSync(cmd, { timeout: 30000, encoding: "utf8" });

      if (!fs.existsSync(outputPath)) {
        throw new Error("PDF file was not generated");
      }

      const stat = fs.statSync(outputPath);
      const downloadUrl = `/api/pdf/download/${session.id}`;
      const persisted = await persistGeneratedDocument(session.id, outputPath);
      if (job.documentId) {
        await storage.updateDocument(job.documentId, {
          status: "available",
          storagePath: persisted.storagePath,
          remotePath: persisted.remotePath,
          storageProvider: persisted.storageProvider,
          downloadUrl,
          fileSize: stat.size,
        });
      }
      await storage.setPdfUrl(session.id, downloadUrl);
      await storage.updateSession(session.id, {
        status: session.paymentStatus === "completed" ? "completed" : "review",
        workflowState: refreshWorkflowState({
          ...session,
          pdfUrl: downloadUrl,
          workflowState: {
            ...session.workflowState,
            pdfNeedsRegeneration: false,
            pendingRedirect: null,
          },
        }),
      });
      await storage.updateJob(job.id, { status: "completed" });
      await storage.createAuditEvent({
        userId: session.userId,
        action: "document.generated",
        targetType: "document_job",
        targetId: job.id,
        metadata: { sessionId: session.id, trigger: job.trigger, fileSize: stat.size },
      });
    } catch (error) {
      const job = await storage.getJob(jobId);
      if (job) {
        await storage.updateJob(job.id, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
        if (job.documentId) {
          await storage.updateDocument(job.documentId, { status: "failed" });
        }
      }
    } finally {
      this.processing.delete(jobId);
    }
  }
}

export const documentJobs = new DocumentJobRunner();
