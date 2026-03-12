import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Download, FileText, Home, Loader2, Pencil, Plus, RefreshCcw, Trash2, User, Users, Briefcase, Plane, ShieldCheck, HandMetal, Mail, Fingerprint, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, authenticatedFetch, queryClient } from "@/lib/queryClient";
import type { N400FormData, ReadinessStatus, ResidenceEntry } from "@shared/schema";

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function EditableField({
  label,
  value,
  onSave,
  multiline = false,
}: {
  label: string;
  value?: string | number;
  onSave: (value: string) => void;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value === undefined || value === null ? "" : String(value));
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {multiline ? (
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => onSave(draft)}
          rows={3}
          data-testid={`input-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        />
      ) : (
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => onSave(draft)}
          data-testid={`input-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        />
      )}
    </div>
  );
}

function EditableBoolean({
  label,
  checked,
  onSave,
}: {
  label: string;
  checked?: boolean;
  onSave: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
      <Checkbox checked={checked === true} onCheckedChange={(value) => onSave(value === true)} />
      <span className="text-sm">{label}</span>
    </label>
  );
}

const emptyResidence = (): ResidenceEntry => ({
  address: "",
  inCareOfName: "",
  city: "",
  state: "",
  zip: "",
  province: "",
  postalCode: "",
  country: "United States",
  moveInDate: "",
  moveOutDate: "",
});

export default function ReviewPage() {
  const { formSessionId } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const { data: sessionData, isLoading } = useQuery({
    queryKey: ["/api/form/load", formSessionId],
    queryFn: async () => {
      const response = await authenticatedFetch(`/api/form/load?sessionId=${formSessionId}`);
      if (!response.ok) throw new Error("Failed to load session");
      return response.json();
    },
    enabled: !!formSessionId,
  });

  const { data: readinessData } = useQuery({
    queryKey: ["/api/form/readiness", formSessionId],
    queryFn: async () => {
      const response = await authenticatedFetch(`/api/form/readiness?sessionId=${formSessionId}`);
      if (!response.ok) throw new Error("Failed to load readiness");
      return response.json();
    },
    enabled: !!formSessionId,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/form/load", formSessionId] }),
      queryClient.invalidateQueries({ queryKey: ["/api/form/readiness", formSessionId] }),
    ]);
  };

  const scalarMutation = useMutation({
    mutationFn: async ({ path, value }: { path: string; value: unknown }) => {
      const response = await apiRequest("POST", "/api/review/update-field", { formSessionId, path, value });
      return response.json();
    },
    onSuccess: refresh,
    onError: (error: Error) => toast({ title: "Update failed", description: error.message, variant: "destructive" }),
  });

  const itemMutation = useMutation({
    mutationFn: async ({ path, index, value }: { path: string; index: number; value: unknown }) => {
      const response = await apiRequest("POST", "/api/review/update-item", { formSessionId, path, index, value });
      return response.json();
    },
    onSuccess: refresh,
    onError: (error: Error) => toast({ title: "Update failed", description: error.message, variant: "destructive" }),
  });

  const addItemMutation = useMutation({
    mutationFn: async ({ path, value }: { path: string; value: unknown }) => {
      const response = await apiRequest("POST", "/api/review/add-item", { formSessionId, path, value });
      return response.json();
    },
    onSuccess: refresh,
    onError: (error: Error) => toast({ title: "Add failed", description: error.message, variant: "destructive" }),
  });

  const removeItemMutation = useMutation({
    mutationFn: async ({ path, index }: { path: string; index: number }) => {
      const response = await apiRequest("POST", "/api/review/remove-item", { formSessionId, path, index });
      return response.json();
    },
    onSuccess: refresh,
    onError: (error: Error) => toast({ title: "Remove failed", description: error.message, variant: "destructive" }),
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/pdf/generate", { formSessionId, overrideValidation: false });
      return response.json();
    },
    onSuccess: async (data) => {
      setJobId(data.jobId);
      await refresh();
      toast({ title: "PDF regeneration queued", description: "We are generating a fresh download in the background." });
    },
    onError: (error: Error) => toast({ title: "Regeneration failed", description: error.message, variant: "destructive" }),
  });

  const { data: jobData } = useQuery({
    queryKey: ["/api/jobs", jobId],
    queryFn: async () => {
      const response = await authenticatedFetch(`/api/jobs/${jobId}`);
      if (!response.ok) throw new Error("Failed to load job");
      return response.json();
    },
    enabled: !!jobId,
    refetchInterval: 1500,
  });

  useEffect(() => {
    if (jobData?.job?.status === "completed") {
      setJobId(null);
      void refresh();
      toast({ title: "PDF regenerated", description: "Your updated download is ready." });
    }
    if (jobData?.job?.status === "failed") {
      setJobId(null);
      toast({ title: "Regeneration failed", description: jobData.job.error || "Background job failed.", variant: "destructive" });
    }
  }, [jobData, toast]);

  if (!formSessionId) {
    navigate("/login");
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <Card><CardContent className="h-40" /></Card>
        </div>
      </div>
    );
  }

  const session = sessionData?.formSession;
  const formData: N400FormData = session?.formData;
  const readiness: ReadinessStatus | undefined = readinessData?.readiness || session?.workflowState?.lastReadiness;
  const isPaid = session?.paymentStatus === "completed";
  const stalePdf = Boolean(readiness?.stalePdf || session?.workflowState?.pdfNeedsRegeneration || jobId);
  const blocking = Boolean((readiness?.missingFields.length || 0) > 0 || (readiness?.errors.length || 0) > 0);

  const updateItem = (path: string, index: number, key: string, value: unknown) => {
    const root = path === "family.children"
      ? formData.family.children
      : path === "additionalInfo"
        ? formData.additionalInfo
        : path === "personalInfo.otherNamesUsed"
          ? formData.personalInfo.otherNamesUsed
          : (formData as unknown as Record<string, unknown>)[path];
    const source = (Array.isArray(root) ? root[index] : undefined) || {};
    itemMutation.mutate({ path, index, value: { ...source, [key]: value } });
  };

  const mailingAddress = formData.mailingAddress || emptyResidence();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/chat")} data-testid="button-back-chat">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to assistant
          </Button>
          <h1 className="font-semibold">Review and Edit</h1>
          <Badge variant={isPaid ? "default" : "secondary"} data-testid="badge-payment-status">
            {isPaid ? "Paid" : "Before payment"}
          </Badge>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Application Status</CardTitle>
            <CardDescription>Edit fields directly here or return to the assistant with review context preserved.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={blocking ? "secondary" : "default"}>
                {blocking ? "Needs more information" : "Ready for next step"}
              </Badge>
              {stalePdf ? <Badge variant="destructive">PDF needs regeneration</Badge> : null}
            </div>
            {(readiness?.missingFields.length || 0) > 0 ? (
              <Alert>
                <AlertTitle>Still needed</AlertTitle>
                <AlertDescription>{readiness?.missingFields.join(", ")}</AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Core applicant data is collected</AlertTitle>
                <AlertDescription>You can proceed, or make final edits here first.</AlertDescription>
              </Alert>
            )}
            {(readiness?.warnings.length || 0) > 0 ? (
              <p className="text-sm text-muted-foreground">{readiness?.warnings.join(" | ")}</p>
            ) : null}
          </CardContent>
        </Card>

        <SectionCard title="Personal Information" description="Identity, contact, and eligibility fields used by the supported PDF scope." icon={User}>
          <div className="grid gap-3 md:grid-cols-2">
            <EditableField label="Full name" value={formData.personalInfo.fullName} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.fullName", value })} />
            <EditableField label="First name" value={formData.personalInfo.firstName} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.firstName", value })} />
            <EditableField label="Middle name" value={formData.personalInfo.middleName} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.middleName", value })} />
            <EditableField label="Last name" value={formData.personalInfo.lastName} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.lastName", value })} />
            <EditableField label="Date of birth" value={formData.personalInfo.dateOfBirth} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.dateOfBirth", value })} />
            <EditableField label="A-Number" value={formData.personalInfo.aNumber} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.aNumber", value })} />
            <EditableField label="USCIS ELIS number" value={formData.personalInfo.uscisElisNumber} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.uscisElisNumber", value })} />
            <EditableField label="Resident since" value={formData.personalInfo.dateBecamePR} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.dateBecamePR", value })} />
            <EditableField label="Country of birth" value={formData.personalInfo.countryOfBirth} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.countryOfBirth", value })} />
            <EditableField label="Nationality" value={formData.personalInfo.nationality} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.nationality", value })} />
            <EditableField label="Gender" value={formData.personalInfo.gender} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.gender", value })} />
            <EditableField label="Eligibility basis" value={formData.personalInfo.eligibilityBasis} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.eligibilityBasis", value })} />
            <EditableField label="Eligibility explanation" value={formData.personalInfo.eligibilityOtherExplanation} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.eligibilityOtherExplanation", value })} multiline />
            <EditableField label="USCIS office" value={formData.personalInfo.eligibilityUscisOffice} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.eligibilityUscisOffice", value })} />
            <EditableField label="Email" value={formData.personalInfo.email} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.email", value })} />
            <EditableField label="Phone" value={formData.personalInfo.phone} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.phone", value })} />
            <EditableField label="Mobile phone" value={formData.personalInfo.mobilePhone} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.mobilePhone", value })} />
            <EditableField label="SSN" value={formData.personalInfo.ssn} onSave={(value) => scalarMutation.mutate({ path: "personalInfo.ssn", value })} />
          </div>
          {(formData.personalInfo.otherNamesUsed || []).map((name, index) => (
            <Card key={`other-name-${index}`} className="border-dashed">
              <CardContent className="grid gap-3 pt-4 md:grid-cols-3">
                <EditableField label={`Other first name ${index + 1}`} value={name.firstName} onSave={(value) => updateItem("personalInfo.otherNamesUsed", index, "firstName", value)} />
                <EditableField label="Other middle name" value={name.middleName} onSave={(value) => updateItem("personalInfo.otherNamesUsed", index, "middleName", value)} />
                <EditableField label="Other last name" value={name.lastName} onSave={(value) => updateItem("personalInfo.otherNamesUsed", index, "lastName", value)} />
                <Button variant="outline" size="sm" onClick={() => removeItemMutation.mutate({ path: "personalInfo.otherNamesUsed", index })}>
                  <Trash2 className="mr-1 h-3 w-3" /> Remove alternate name
                </Button>
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" size="sm" onClick={() => addItemMutation.mutate({ path: "personalInfo.otherNamesUsed", value: { firstName: "", middleName: "", lastName: "" } })}>
            <Plus className="mr-1 h-3 w-3" /> Add alternate name
          </Button>
        </SectionCard>

        <SectionCard title="Biographic Details" description="Physical descriptors required by the current N-400." icon={Fingerprint}>
          <div className="grid gap-3 md:grid-cols-2">
            <EditableField label="Ethnicity" value={formData.biographic.ethnicity} onSave={(value) => scalarMutation.mutate({ path: "biographic.ethnicity", value })} />
            <EditableField label="Race" value={formData.biographic.race} onSave={(value) => scalarMutation.mutate({ path: "biographic.race", value })} />
            <EditableField label="Height feet" value={formData.biographic.heightFeet} onSave={(value) => scalarMutation.mutate({ path: "biographic.heightFeet", value: Number(value) || 0 })} />
            <EditableField label="Height inches" value={formData.biographic.heightInches} onSave={(value) => scalarMutation.mutate({ path: "biographic.heightInches", value: Number(value) || 0 })} />
            <EditableField label="Weight lbs" value={formData.biographic.weightLbs} onSave={(value) => scalarMutation.mutate({ path: "biographic.weightLbs", value: Number(value) || 0 })} />
            <EditableField label="Eye color" value={formData.biographic.eyeColor} onSave={(value) => scalarMutation.mutate({ path: "biographic.eyeColor", value })} />
            <EditableField label="Hair color" value={formData.biographic.hairColor} onSave={(value) => scalarMutation.mutate({ path: "biographic.hairColor", value })} />
          </div>
        </SectionCard>

        <SectionCard title="Residence History" description="Current physical address, mailing address if different, and prior addresses." icon={Home}>
          {(formData.residenceHistory || []).map((entry, index) => (
            <Card key={`address-${index}`} className="border-dashed">
              <CardContent className="grid gap-3 pt-4 md:grid-cols-2">
                <EditableField label={`Address ${index + 1}`} value={entry.address} onSave={(value) => updateItem("residenceHistory", index, "address", value)} />
                <EditableField label="In care of" value={entry.inCareOfName} onSave={(value) => updateItem("residenceHistory", index, "inCareOfName", value)} />
                <EditableField label="City" value={entry.city} onSave={(value) => updateItem("residenceHistory", index, "city", value)} />
                <EditableField label="State" value={entry.state} onSave={(value) => updateItem("residenceHistory", index, "state", value)} />
                <EditableField label="ZIP" value={entry.zip} onSave={(value) => updateItem("residenceHistory", index, "zip", value)} />
                <EditableField label="Province" value={entry.province} onSave={(value) => updateItem("residenceHistory", index, "province", value)} />
                <EditableField label="Postal code" value={entry.postalCode} onSave={(value) => updateItem("residenceHistory", index, "postalCode", value)} />
                <EditableField label="Country" value={entry.country} onSave={(value) => updateItem("residenceHistory", index, "country", value)} />
                <EditableField label="Move in date" value={entry.moveInDate} onSave={(value) => updateItem("residenceHistory", index, "moveInDate", value)} />
                {index > 0 ? <EditableField label="Move out date" value={entry.moveOutDate} onSave={(value) => updateItem("residenceHistory", index, "moveOutDate", value)} /> : null}
                {index > 0 ? <Button variant="outline" size="sm" onClick={() => removeItemMutation.mutate({ path: "residenceHistory", index })}><Trash2 className="mr-1 h-3 w-3" /> Remove</Button> : null}
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" size="sm" onClick={() => addItemMutation.mutate({ path: "residenceHistory", value: emptyResidence() })}>
            <Plus className="mr-1 h-3 w-3" /> Add prior address
          </Button>
        </SectionCard>

        <SectionCard title="Mailing Address" description="Leave blank if the mailing address is the same as the physical address." icon={Mail}>
          <div className="grid gap-3 md:grid-cols-2">
            <EditableField label="Mailing address" value={mailingAddress.address} onSave={(value) => scalarMutation.mutate({ path: "mailingAddress.address", value })} />
            <EditableField label="In care of" value={mailingAddress.inCareOfName} onSave={(value) => scalarMutation.mutate({ path: "mailingAddress.inCareOfName", value })} />
            <EditableField label="City" value={mailingAddress.city} onSave={(value) => scalarMutation.mutate({ path: "mailingAddress.city", value })} />
            <EditableField label="State" value={mailingAddress.state} onSave={(value) => scalarMutation.mutate({ path: "mailingAddress.state", value })} />
            <EditableField label="ZIP" value={mailingAddress.zip} onSave={(value) => scalarMutation.mutate({ path: "mailingAddress.zip", value })} />
            <EditableField label="Province" value={mailingAddress.province} onSave={(value) => scalarMutation.mutate({ path: "mailingAddress.province", value })} />
            <EditableField label="Postal code" value={mailingAddress.postalCode} onSave={(value) => scalarMutation.mutate({ path: "mailingAddress.postalCode", value })} />
            <EditableField label="Country" value={mailingAddress.country} onSave={(value) => scalarMutation.mutate({ path: "mailingAddress.country", value })} />
          </div>
        </SectionCard>

        <SectionCard title="Family Information" description="Marital history, spouse details, and children." icon={Users}>
          <div className="grid gap-3 md:grid-cols-2">
            <EditableField label="Marital status" value={formData.family.maritalStatus} onSave={(value) => scalarMutation.mutate({ path: "family.maritalStatus", value })} />
            <EditableField label="Times married" value={formData.family.timesMarried} onSave={(value) => scalarMutation.mutate({ path: "family.timesMarried", value: Number(value) || 0 })} />
            <EditableField label="Spouse times married" value={formData.family.spouseTimesMarried} onSave={(value) => scalarMutation.mutate({ path: "family.spouseTimesMarried", value: Number(value) || 0 })} />
            <EditableField label="Spouse name" value={formData.family.spouse?.fullName} onSave={(value) => scalarMutation.mutate({ path: "family.spouse.fullName", value })} />
            <EditableField label="Spouse DOB" value={formData.family.spouse?.dateOfBirth} onSave={(value) => scalarMutation.mutate({ path: "family.spouse.dateOfBirth", value })} />
            <EditableField label="Date of marriage" value={formData.family.spouse?.dateOfMarriage} onSave={(value) => scalarMutation.mutate({ path: "family.spouse.dateOfMarriage", value })} />
            <EditableField label="Spouse A-Number" value={formData.family.spouse?.aNumber} onSave={(value) => scalarMutation.mutate({ path: "family.spouse.aNumber", value })} />
            <EditableField label="Citizenship by" value={formData.family.spouse?.citizenshipBy} onSave={(value) => scalarMutation.mutate({ path: "family.spouse.citizenshipBy", value })} />
            <EditableField label="Date became citizen" value={formData.family.spouse?.dateBecameCitizen} onSave={(value) => scalarMutation.mutate({ path: "family.spouse.dateBecameCitizen", value })} />
            <EditableField label="Current employer" value={formData.family.spouse?.currentEmployer} onSave={(value) => scalarMutation.mutate({ path: "family.spouse.currentEmployer", value })} />
            <EditableField label="Total children" value={formData.family.totalChildren} onSave={(value) => scalarMutation.mutate({ path: "family.totalChildren", value: Number(value) || 0 })} />
            <EditableField label="Household size" value={formData.family.householdSize} onSave={(value) => scalarMutation.mutate({ path: "family.householdSize", value: Number(value) || 0 })} />
            <EditableField label="Household income" value={formData.family.totalHouseholdIncome} onSave={(value) => scalarMutation.mutate({ path: "family.totalHouseholdIncome", value: Number(value) || 0 })} />
            <EditableField label="Income earners" value={formData.family.householdIncomeEarners} onSave={(value) => scalarMutation.mutate({ path: "family.householdIncomeEarners", value: Number(value) || 0 })} />
            <EditableField label="Head of household name" value={formData.family.headOfHouseholdName} onSave={(value) => scalarMutation.mutate({ path: "family.headOfHouseholdName", value })} />
            <EditableBoolean label="Spouse is a citizen" checked={formData.family.spouse?.isCitizen} onSave={(value) => scalarMutation.mutate({ path: "family.spouse.isCitizen", value })} />
            <EditableBoolean label="Request fee reduction" checked={formData.family.feeReductionRequested} onSave={(value) => scalarMutation.mutate({ path: "family.feeReductionRequested", value })} />
            <EditableBoolean label="Head of household" checked={formData.family.headOfHousehold} onSave={(value) => scalarMutation.mutate({ path: "family.headOfHousehold", value })} />
          </div>
          {(formData.family.children || []).map((child, index) => (
            <Card key={`child-${index}`} className="border-dashed">
              <CardContent className="grid gap-3 pt-4 md:grid-cols-2">
                <EditableField label={`Child ${index + 1} name`} value={child.fullName} onSave={(value) => updateItem("family.children", index, "fullName", value)} />
                <EditableField label="Child DOB" value={child.dateOfBirth} onSave={(value) => updateItem("family.children", index, "dateOfBirth", value)} />
                <EditableField label="A-Number" value={child.aNumber} onSave={(value) => updateItem("family.children", index, "aNumber", value)} />
                <EditableField label="Relationship" value={child.relationship} onSave={(value) => updateItem("family.children", index, "relationship", value)} />
                <EditableField label="Residence" value={child.residence} onSave={(value) => updateItem("family.children", index, "residence", value)} multiline />
                <EditableBoolean label="Lives with you" checked={child.livesWithYou} onSave={(value) => updateItem("family.children", index, "livesWithYou", value)} />
                <EditableBoolean label="Providing support" checked={child.receivingSupport} onSave={(value) => updateItem("family.children", index, "receivingSupport", value)} />
                <Button variant="outline" size="sm" onClick={() => removeItemMutation.mutate({ path: "family.children", index })}><Trash2 className="mr-1 h-3 w-3" /> Remove child</Button>
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" size="sm" onClick={() => addItemMutation.mutate({ path: "family.children", value: { fullName: "", dateOfBirth: "", aNumber: "", relationship: "", residence: "", livesWithYou: true, receivingSupport: true } })}>
            <Plus className="mr-1 h-3 w-3" /> Add child
          </Button>
        </SectionCard>

        <SectionCard title="Employment" description="Current and prior work or school history used in the PDF." icon={Briefcase}>
          {(formData.employment || []).map((job, index) => (
            <Card key={`job-${index}`} className="border-dashed">
              <CardContent className="grid gap-3 pt-4 md:grid-cols-2">
                <EditableField label={`Employer ${index + 1}`} value={job.employerName} onSave={(value) => updateItem("employment", index, "employerName", value)} />
                <EditableField label="Occupation" value={job.occupation} onSave={(value) => updateItem("employment", index, "occupation", value)} />
                <EditableField label="City" value={job.city} onSave={(value) => updateItem("employment", index, "city", value)} />
                <EditableField label="State" value={job.state} onSave={(value) => updateItem("employment", index, "state", value)} />
                <EditableField label="ZIP" value={job.zip} onSave={(value) => updateItem("employment", index, "zip", value)} />
                <EditableField label="Country" value={job.country} onSave={(value) => updateItem("employment", index, "country", value)} />
                <EditableField label="Start date" value={job.startDate} onSave={(value) => updateItem("employment", index, "startDate", value)} />
                <EditableField label="End date" value={job.endDate} onSave={(value) => updateItem("employment", index, "endDate", value)} />
                <Button variant="outline" size="sm" onClick={() => removeItemMutation.mutate({ path: "employment", index })}><Trash2 className="mr-1 h-3 w-3" /> Remove entry</Button>
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" size="sm" onClick={() => addItemMutation.mutate({ path: "employment", value: { employerName: "", occupation: "", city: "", state: "", zip: "", country: "United States", startDate: "", endDate: "" } })}>
            <Plus className="mr-1 h-3 w-3" /> Add employment
          </Button>
        </SectionCard>

        <SectionCard title="Travel History" description="Trips outside the U.S. during the required statutory period." icon={Plane}>
          {(formData.travelHistory || []).map((trip, index) => (
            <Card key={`trip-${index}`} className="border-dashed">
              <CardContent className="grid gap-3 pt-4 md:grid-cols-2">
                <EditableField label={`Trip ${index + 1} destination`} value={trip.destination} onSave={(value) => updateItem("travelHistory", index, "destination", value)} />
                <EditableField label="Departure date" value={trip.departureDate} onSave={(value) => updateItem("travelHistory", index, "departureDate", value)} />
                <EditableField label="Return date" value={trip.returnDate} onSave={(value) => updateItem("travelHistory", index, "returnDate", value)} />
                <Button variant="outline" size="sm" onClick={() => removeItemMutation.mutate({ path: "travelHistory", index })}><Trash2 className="mr-1 h-3 w-3" /> Remove trip</Button>
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" size="sm" onClick={() => addItemMutation.mutate({ path: "travelHistory", value: { destination: "", departureDate: "", returnDate: "" } })}>
            <Plus className="mr-1 h-3 w-3" /> Add trip
          </Button>
        </SectionCard>

        <SectionCard title="Moral Character" description="Sensitive yes/no items that the assistant and review screen should confirm carefully." icon={ShieldCheck}>
          <div className="grid gap-3 md:grid-cols-2">
            <EditableBoolean label="Claimed US citizenship" checked={formData.moralCharacter.claimedUSCitizen} onSave={(value) => scalarMutation.mutate({ path: "moralCharacter.claimedUSCitizen", value })} />
            <EditableBoolean label="Voted in election" checked={formData.moralCharacter.votedInElection} onSave={(value) => scalarMutation.mutate({ path: "moralCharacter.votedInElection", value })} />
            <EditableBoolean label="Arrested or detained" checked={formData.moralCharacter.arrestedOrDetained} onSave={(value) => scalarMutation.mutate({ path: "moralCharacter.arrestedOrDetained", value })} />
            <EditableBoolean label="Convicted of crime" checked={formData.moralCharacter.convictedOfCrime} onSave={(value) => scalarMutation.mutate({ path: "moralCharacter.convictedOfCrime", value })} />
            <EditableBoolean label="Used illegal drugs" checked={formData.moralCharacter.usedIllegalDrugs} onSave={(value) => scalarMutation.mutate({ path: "moralCharacter.usedIllegalDrugs", value })} />
            <EditableBoolean label="Helped illegal entry" checked={formData.moralCharacter.helpedIllegalEntry} onSave={(value) => scalarMutation.mutate({ path: "moralCharacter.helpedIllegalEntry", value })} />
            <EditableBoolean label="Lied to government" checked={formData.moralCharacter.liedToGovernment} onSave={(value) => scalarMutation.mutate({ path: "moralCharacter.liedToGovernment", value })} />
            <EditableBoolean label="Deported" checked={formData.moralCharacter.deported} onSave={(value) => scalarMutation.mutate({ path: "moralCharacter.deported", value })} />
            <EditableBoolean label="Member of organizations" checked={formData.moralCharacter.memberOfOrganizations} onSave={(value) => scalarMutation.mutate({ path: "moralCharacter.memberOfOrganizations", value })} />
            <EditableBoolean label="Communist party member" checked={formData.moralCharacter.communistPartyMember} onSave={(value) => scalarMutation.mutate({ path: "moralCharacter.communistPartyMember", value })} />
            <EditableBoolean label="Terrorist association" checked={formData.moralCharacter.terroristAssociation} onSave={(value) => scalarMutation.mutate({ path: "moralCharacter.terroristAssociation", value })} />
            <EditableBoolean label="Committed violence" checked={formData.moralCharacter.committedViolence} onSave={(value) => scalarMutation.mutate({ path: "moralCharacter.committedViolence", value })} />
            <EditableBoolean label="Military service" checked={formData.moralCharacter.militaryService} onSave={(value) => scalarMutation.mutate({ path: "moralCharacter.militaryService", value })} />
            <EditableBoolean label="Registered selective service" checked={formData.moralCharacter.registeredSelectiveService} onSave={(value) => scalarMutation.mutate({ path: "moralCharacter.registeredSelectiveService", value })} />
          </div>
        </SectionCard>

        <SectionCard title="Oath and Allegiance" description="Final supported oath answers that drive the PDF selections." icon={HandMetal}>
          <div className="grid gap-3 md:grid-cols-2">
            <EditableBoolean label="Support Constitution" checked={formData.oath.supportConstitution} onSave={(value) => scalarMutation.mutate({ path: "oath.supportConstitution", value })} />
            <EditableBoolean label="Willing to take oath" checked={formData.oath.willingTakeOath} onSave={(value) => scalarMutation.mutate({ path: "oath.willingTakeOath", value })} />
            <EditableBoolean label="Willing to bear arms" checked={formData.oath.willingBearArms} onSave={(value) => scalarMutation.mutate({ path: "oath.willingBearArms", value })} />
            <EditableBoolean label="Noncombat service" checked={formData.oath.willingNoncombatService} onSave={(value) => scalarMutation.mutate({ path: "oath.willingNoncombatService", value })} />
            <EditableBoolean label="National service" checked={formData.oath.willingNationalService} onSave={(value) => scalarMutation.mutate({ path: "oath.willingNationalService", value })} />
          </div>
        </SectionCard>

        <SectionCard title="Additional Information" description="Structured overflow entries for supported extra explanations." icon={Info}>
          {(formData.additionalInfo || []).map((entry, index) => (
            <Card key={`additional-${index}`} className="border-dashed">
              <CardContent className="grid gap-3 pt-4 md:grid-cols-2">
                <EditableField label={`Page number ${index + 1}`} value={entry.pageNumber} onSave={(value) => updateItem("additionalInfo", index, "pageNumber", value)} />
                <EditableField label="Part number" value={entry.partNumber} onSave={(value) => updateItem("additionalInfo", index, "partNumber", value)} />
                <EditableField label="Item number" value={entry.itemNumber} onSave={(value) => updateItem("additionalInfo", index, "itemNumber", value)} />
                <EditableField label="Response" value={entry.response} onSave={(value) => updateItem("additionalInfo", index, "response", value)} multiline />
                <Button variant="outline" size="sm" onClick={() => removeItemMutation.mutate({ path: "additionalInfo", index })}>
                  <Trash2 className="mr-1 h-3 w-3" /> Remove entry
                </Button>
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" size="sm" onClick={() => addItemMutation.mutate({ path: "additionalInfo", value: { pageNumber: "", partNumber: "", itemNumber: "", response: "" } })}>
            <Plus className="mr-1 h-3 w-3" /> Add additional info
          </Button>
        </SectionCard>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-start gap-3">
              <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} data-testid="checkbox-review-confirm" />
              <Label className="text-sm leading-relaxed">
                I reviewed the information above and understand I can still edit here or return to the assistant before continuing.
              </Label>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => navigate("/chat")} data-testid="button-resume-chat">
                <Pencil className="mr-2 h-4 w-4" /> Edit with assistant
              </Button>
              {!isPaid ? (
                <Button onClick={() => navigate("/payment")} disabled={!confirmed || blocking} data-testid="button-continue-payment">
                  <FileText className="mr-2 h-4 w-4" /> Continue to payment
                </Button>
              ) : stalePdf || !session?.pdfUrl ? (
                <Button onClick={() => regenerateMutation.mutate()} disabled={regenerateMutation.isPending || blocking || Boolean(jobId)} data-testid="button-regenerate-pdf">
                  {regenerateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                  {jobId ? "Generating PDF..." : "Regenerate PDF"}
                </Button>
              ) : (
                <a href={session.pdfUrl} download>
                  <Button data-testid="button-download-pdf">
                    <Download className="mr-2 h-4 w-4" /> Download PDF
                  </Button>
                </a>
              )}
            </div>
            {blocking ? <p className="text-sm text-muted-foreground">Fill the remaining required fields before payment can continue.</p> : null}
            {isPaid ? (
              <>
                <Separator />
                <p className="text-sm text-muted-foreground">
                  After payment, edits here mark the PDF as stale until you regenerate it. You can also jump back into chat without losing review context.
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
