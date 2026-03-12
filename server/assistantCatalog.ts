import type { CatalogFieldRequirement, N400FormData, Section } from "@shared/schema";

export interface CatalogField {
  path: string;
  section: Section;
  required: boolean;
  description: string;
  guidance?: string;
  dependsOn?: string[];
  requiredWhen?: CatalogFieldRequirement;
}

export const CATALOG_FIELDS: CatalogField[] = [
  { path: "personalInfo.fullName", section: "PERSONAL_INFO", required: true, description: "Applicant's full legal name" },
  { path: "personalInfo.firstName", section: "PERSONAL_INFO", required: true, description: "Applicant's first name" },
  { path: "personalInfo.lastName", section: "PERSONAL_INFO", required: true, description: "Applicant's last name" },
  { path: "personalInfo.dateOfBirth", section: "PERSONAL_INFO", required: true, description: "Date of birth in MM/DD/YYYY" },
  { path: "personalInfo.aNumber", section: "PERSONAL_INFO", required: true, description: "Alien registration number" },
  { path: "personalInfo.dateBecamePR", section: "PERSONAL_INFO", required: true, description: "Resident since date" },
  { path: "personalInfo.countryOfBirth", section: "PERSONAL_INFO", required: true, description: "Country of birth" },
  { path: "personalInfo.nationality", section: "PERSONAL_INFO", required: true, description: "Current nationality" },
  { path: "personalInfo.gender", section: "PERSONAL_INFO", required: true, description: "Gender listed on N-400" },
  { path: "personalInfo.email", section: "PERSONAL_INFO", required: true, description: "Email address" },
  { path: "personalInfo.phone", section: "PERSONAL_INFO", required: true, description: "Daytime phone number" },
  { path: "personalInfo.eligibilityBasis", section: "PERSONAL_INFO", required: true, description: "Eligibility basis for naturalization" },
  { path: "biographic.ethnicity", section: "PERSONAL_INFO", required: true, description: "Ethnicity selection" },
  { path: "biographic.race", section: "PERSONAL_INFO", required: true, description: "Race selection" },
  { path: "biographic.heightFeet", section: "PERSONAL_INFO", required: true, description: "Height feet" },
  { path: "biographic.heightInches", section: "PERSONAL_INFO", required: true, description: "Height inches" },
  { path: "biographic.weightLbs", section: "PERSONAL_INFO", required: true, description: "Weight in pounds" },
  { path: "biographic.eyeColor", section: "PERSONAL_INFO", required: true, description: "Eye color code" },
  { path: "biographic.hairColor", section: "PERSONAL_INFO", required: true, description: "Hair color code" },
  { path: "residenceHistory[0].address", section: "RESIDENCE_HISTORY", required: true, description: "Current physical street address" },
  { path: "residenceHistory[0].city", section: "RESIDENCE_HISTORY", required: true, description: "Current physical city" },
  { path: "residenceHistory[0].state", section: "RESIDENCE_HISTORY", required: true, description: "Current physical state" },
  { path: "residenceHistory[0].zip", section: "RESIDENCE_HISTORY", required: true, description: "Current physical ZIP code" },
  { path: "residenceHistory[0].country", section: "RESIDENCE_HISTORY", required: true, description: "Current physical country" },
  { path: "residenceHistory[0].moveInDate", section: "RESIDENCE_HISTORY", required: true, description: "Current residence move-in date" },
  { path: "family.maritalStatus", section: "FAMILY_INFO", required: true, description: "Current marital status" },
  { path: "family.timesMarried", section: "FAMILY_INFO", required: false, description: "How many times applicant has been married" },
  { path: "family.spouseTimesMarried", section: "FAMILY_INFO", required: false, description: "How many times the current spouse has been married", dependsOn: ["family.maritalStatus"], requiredWhen: { path: "family.maritalStatus", equals: "Married" } },
  { path: "family.spouse.fullName", section: "FAMILY_INFO", required: false, description: "Current spouse full name", dependsOn: ["family.maritalStatus"], requiredWhen: { path: "family.maritalStatus", equals: "Married" } },
  { path: "family.spouse.dateOfBirth", section: "FAMILY_INFO", required: false, description: "Current spouse date of birth", dependsOn: ["family.maritalStatus"], requiredWhen: { path: "family.maritalStatus", equals: "Married" } },
  { path: "family.spouse.dateOfMarriage", section: "FAMILY_INFO", required: false, description: "Date of current marriage", dependsOn: ["family.maritalStatus"], requiredWhen: { path: "family.maritalStatus", equals: "Married" } },
  { path: "family.totalChildren", section: "FAMILY_INFO", required: true, description: "Total number of children" },
  { path: "employment", section: "EMPLOYMENT", required: true, description: "Employment history entries covering the required period" },
  { path: "travelHistory", section: "TRAVEL", required: true, description: "Trips outside the US during the required period" },
  { path: "moralCharacter.claimedUSCitizen", section: "MORAL_CHARACTER", required: true, description: "Claimed US citizenship answer" },
  { path: "moralCharacter.votedInElection", section: "MORAL_CHARACTER", required: true, description: "Voted in election answer" },
  { path: "moralCharacter.arrestedOrDetained", section: "MORAL_CHARACTER", required: true, description: "Arrested or detained answer" },
  { path: "moralCharacter.convictedOfCrime", section: "MORAL_CHARACTER", required: true, description: "Convicted of crime answer" },
  { path: "moralCharacter.usedIllegalDrugs", section: "MORAL_CHARACTER", required: true, description: "Illegal drug use answer" },
  { path: "moralCharacter.militaryService", section: "MORAL_CHARACTER", required: true, description: "Military service answer" },
  { path: "moralCharacter.registeredSelectiveService", section: "MORAL_CHARACTER", required: true, description: "Selective service registration answer when applicable" },
  { path: "oath.supportConstitution", section: "OATH", required: true, description: "Support Constitution answer" },
  { path: "oath.willingTakeOath", section: "OATH", required: true, description: "Willing to take oath answer" },
  { path: "oath.willingBearArms", section: "OATH", required: true, description: "Willing to bear arms answer" },
  { path: "oath.willingNoncombatService", section: "OATH", required: true, description: "Willing for noncombat service answer" },
  { path: "oath.willingNationalService", section: "OATH", required: true, description: "Willing for national service answer" },
];

export function buildFieldCatalogPrompt() {
  return CATALOG_FIELDS.map((field) => {
    const suffix = field.guidance ? ` Guidance: ${field.guidance}` : "";
    const depends = field.dependsOn?.length ? ` Depends on: ${field.dependsOn.join(", ")}.` : "";
    const required = field.requiredWhen
      ? `conditional:${field.requiredWhen.path}=${String(field.requiredWhen.equals)}`
      : String(field.required);
    return `- ${field.path} [section=${field.section}] [required=${required}] ${field.description}.${depends}${suffix}`;
  }).join("\n");
}

export function isCatalogFieldRequired(field: CatalogField, formData: N400FormData) {
  if (field.required) return true;
  if (!field.requiredWhen) return false;
  const actual = getValueAtPath(formData, field.requiredWhen.path);
  return actual === field.requiredWhen.equals;
}

export function determineSectionForPath(path: string): Section {
  const matched = CATALOG_FIELDS.find((field) => path === field.path || path.startsWith(`${field.path}.`) || path.startsWith(field.path.replace(/\[\d+\]/g, "")));
  if (matched) return matched.section;
  if (path.startsWith("personalInfo.") || path.startsWith("biographic.")) return "PERSONAL_INFO";
  if (path.startsWith("residenceHistory") || path.startsWith("mailingAddress")) return "RESIDENCE_HISTORY";
  if (path.startsWith("family.")) return "FAMILY_INFO";
  if (path.startsWith("employment")) return "EMPLOYMENT";
  if (path.startsWith("travelHistory")) return "TRAVEL";
  if (path.startsWith("moralCharacter")) return "MORAL_CHARACTER";
  if (path.startsWith("oath")) return "OATH";
  return "REVIEW";
}

export function getSectionPrompt(section: Section) {
  switch (section) {
    case "INTRO":
      return "Confirm eligibility context, explain the flow, and gather any gating facts needed before starting the form.";
    case "PERSONAL_INFO":
      return "Collect identity, biographic, contact, and eligibility details exactly as needed for the N-400.";
    case "RESIDENCE_HISTORY":
      return "Collect the current physical address, separate mailing address when applicable, and address history covering the required period.";
    case "FAMILY_INFO":
      return "Collect marital history, spouse details when applicable, and all children information needed by the supported PDF scope.";
    case "EMPLOYMENT":
      return "Collect employment and school history entries covering the required period.";
    case "TRAVEL":
      return "Collect all trips outside the US during the required period and clarify ambiguous dates.";
    case "MORAL_CHARACTER":
      return "Ask each supported moral character question carefully, explain if needed, and confirm sensitive yes/no answers.";
    case "OATH":
      return "Confirm oath and allegiance answers carefully and explain the meaning in plain language if the user is unsure.";
    case "REVIEW":
      return "Support review-mode corrections, only changing the fields the user intends to edit.";
    default:
      return "Collect the remaining supported N-400 information.";
  }
}

export function summarizeScope(formData: N400FormData) {
  return {
    currentResidenceCount: formData.residenceHistory.length,
    childrenCount: formData.family.children?.length ?? 0,
    employmentCount: formData.employment.length,
    travelCount: formData.travelHistory.length,
    paymentReady: Boolean(formData.personalInfo.fullName),
  };
}

function getValueAtPath(source: unknown, path: string): unknown {
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
