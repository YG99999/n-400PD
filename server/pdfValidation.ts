import type { ChildInfo, N400FormData } from "../shared/schema.js";

export interface PdfValidationResult {
  valid: boolean;
  missingFields: string[];
  errors: string[];
  warnings: string[];
  intentionallyBlankFields: string[];
  unsupportedFields: string[];
  mappedFieldCount: number;
}

export const INTENTIONALLY_BLANK_PDF_FIELDS = [
  "P4_Line1_DatesofResidence[0]",
  "P12_SignatureApplicant[0]",
  "P13_DateofSignature[0]",
  "ApplicantsSignature[0]",
  "Part15ApplicantsSignature[0]",
  "Part15USCISName[0]",
  "Part15USCISSignature[0]",
];

const REQUIRED_DATA_PATHS = [
  "personalInfo.firstName",
  "personalInfo.lastName",
  "personalInfo.aNumber",
  "personalInfo.dateOfBirth",
  "personalInfo.dateBecamePR",
  "personalInfo.countryOfBirth",
  "personalInfo.nationality",
  "personalInfo.gender",
  "family.maritalStatus",
];

const UNSUPPORTED_COLLECTED_FIELDS = [
  "moralCharacter.alwaysFiledTaxes",
  "moralCharacter.owedUnpaidTaxes",
  "moralCharacter.habitualDrunkard",
];

export function validatePdfReadiness(
  formData: N400FormData,
  pdfFields: Record<string, string>,
): PdfValidationResult {
  const missingFields: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const unsupportedFields: string[] = [];

  for (const path of REQUIRED_DATA_PATHS) {
    const value = getValue(formData, path);
    if (isBlank(value)) {
      missingFields.push(path);
    }
  }

  if (formData.residenceHistory.length === 0) {
    missingFields.push("residenceHistory[0]");
  } else {
    for (const key of ["address", "city", "state", "zip", "country", "moveInDate"]) {
      const path = `residenceHistory[0].${key}`;
      if (isBlank(getValue(formData, path))) {
        missingFields.push(path);
      }
    }
  }

  assertMapped(
    pdfFields,
    ["personalInfo.firstName", "personalInfo.lastName"],
    [
      "P2_Line1_FamilyName[0]",
      "P2_Line1_GivenName[0]",
      "Part2Line3_FamilyName[0]",
      "Part2Line4a_GivenName[0]",
      "Line2_FamilyName1[0]",
      "Line3_GivenName1[0]",
    ],
    errors,
  );

  if (!isBlank(formData.personalInfo.aNumber)) {
    const missingANumberCopies = Array.from({ length: 14 }, (_, i) => `Line1_AlienNumber[${i}]`)
      .filter((field) => !(field in pdfFields));
    if (missingANumberCopies.length > 0) {
      errors.push(`A-number is not repeated on every required page: ${missingANumberCopies.join(", ")}`);
    }
  }

  if (!isBlank(formData.personalInfo.dateOfBirth) && !("P2_Line8_DateOfBirth[0]" in pdfFields)) {
    errors.push("Date of birth is captured but not mapped to the PDF.");
  }

  if (!isBlank(formData.personalInfo.dateBecamePR) && !("P2_Line9_DateBecamePermanentResident[0]" in pdfFields)) {
    errors.push("Permanent resident date is captured but not mapped to the PDF.");
  }

  if (!isBlank(formData.personalInfo.countryOfBirth) && !("P2_Line10_CountryOfBirth[0]" in pdfFields)) {
    errors.push("Country of birth is captured but not mapped to the PDF.");
  }

  if (!isBlank(formData.personalInfo.nationality) && !("P2_Line11_CountryOfNationality[0]" in pdfFields)) {
    errors.push("Nationality is captured but not mapped to the PDF.");
  }

  if (!isBlank(formData.personalInfo.gender)) {
    const hasGender =
      "P2_Line7_Gender[0]" in pdfFields || "P2_Line7_Gender[1]" in pdfFields;
    if (!hasGender) {
      errors.push("Gender is captured but neither gender checkbox is mapped.");
    }
  }

  if (formData.oath.willingTakeOath === false && !("P12_Line27[1]" in pdfFields)) {
    errors.push("A negative answer to willingTakeOath is not mapped to the PDF.");
  }

  if (formData.residenceHistory.length > 4) {
    warnings.push("Only the first 4 residence entries are currently mapped to the PDF.");
  }
  if (formData.employment.length > 3) {
    warnings.push("Only the first 3 employment entries are currently mapped to the PDF.");
  }
  if (formData.travelHistory.length > 6) {
    warnings.push("Only the first 6 travel entries are currently mapped to the PDF.");
  }
  if ((formData.family.children?.length ?? 0) > 4) {
    warnings.push("Only the first 4 children are currently mapped to the PDF additional information page.");
  }

  for (const path of UNSUPPORTED_COLLECTED_FIELDS) {
    const value = getValue(formData, path);
    if (!isBlank(value)) {
      warnings.push(`${path} is collected by the app but is not asked on the current 01/20/25 N-400 PDF.`);
    }
  }

  (formData.family.children ?? []).forEach((child: ChildInfo, index: number) => {
    if (!isBlank(child.countryOfBirth)) {
      warnings.push(`family.children[${index}].countryOfBirth is not used by the current PDF layout.`);
    }

    if (index < 3) {
      if (isBlank(child.dateOfBirth)) {
        missingFields.push(`family.children[${index}].dateOfBirth`);
      }
      if (isBlank(child.relationship)) {
        missingFields.push(`family.children[${index}].relationship`);
      }
      if (child.receivingSupport === undefined) {
        missingFields.push(`family.children[${index}].receivingSupport`);
      }
    }
  });

  if (formData.family.maritalStatus === "Married" && isBlank(formData.family.spouseTimesMarried)) {
    missingFields.push("family.spouseTimesMarried");
  }

  if (formData.residenceHistory.length > 0 && !("P5_Line1b_StreetName[0]" in pdfFields)) {
    errors.push("Mailing address is not being written to page 4.");
  }

  if (formData.mailingAddress) {
    if (!("Pt3_Line2a_Checkbox[0]" in pdfFields)) {
      errors.push("Separate mailing address path is not selected when mailingAddress is provided.");
    }
    if (!("P5_Line1b_StreetName[0]" in pdfFields)) {
      errors.push("Separate mailing address is provided but page 4 mailing fields are not mapped.");
    }
  }

  if (formData.employment.length > 0 && !("P5_EmployerName1[0]" in pdfFields)) {
    errors.push("Employment history is not being written to the page 5 employment table.");
  }

  if (formData.family.feeReductionRequested === true) {
    if (isBlank(formData.family.totalHouseholdIncome)) {
      missingFields.push("family.totalHouseholdIncome");
    }
    if (isBlank(formData.family.householdIncomeEarners)) {
      missingFields.push("family.householdIncomeEarners");
    }
  }

  assertExclusive(pdfFields, "P10_Line1_Citizen", errors);
  assertExclusive(pdfFields, "P10_Line5a", errors);
  assertExclusive(pdfFields, "P9_Line5a", errors);

  const valid =
    missingFields.length === 0 &&
    errors.length === 0;

  return {
    valid,
    missingFields,
    errors,
    warnings,
    intentionallyBlankFields: INTENTIONALLY_BLANK_PDF_FIELDS,
    unsupportedFields,
    mappedFieldCount: Object.keys(pdfFields).length,
  };
}

function assertMapped(
  pdfFields: Record<string, string>,
  dataPaths: string[],
  fieldNames: string[],
  errors: string[],
) {
  const hasAnyField = fieldNames.some((field) => field in pdfFields);
  if (!hasAnyField) {
    errors.push(`Expected mapped PDF fields for ${dataPaths.join(", ")} are missing.`);
  }
}

function assertExclusive(
  pdfFields: Record<string, string>,
  base: string,
  errors: string[],
) {
  if (`${base}[0]` in pdfFields && `${base}[1]` in pdfFields) {
    errors.push(`Both options are checked for ${base}.`);
  }
}

function getValue(source: unknown, path: string): unknown {
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

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}
