import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import type { N400FormData, Section } from "@shared/schema";
import { SECTION_LABELS, SECTIONS } from "@shared/schema";

interface ChatInlineEditorProps {
  formSessionId: string;
  formData: N400FormData;
  onUpdated: () => Promise<void>;
}

interface CollectedField {
  path: string;
  value: string | number | boolean;
  section: Section;
  label: string;
  multiline: boolean;
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isBlank(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && value.trim().length === 0);
}

function determineSection(path: string): Section {
  if (path.startsWith("personalInfo.") || path.startsWith("biographic.")) return "PERSONAL_INFO";
  if (path.startsWith("residenceHistory") || path.startsWith("mailingAddress")) return "RESIDENCE_HISTORY";
  if (path.startsWith("family.")) return "FAMILY_INFO";
  if (path.startsWith("employment")) return "EMPLOYMENT";
  if (path.startsWith("travelHistory")) return "TRAVEL";
  if (path.startsWith("moralCharacter")) return "MORAL_CHARACTER";
  if (path.startsWith("oath")) return "OATH";
  return "REVIEW";
}

function humanizePath(path: string) {
  return path
    .replace(/\[(\d+)\]/g, (_match, index) => ` ${Number(index) + 1} `)
    .split(".")
    .map((part) =>
      part
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, (value) => value.toUpperCase())
        .trim(),
    )
    .join(" ");
}

function flattenCollectedFields(value: unknown, path = ""): CollectedField[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => flattenCollectedFields(entry, `${path}[${index}]`));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
      const nextPath = path ? `${path}.${key}` : key;
      return flattenCollectedFields(entry, nextPath);
    });
  }

  if (!path || !isScalar(value) || isBlank(value)) {
    return [];
  }

  return [{
    path,
    value,
    section: determineSection(path),
    label: humanizePath(path),
    multiline: typeof value === "string" && value.length > 48,
  }];
}

function InlineEditorField({
  field,
  onSave,
}: {
  field: CollectedField;
  onSave: (path: string, value: string | number | boolean) => void;
}) {
  const [draft, setDraft] = useState(field.value);

  useEffect(() => {
    setDraft(field.value);
  }, [field.value]);

  if (typeof field.value === "boolean") {
    return (
      <label className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 px-3 py-3">
        <div>
          <p className="text-sm font-medium">{field.label}</p>
          <p className="text-xs text-muted-foreground">{SECTION_LABELS[field.section]}</p>
        </div>
        <Checkbox
          checked={draft === true}
          onCheckedChange={(value) => {
            const checked = value === true;
            setDraft(checked);
            onSave(field.path, checked);
          }}
        />
      </label>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-medium">{field.label}</Label>
        <Badge variant="outline" className="text-[11px]">{SECTION_LABELS[field.section]}</Badge>
      </div>
      {field.multiline ? (
        <Textarea
          value={String(draft)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => onSave(field.path, eventValueToTyped(field.value, String(draft)))}
          rows={3}
        />
      ) : (
        <Input
          value={String(draft)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => onSave(field.path, eventValueToTyped(field.value, String(draft)))}
        />
      )}
    </div>
  );
}

function eventValueToTyped(source: string | number | boolean, draft: string) {
  if (typeof source === "number") {
    const parsed = Number(draft);
    return Number.isFinite(parsed) ? parsed : source;
  }
  return draft;
}

export function ChatInlineEditor({
  formSessionId,
  formData,
  onUpdated,
}: ChatInlineEditorProps) {
  const fields = useMemo(() => flattenCollectedFields(formData), [formData]);

  const mutation = useMutation({
    mutationFn: async ({ path, value }: { path: string; value: string | number | boolean }) => {
      const response = await apiRequest("POST", "/api/review/update-field", { formSessionId, path, value });
      return response.json();
    },
    onSuccess: onUpdated,
  });

  const groupedFields = useMemo(() => {
    const groups = new Map<Section, CollectedField[]>();
    for (const field of fields) {
      const existing = groups.get(field.section) ?? [];
      existing.push(field);
      groups.set(field.section, existing);
    }
    return Array.from(groups.entries()).sort(
      ([sectionA], [sectionB]) =>
        SECTIONS.indexOf(sectionA) - SECTIONS.indexOf(sectionB),
    );
  }, [fields]);

  if (fields.length === 0) {
    return null;
  }

  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-lg">Edit Info</CardTitle>
          <p className="text-sm text-muted-foreground">
            Update any collected answer here. Changes stay in sync with the chat.
          </p>
        </div>
        {mutation.isPending ? <Badge>Saving</Badge> : <Badge variant="secondary">Live</Badge>}
      </CardHeader>
      <CardContent className="space-y-5">
        {groupedFields.map(([section, sectionFields]) => (
          <section key={section} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{SECTION_LABELS[section]}</h3>
              <Badge variant="outline">{sectionFields.length} field{sectionFields.length === 1 ? "" : "s"}</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {sectionFields.map((field) => (
                <InlineEditorField
                  key={field.path}
                  field={field}
                  onSave={(path, value) => mutation.mutate({ path, value })}
                />
              ))}
            </div>
          </section>
        ))}
        {mutation.isError ? (
          <div className="flex items-center justify-between rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <span>We could not save that change. Please try again.</span>
            <Button variant="ghost" size="sm" onClick={() => mutation.reset()}>Dismiss</Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
