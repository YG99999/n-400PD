import { randomUUID } from "crypto";
import {
  type FieldCollectionState,
  type FormSession,
  type N400FormData,
  type ReadinessStatus,
  type ReviewEdit,
  type Section,
  type SectionProgressState,
  type ToolEvent,
  type WorkflowState,
  SECTIONS,
  createEmptyWorkflowState,
} from "@shared/schema";
import { validatePdfReadiness } from "./pdfValidation";
import { CATALOG_FIELDS, determineSectionForPath, isCatalogFieldRequired } from "./assistantCatalog";
import { mapFormDataToPdfFields } from "./pdfMapper";

export function getValueAtPath(source: unknown, path: string): unknown {
  const normalized = path.replace(/\[(\d+)\]/g, ".$1");
  return normalized.split(".").reduce<unknown>((current, part) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (typeof current === "object") {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
}

export function setValueAtPath(target: Record<string, unknown>, path: string, value: unknown) {
  const normalized = path.replace(/\[(\d+)\]/g, ".$1");
  const parts = normalized.split(".");
  let current: Record<string, unknown> | unknown[] = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = parts[i + 1];
    const isNextIndex = /^\d+$/.test(next);
    if (Array.isArray(current)) {
      const index = Number(part);
      if (current[index] === undefined) {
        current[index] = isNextIndex ? [] : {};
      }
      current = current[index] as Record<string, unknown> | unknown[];
    } else {
      if (current[part] === undefined) {
        current[part] = isNextIndex ? [] : {};
      }
      current = current[part] as Record<string, unknown> | unknown[];
    }
  }

  const last = parts[parts.length - 1];
  if (Array.isArray(current)) {
    current[Number(last)] = value;
  } else {
    current[last] = value;
  }
}

export function cloneFormData(formData: N400FormData) {
  return JSON.parse(JSON.stringify(formData)) as N400FormData;
}

export function appendListItem(target: Record<string, unknown>, path: string, value: unknown) {
  const list = getValueAtPath(target, path);
  if (Array.isArray(list)) {
    list.push(value);
    return;
  }
  setValueAtPath(target, path, [value]);
}

export function removeListItem(target: Record<string, unknown>, path: string, index: number) {
  const list = getValueAtPath(target, path);
  if (Array.isArray(list)) {
    list.splice(index, 1);
  }
}

export function createToolEvent(
  type: ToolEvent["type"],
  status: ToolEvent["status"],
  payload: Record<string, unknown>,
): ToolEvent {
  return {
    id: randomUUID(),
    type,
    status,
    payload,
    createdAt: new Date().toISOString(),
  };
}

export function createReviewEdit(
  path: string,
  action: ReviewEdit["action"],
  source: ReviewEdit["source"],
): ReviewEdit {
  return {
    id: randomUUID(),
    path,
    action,
    source,
    timestamp: new Date().toISOString(),
  };
}

function isBlank(value: unknown) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function inferFieldState(path: string, formData: N400FormData): FieldCollectionState {
  const value = getValueAtPath(formData, path);
  const fieldConfig = CATALOG_FIELDS.find((field) => field.path === path);
  const required = fieldConfig ? isCatalogFieldRequired(fieldConfig, formData) : false;
  const section = determineSectionForPath(path);
  return {
    path,
    section,
    status: isBlank(value) ? "missing" : "complete",
    confidence: isBlank(value) ? "low" : "high",
    required,
    source: "system",
    updatedAt: new Date().toISOString(),
  };
}

function computeSectionState(section: Section, formData: N400FormData): SectionProgressState {
  const fields = CATALOG_FIELDS.filter((field) => field.section === section && isCatalogFieldRequired(field, formData));
  const missingFields = fields
    .filter((field) => isBlank(getValueAtPath(formData, field.path)))
    .map((field) => field.path);
  const completedFields = fields
    .filter((field) => !isBlank(getValueAtPath(formData, field.path)))
    .map((field) => field.path);
  let status: SectionProgressState["status"] = "not_started";
  if (completedFields.length > 0 && missingFields.length > 0) status = "in_progress";
  if (completedFields.length > 0 && missingFields.length === 0) status = section === "REVIEW" ? "ready_for_review" : "completed";
  if (completedFields.length === 0 && missingFields.length > 0) status = section === "INTRO" ? "in_progress" : "not_started";

  return {
    section,
    status,
    missingFields,
    completedFields,
    updatedAt: new Date().toISOString(),
  };
}

export function computeReadiness(
  formData: N400FormData,
  workflowState?: WorkflowState,
): ReadinessStatus {
  const pdfValidation = validatePdfReadiness(formData, mapFormDataToPdfFields(formData));
  const requiredMissing = CATALOG_FIELDS
    .filter((field) => isCatalogFieldRequired(field, formData))
    .filter((field) => isBlank(getValueAtPath(formData, field.path)))
    .map((field) => field.path);
  const unresolvedFields = Object.values(workflowState?.fieldStates ?? {})
    .filter((field) => field.status !== "complete")
    .map((field) => field.path);
  const errors = [...pdfValidation.errors];
  const warnings = [...pdfValidation.warnings];
  const unsupportedFields = [...pdfValidation.unsupportedFields];
  return {
    eligibleForReview: requiredMissing.length === 0 && errors.length === 0,
    eligibleForPayment: requiredMissing.length === 0 && errors.length === 0,
    eligibleForPdf: pdfValidation.valid,
    missingFields: Array.from(new Set([...requiredMissing, ...pdfValidation.missingFields])),
    unresolvedFields,
    warnings,
    errors,
    unsupportedFields,
    stalePdf: workflowState?.pdfNeedsRegeneration ?? false,
  };
}

export function refreshWorkflowState(
  session: Pick<FormSession, "formData" | "paymentStatus" | "pdfUrl" | "workflowState" | "currentSection">,
): WorkflowState {
  const existing = session.workflowState ?? createEmptyWorkflowState();
  const nextSectionStates = Object.fromEntries(
    SECTIONS.map((section) => [section, computeSectionState(section, session.formData)]),
  ) as Record<Section, SectionProgressState>;

  const nextFieldStates = { ...existing.fieldStates };
  for (const field of CATALOG_FIELDS) {
    nextFieldStates[field.path] = inferFieldState(field.path, session.formData);
  }

  const readiness = computeReadiness(session.formData, {
    ...existing,
    fieldStates: nextFieldStates,
    sectionStates: nextSectionStates,
  });

  return {
    ...existing,
    sectionStates: nextSectionStates,
    fieldStates: nextFieldStates,
    lastReadiness: readiness,
    readyForReview: readiness.eligibleForReview,
    mode:
      existing.mode === "post_payment_review" || session.paymentStatus === "completed"
        ? "post_payment_review"
        : existing.mode,
    pdfNeedsRegeneration: Boolean(existing.pdfNeedsRegeneration),
  };
}
