import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { mapFormDataToPdfFields } from "../server/pdfMapper.js";
import { validatePdfReadiness } from "../server/pdfValidation.js";
import type { N400FormData } from "../shared/schema.js";

const GENERATED_DIR = path.resolve("generated_pdfs");
const PDF_TEMPLATE_PATH = path.resolve("server/pdf/n400_acroform.pdf");
const PDF_POPULATOR_PATH = path.resolve("server/pdf/n400_populator.py");

export const sampleFormData: N400FormData = {
  personalInfo: {
    fullName: "CARLOS EDUARDO MARTINEZ",
    firstName: "CARLOS",
    lastName: "MARTINEZ",
    middleName: "EDUARDO",
    otherNamesUsed: [
      {
        firstName: "CARLOS",
        lastName: "MARTINEZ LOPEZ",
        middleName: "E",
      },
    ],
    dateOfBirth: "04/15/1985",
    aNumber: "A987654321",
    uscisElisNumber: "1234567890",
    dateBecamePR: "06/01/2019",
    countryOfBirth: "Mexico",
    nationality: "Mexico",
    gender: "Male",
    ssn: "123-45-6789",
    email: "carlos.martinez@email.com",
    phone: "217-555-0100",
    mobilePhone: "217-555-0199",
    eligibilityBasis: "5-year LPR",
  },
  biographic: {
    ethnicity: "Hispanic",
    race: "White",
    heightFeet: 5,
    heightInches: 10,
    weightLbs: 175,
    eyeColor: "BRO",
    hairColor: "BLK",
  },
  residenceHistory: [
    {
      address: "123 Main Street, Apt 4B",
      city: "Springfield",
      state: "IL",
      zip: "62701",
      country: "United States",
      moveInDate: "08/2022",
    },
    {
      address: "456 Oak Avenue",
      city: "Chicago",
      state: "IL",
      zip: "60601",
      country: "United States",
      moveInDate: "01/2017",
      moveOutDate: "08/2022",
    },
    {
      address: "789 Elm Street",
      city: "Guadalajara",
      state: "Jalisco",
      zip: "44100",
      country: "Mexico",
      moveInDate: "01/2015",
      moveOutDate: "12/2016",
    },
  ],
  family: {
    maritalStatus: "Married",
    timesMarried: 1,
    spouseTimesMarried: 1,
    householdSize: 4,
    householdIncomeEarners: 2,
    feeReductionRequested: false,
    headOfHousehold: false,
    headOfHouseholdName: "CARLOS EDUARDO MARTINEZ",
    spouse: {
      fullName: "MARIA ISABEL MARTINEZ",
      dateOfBirth: "09/22/1987",
      dateOfMarriage: "06/15/2013",
      isCitizen: true,
      citizenshipBy: "Birth",
      aNumber: "A555666777",
      currentEmployer: "Springfield Clinic",
    },
    children: [
      {
        fullName: "SOFIA MARTINEZ",
        aNumber: "A111222333",
        dateOfBirth: "01/10/2012",
        relationship: "biological daughter",
        receivingSupport: true,
        livesWithYou: true,
      },
      {
        fullName: "DIEGO MARTINEZ",
        aNumber: "A444555666",
        dateOfBirth: "03/18/2015",
        relationship: "biological son",
        receivingSupport: true,
        livesWithYou: true,
      },
    ],
    totalChildren: 2,
  },
  employment: [
    {
      employerName: "ABC Technology Corp",
      occupation: "Software Engineer",
      city: "Springfield",
      state: "IL",
      zip: "62701",
      country: "United States",
      startDate: "03/2020",
      endDate: "Present",
    },
    {
      employerName: "XYZ Solutions LLC",
      occupation: "Software Developer",
      city: "Chicago",
      state: "IL",
      zip: "60601",
      country: "United States",
      startDate: "01/2017",
      endDate: "02/2020",
    },
  ],
  travelHistory: [
    { destination: "Mexico", departureDate: "12/20/2023", returnDate: "01/05/2024" },
    { destination: "Mexico", departureDate: "07/10/2022", returnDate: "07/25/2022" },
    { destination: "Canada", departureDate: "09/01/2021", returnDate: "09/05/2021" },
  ],
  moralCharacter: {
    claimedUSCitizen: false,
    votedInElection: false,
    alwaysFiledTaxes: true,
    owedUnpaidTaxes: false,
    arrestedOrDetained: false,
    convictedOfCrime: false,
    usedIllegalDrugs: false,
    habitualDrunkard: false,
    helpedIllegalEntry: false,
    liedToGovernment: false,
    deported: false,
    memberOfOrganizations: false,
    communistPartyMember: false,
    terroristAssociation: false,
    committedViolence: false,
    militaryService: false,
    registeredSelectiveService: true,
  },
  oath: {
    supportConstitution: true,
    willingTakeOath: true,
    willingBearArms: true,
    willingNoncombatService: true,
    willingNationalService: true,
  },
};

export const edgeCaseData: N400FormData = {
  personalInfo: {
    fullName: "ANNA MARIA JOHANSSON-REYES",
    firstName: "ANNA",
    lastName: "JOHANSSON-REYES",
    middleName: "MARIA",
    dateOfBirth: "11/30/1990",
    aNumber: "A123456789",
    uscisElisNumber: "9876543210",
    dateBecamePR: "03/15/2022",
    countryOfBirth: "Sweden",
    nationality: "Sweden",
    gender: "Female",
    ssn: "987-65-4321",
    email: "anna.johansson@email.com",
    phone: "310-555-1234",
    mobilePhone: "310-555-5678",
    eligibilityBasis: "Qualified Employment Abroad",
    eligibilityUscisOffice: "Los Angeles CA",
  },
  biographic: {
    ethnicity: "NotHispanic",
    race: "Asian",
    heightFeet: 5,
    heightInches: 4,
    weightLbs: 98,
    eyeColor: "GRN",
    hairColor: "BLN",
  },
  residenceHistory: [
    {
      address: "9876 Wilshire Boulevard",
      city: "Los Angeles",
      state: "CA",
      zip: "90024",
      country: "United States",
      moveInDate: "06/2023",
    },
    {
      address: "500 Broadway, Suite 300",
      city: "New York",
      state: "NY",
      zip: "10012",
      country: "United States",
      moveInDate: "01/2022",
      moveOutDate: "06/2023",
    },
    {
      address: "100 King Street, Floor 5",
      city: "Stockholm",
      state: "Stockholm",
      zip: "11149",
      country: "Sweden",
      moveInDate: "03/2019",
      moveOutDate: "12/2021",
    },
    {
      address: "25 Rue de Rivoli",
      city: "Paris",
      state: "Ile-de-France",
      zip: "75001",
      country: "France",
      moveInDate: "08/2016",
      moveOutDate: "02/2019",
    },
  ],
  mailingAddress: {
    inCareOfName: "C/O Reyes Family",
    address: "200 Market Street, Suite 10",
    city: "Toronto",
    province: "Ontario",
    postalCode: "M5H 2N2",
    country: "Canada",
  },
  family: {
    maritalStatus: "Married",
    timesMarried: 2,
    spouseTimesMarried: 1,
    spouse: {
      fullName: "JAMES WILLIAM REYES",
      dateOfBirth: "05/14/1988",
      dateOfMarriage: "09/20/2021",
      isCitizen: true,
      citizenshipBy: "Other",
      dateBecameCitizen: "10/01/2018",
      aNumber: "A999888777",
      currentEmployer: "Reyes Logistics",
    },
    children: [
      {
        fullName: "EMMA REYES",
        aNumber: "A111111111",
        livesWithYou: true,
        dateOfBirth: "01/01/2015",
        countryOfBirth: "United States",
        relationship: "biological daughter",
        receivingSupport: true,
      },
      {
        fullName: "LUCAS REYES",
        aNumber: "A222222222",
        livesWithYou: true,
        dateOfBirth: "02/02/2017",
        countryOfBirth: "United States",
        relationship: "biological son",
        receivingSupport: true,
      },
      {
        fullName: "SOFIA JOHANSSON",
        aNumber: "A333333333",
        livesWithYou: false,
        dateOfBirth: "03/03/2011",
        countryOfBirth: "Sweden",
        relationship: "stepchild",
        receivingSupport: false,
      },
      {
        fullName: "OLIVER ALEXANDER JOHANSSON",
        aNumber: "A444444444",
        livesWithYou: true,
        dateOfBirth: "04/04/2009",
        countryOfBirth: "France",
        relationship: "biological son",
        receivingSupport: true,
      },
    ],
    totalChildren: 4,
    householdSize: 5,
    totalHouseholdIncome: 120000,
    householdIncomeEarners: 2,
    feeReductionRequested: true,
    headOfHousehold: true,
  },
  employment: [
    {
      employerName: "Global Tech Industries Inc.",
      occupation: "Senior Product Manager",
      city: "Los Angeles",
      state: "CA",
      zip: "90024",
      country: "United States",
      startDate: "06/2023",
      endDate: "Present",
    },
    {
      employerName: "Nordic Innovation AB",
      occupation: "Product Designer",
      city: "New York",
      state: "NY",
      zip: "10012",
      country: "United States",
      startDate: "01/2022",
      endDate: "05/2023",
    },
    {
      employerName: "Stockholm Design Co.",
      occupation: "UX Researcher",
      city: "Stockholm",
      state: "Stockholm",
      zip: "11149",
      country: "Sweden",
      startDate: "03/2019",
      endDate: "12/2021",
    },
  ],
  travelHistory: [
    { destination: "Sweden", departureDate: "12/15/2024", returnDate: "01/10/2025" },
    { destination: "France", departureDate: "07/01/2024", returnDate: "07/20/2024" },
    { destination: "Japan", departureDate: "03/10/2024", returnDate: "03/25/2024" },
    { destination: "Mexico", departureDate: "11/20/2023", returnDate: "11/30/2023" },
    { destination: "United Kingdom", departureDate: "06/01/2023", returnDate: "06/15/2023" },
    { destination: "Norway", departureDate: "12/20/2022", returnDate: "01/05/2023" },
  ],
  moralCharacter: {
    claimedUSCitizen: true,
    votedInElection: true,
    alwaysFiledTaxes: false,
    owedUnpaidTaxes: true,
    arrestedOrDetained: true,
    convictedOfCrime: true,
    usedIllegalDrugs: true,
    habitualDrunkard: true,
    helpedIllegalEntry: true,
    liedToGovernment: true,
    deported: true,
    memberOfOrganizations: true,
    communistPartyMember: true,
    terroristAssociation: true,
    committedViolence: true,
    militaryService: true,
    registeredSelectiveService: false,
  },
  oath: {
    supportConstitution: false,
    willingTakeOath: false,
    willingBearArms: false,
    willingNoncombatService: false,
    willingNationalService: false,
  },
  additionalInfo: [
    {
      pageNumber: "2",
      partNumber: "2",
      itemNumber: "2",
      response: "Other name used since birth: ANNA MARIA JOHANSSON.",
    },
  ],
};

run();

function run() {
  const sampleOutput = mapFormDataToPdfFields(sampleFormData);
  const edgeOutput = mapFormDataToPdfFields(edgeCaseData);
  const sampleContract = loadSampleContract();
  const sampleDiff = diffAgainstContract(sampleContract, sampleOutput);
  const sampleValidation = validatePdfReadiness(sampleFormData, sampleOutput);
  const edgeValidation = validatePdfReadiness(edgeCaseData, edgeOutput);
  const coverageAudit = auditSupportedOptionalCoverage(sampleOutput, edgeOutput);
  const roundTrip = runPdfRoundTripChecks(sampleOutput, edgeOutput);

  console.log("Sample contract check");
  console.log(`  expected fields: ${Object.keys(sampleContract).length}`);
  console.log(`  mapped fields:   ${Object.keys(sampleOutput).length}`);
  console.log(`  missing fields:  ${sampleDiff.missing.length}`);
  console.log(`  wrong values:    ${sampleDiff.wrong.length}`);
  console.log(`  extra fields:    ${sampleDiff.extra.length}`);

  console.log("\nSample readiness");
  printValidation(sampleValidation);

  console.log("\nEdge-case readiness");
  printValidation(edgeValidation);

  console.log("\nOptional coverage");
  console.log(`  checks:          ${coverageAudit.total}`);
  console.log(`  failures:        ${coverageAudit.failures.length}`);
  if (coverageAudit.failures.length > 0) {
    console.log(`  failure list:    ${coverageAudit.failures.join(" | ")}`);
  }

  console.log("\nPDF round-trip");
  console.log(`  checks:          ${roundTrip.total}`);
  console.log(`  failures:        ${roundTrip.failures.length}`);
  if (roundTrip.failures.length > 0) {
    console.log(`  failure list:    ${roundTrip.failures.join(" | ")}`);
  }

  if (
    !sampleValidation.valid ||
    !edgeValidation.valid ||
    coverageAudit.failures.length > 0 ||
    roundTrip.failures.length > 0
  ) {
    process.exitCode = 1;
  }
}

function loadSampleContract(): Record<string, string> {
  const raw = JSON.parse(
    fs.readFileSync(
      path.resolve("server/pdf/sample_data.json"),
      "utf8",
    ),
  ) as Record<string, string>;

  return Object.fromEntries(
    Object.entries(raw).filter(([key]) => !key.startsWith("_")),
  );
}

function diffAgainstContract(
  expected: Record<string, string>,
  actual: Record<string, string>,
) {
  const missing: string[] = [];
  const wrong: string[] = [];
  const extra: string[] = [];

  for (const [key, value] of Object.entries(expected)) {
    if (!(key in actual)) {
      missing.push(key);
    } else if (actual[key] !== value) {
      wrong.push(`${key}: expected=${JSON.stringify(value)} actual=${JSON.stringify(actual[key])}`);
    }
  }

  for (const key of Object.keys(actual)) {
    if (!(key in expected)) {
      extra.push(key);
    }
  }

  return { missing, wrong, extra };
}

function printValidation(result: ReturnType<typeof validatePdfReadiness>) {
  console.log(`  valid:           ${result.valid}`);
  console.log(`  mapped fields:   ${result.mappedFieldCount}`);
  console.log(`  missing fields:  ${result.missingFields.length}`);
  console.log(`  errors:          ${result.errors.length}`);
  console.log(`  unsupported:     ${result.unsupportedFields.length}`);
  console.log(`  warnings:        ${result.warnings.length}`);

  if (result.missingFields.length > 0) {
    console.log(`  missing list:    ${result.missingFields.join(", ")}`);
  }
  if (result.errors.length > 0) {
    console.log(`  error list:      ${result.errors.join(" | ")}`);
  }
  if (result.unsupportedFields.length > 0) {
    console.log(`  unsupported list:${result.unsupportedFields.join(", ")}`);
  }
}

function auditSupportedOptionalCoverage(
  sampleOutput: Record<string, string>,
  edgeOutput: Record<string, string>,
) {
  const cases: Array<{ label: string; field: string; source: Record<string, string>; value?: string }> = [
    { label: "current residence from date", field: "P4_Line1_DatesofResidence[1]", source: sampleOutput, value: "08/2022" },
    { label: "other name family", field: "Line2_FamilyName2[0]", source: sampleOutput, value: "MARTINEZ LOPEZ" },
    { label: "other name given", field: "Line3_GivenName2[0]", source: sampleOutput, value: "CARLOS" },
    { label: "other name middle", field: "Line3_MiddleName2[0]", source: sampleOutput, value: "E" },
    { label: "mailing street", field: "P5_Line1b_StreetName[0]", source: sampleOutput, value: "123 Main Street" },
    { label: "spouse A-number", field: "P7_Line6_ANumber[0]", source: sampleOutput, value: "A555666777" },
    { label: "spouse employer", field: "P10_Line4g_Employer[0]", source: sampleOutput, value: "Springfield Clinic" },
    { label: "spouse times married", field: "TextField1[0]", source: sampleOutput, value: "1" },
    { label: "spouse became citizen by birth", field: "P10_Line5a_When[0]", source: sampleOutput, value: "yes" },
    { label: "spouse became citizen other", field: "P10_Line5a_When[1]", source: edgeOutput, value: "yes" },
    { label: "spouse citizenship date", field: "P10_Line5b_DateBecame[0]", source: edgeOutput, value: "10/01/2018" },
    { label: "child 1 DOB", field: "P7_OccupationFieldStudy1[0]", source: sampleOutput, value: "01/10/2012" },
    { label: "child 1 relationship", field: "P7_OccupationFieldStudy1[1]", source: sampleOutput, value: "biological daughter" },
    { label: "child 1 support yes", field: "P9_Line5a[0]", source: sampleOutput, value: "yes" },
    { label: "child 2 DOB", field: "P7_OccupationFieldStudy2[0]", source: sampleOutput, value: "03/18/2015" },
    { label: "child 2 relationship", field: "P7_OccupationFieldStudy2[1]", source: sampleOutput, value: "biological son" },
    { label: "child 3 support no", field: "P6_ChildThree[0]", source: edgeOutput, value: "yes" },
    { label: "child 3 name", field: "P7_EmployerName3[0]", source: edgeOutput, value: "SOFIA JOHANSSON" },
    { label: "employment row 1 employer", field: "P5_EmployerName1[0]", source: sampleOutput, value: "ABC Technology Corp" },
    { label: "employment row 1 occupation", field: "P7_OccupationFieldStudy1[2]", source: sampleOutput, value: "Software Engineer" },
    { label: "employment row 2 employer", field: "P5_EmployerName2[0]", source: sampleOutput, value: "XYZ Solutions LLC" },
    { label: "employment row 3 employer", field: "P5_EmployerName3[0]", source: edgeOutput, value: "Stockholm Design Co." },
    { label: "employment row 3 occupation", field: "P7_OccupationFieldStudy3[2]", source: edgeOutput, value: "UX Researcher" },
    { label: "residence row 3 address", field: "P4_Line3_PhysicalAddress3[0]", source: edgeOutput, value: "25 Rue de Rivoli" },
    { label: "residence row 3 from", field: "P4_Line3_From3[0]", source: edgeOutput, value: "08/2016" },
    { label: "residence row 3 to", field: "P4_Line3_To3[0]", source: edgeOutput, value: "02/2019" },
    { label: "travel row 4 destination", field: "P8_Line1_Countries4[0]", source: edgeOutput, value: "Mexico" },
    { label: "travel row 5 destination", field: "P8_Line1_Countries5[0]", source: edgeOutput, value: "United Kingdom" },
    { label: "travel row 6 destination", field: "P8_Line1_Countries6[0]", source: edgeOutput, value: "Norway" },
    { label: "eligibility office", field: "DropDownList1[0]", source: edgeOutput, value: "Los Angeles CA" },
    { label: "separate mailing address checkbox", field: "Pt3_Line2a_Checkbox[0]", source: edgeOutput, value: "yes" },
    { label: "mailing in care of", field: "P5_Line1b_InCareOfName[0]", source: edgeOutput, value: "C/O Reyes Family" },
    { label: "mailing province", field: "P5_Line1b_Province[0]", source: edgeOutput, value: "Ontario" },
    { label: "mailing postal code", field: "P5_Line1b_PostalCode[0]", source: edgeOutput, value: "M5H 2N2" },
    { label: "fee reduction yes", field: "P10_Line1_Citizen[1]", source: edgeOutput, value: "yes" },
    { label: "household income", field: "P10_Line2_TotalHouseholdIn[0]", source: edgeOutput, value: "120000" },
    { label: "household earners", field: "P11_Line1_TotalChildren[1]", source: edgeOutput, value: "2" },
    { label: "head of household yes", field: "P10_Line5a[1]", source: edgeOutput, value: "yes" },
    { label: "claimed US citizen yes", field: "P9_Line7a[1]", source: edgeOutput, value: "yes" },
    { label: "voted in election yes", field: "P9_Line8a[1]", source: edgeOutput, value: "yes" },
    { label: "arrested or detained yes", field: "P9_Line15a[1]", source: edgeOutput, value: "yes" },
    { label: "used illegal drugs yes", field: "P12_Line16[1]", source: edgeOutput, value: "yes" },
    { label: "registered selective service no", field: "P12_Line17f[1]", source: edgeOutput, value: "yes" },
    { label: "support constitution no", field: "P12_Line18[1]", source: edgeOutput, value: "yes" },
    { label: "take oath no", field: "P12_Line27[1]", source: edgeOutput, value: "yes" },
    { label: "bear arms no", field: "P12_Line30a[1]", source: edgeOutput, value: "yes" },
    { label: "noncombat no", field: "P12_Line30b[1]", source: edgeOutput, value: "yes" },
    { label: "national service no", field: "P12_Line31[0]", source: edgeOutput, value: "yes" },
    { label: "additional info entry page", field: "P11_Line3A[0]", source: edgeOutput, value: "2" },
    { label: "additional info entry part", field: "P11_Line3B[0]", source: edgeOutput, value: "2" },
    { label: "additional info entry item", field: "P11_Line3C[0]", source: edgeOutput, value: "2" },
    { label: "additional info entry response", field: "P11_Line3D[0]", source: edgeOutput, value: "Other name used since birth: ANNA MARIA JOHANSSON." },
    { label: "overflow child 4 page", field: "P11_Line4A[0]", source: edgeOutput, value: "5" },
    { label: "overflow child 4 part", field: "P11_Line4B[0]", source: edgeOutput, value: "6" },
    { label: "overflow child 4 item", field: "P11_Line4C[0]", source: edgeOutput, value: "2" },
  ];

  const failures: string[] = [];

  for (const test of cases) {
    const actual = test.source[test.field];
    if (actual === undefined) {
      failures.push(`${test.label} missing (${test.field})`);
      continue;
    }
    if (test.value !== undefined && actual !== test.value) {
      failures.push(`${test.label} expected ${JSON.stringify(test.value)} got ${JSON.stringify(actual)}`);
    }
  }

  return { total: cases.length, failures };
}

function runPdfRoundTripChecks(
  sampleOutput: Record<string, string>,
  edgeOutput: Record<string, string>,
) {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  const sampleJsonPath = path.join(GENERATED_DIR, "codex_sample_data.json");
  const edgeJsonPath = path.join(GENERATED_DIR, "codex_edge_data.json");
  const samplePdfPath = path.join(GENERATED_DIR, "codex_sample_checked.pdf");
  const edgePdfPath = path.join(GENERATED_DIR, "codex_edge_checked.pdf");

  fs.writeFileSync(sampleJsonPath, JSON.stringify(sampleOutput, null, 2));
  fs.writeFileSync(edgeJsonPath, JSON.stringify(edgeOutput, null, 2));

  const python = resolvePythonCommand();
  populatePdf(python, sampleJsonPath, samplePdfPath);
  populatePdf(python, edgeJsonPath, edgePdfPath);

  const sampleFields = inspectPdfFields(python, samplePdfPath, [
    "P4_Line1_DatesofResidence[1]",
    "P4_Line1_DatesofResidence[0]",
    "P5_Line1b_StreetName[0]",
    "Line2_FamilyName2[0]",
    "P7_Line6_ANumber[0]",
    "P9_Line5a[0]",
    "P10_Line1_Citizen[0]",
  ]);
  const edgeFields = inspectPdfFields(python, edgePdfPath, [
    "DropDownList1[0]",
    "Pt3_Line2a_Checkbox[0]",
    "P5_Line1b_InCareOfName[0]",
    "P5_Line1b_Province[0]",
    "P5_Line1b_PostalCode[0]",
    "P10_Line1_Citizen[1]",
    "P10_Line2_TotalHouseholdIn[0]",
    "P11_Line1_TotalChildren[1]",
    "P10_Line5a[1]",
    "P10_Line5b_DateBecame[0]",
    "P12_Line27[1]",
    "P11_Line3A[0]",
    "P11_Line3D[0]",
    "P11_Line4A[0]",
  ]);

  const checks = [
    { label: "sample current residence from date", actual: sampleFields["P4_Line1_DatesofResidence[1]"], expected: "08/2022" },
    { label: "sample current residence to date blank", actual: sampleFields["P4_Line1_DatesofResidence[0]"] ?? "", expected: "" },
    { label: "sample mailing street", actual: sampleFields["P5_Line1b_StreetName[0]"], expected: "123 Main Street" },
    { label: "sample other family name", actual: sampleFields["Line2_FamilyName2[0]"], expected: "MARTINEZ LOPEZ" },
    { label: "sample spouse A-number", actual: sampleFields["P7_Line6_ANumber[0]"], expected: "A555666777" },
    { label: "sample child support yes", actual: sampleFields["P9_Line5a[0]"], expected: "Y" },
    { label: "sample fee reduction no", actual: sampleFields["P10_Line1_Citizen[0]"], expected: "N" },
    { label: "edge eligibility office", actual: edgeFields["DropDownList1[0]"], expected: "Los Angeles CA" },
    { label: "edge separate mailing checkbox", actual: edgeFields["Pt3_Line2a_Checkbox[0]"], expected: "N" },
    { label: "edge mailing in care of", actual: edgeFields["P5_Line1b_InCareOfName[0]"], expected: "C/O Reyes Family" },
    { label: "edge mailing province", actual: edgeFields["P5_Line1b_Province[0]"], expected: "Ontario" },
    { label: "edge mailing postal code", actual: edgeFields["P5_Line1b_PostalCode[0]"], expected: "M5H 2N2" },
    { label: "edge fee reduction yes", actual: edgeFields["P10_Line1_Citizen[1]"], expected: "Y" },
    { label: "edge household income", actual: edgeFields["P10_Line2_TotalHouseholdIn[0]"], expected: "120000" },
    { label: "edge household earners", actual: edgeFields["P11_Line1_TotalChildren[1]"], expected: "2" },
    { label: "edge head of household yes", actual: edgeFields["P10_Line5a[1]"], expected: "Y" },
    { label: "edge spouse citizenship date", actual: edgeFields["P10_Line5b_DateBecame[0]"], expected: "10/01/2018" },
    { label: "edge willing take oath no", actual: edgeFields["P12_Line27[1]"], expected: "N" },
    { label: "edge additional info page", actual: edgeFields["P11_Line3A[0]"], expected: "2" },
    { label: "edge additional info response", actual: edgeFields["P11_Line3D[0]"], expected: "Other name used since birth: ANNA MARIA JOHANSSON." },
    { label: "edge overflow child page", actual: edgeFields["P11_Line4A[0]"], expected: "5" },
  ];

  const failures: string[] = [];
  for (const check of checks) {
    if (check.actual !== check.expected) {
      failures.push(`${check.label} expected ${JSON.stringify(check.expected)} got ${JSON.stringify(check.actual ?? null)}`);
    }
  }

  return { total: checks.length, failures };
}

function resolvePythonCommand() {
  const candidates = process.platform === "win32"
    ? [["python"], ["py", "-3"], ["py"]]
    : [["python3"], ["python"]];

  for (const candidate of candidates) {
    const [command, ...args] = candidate;
    const result = spawnSync(command, [...args, "--version"], { stdio: "ignore" });
    if (result.status === 0) {
      return candidate;
    }
  }

  throw new Error("No Python runtime was found for PDF round-trip verification.");
}

function populatePdf(
  pythonCommand: string[],
  jsonPath: string,
  pdfPath: string,
) {
  const [command, ...args] = pythonCommand;
  const result = spawnSync(
    command,
    [...args, PDF_POPULATOR_PATH, PDF_TEMPLATE_PATH, jsonPath, pdfPath],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(`PDF population failed for ${path.basename(pdfPath)}: ${result.stderr || result.stdout}`);
  }
}

function inspectPdfFields(
  pythonCommand: string[],
  pdfPath: string,
  fieldNames: string[],
) {
  const script = `
import fitz, json, sys
pdf = fitz.open(sys.argv[1])
wanted = set(json.loads(sys.argv[2]))
values = {}
for page in pdf:
    for widget in page.widgets() or []:
        if widget.field_name in wanted and widget.field_name not in values:
            values[widget.field_name] = widget.field_value
print(json.dumps(values))
`.trim();

  const [command, ...args] = pythonCommand;
  const result = spawnSync(
    command,
    [...args, "-c", script, pdfPath, JSON.stringify(fieldNames)],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(`PDF inspection failed for ${path.basename(pdfPath)}: ${result.stderr || result.stdout}`);
  }

  return JSON.parse(result.stdout.trim()) as Record<string, string>;
}
