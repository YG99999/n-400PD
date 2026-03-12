/**
 * EDGE-CASE TEST: Person with EVERY optional field filled and every
 * moral character flag triggered ("yes" to all negative questions).
 *
 * Tests: 3 employers, 6 trips, 4 children, 4 addresses, military service,
 * all criminal/moral flags, female, 3-year spouse eligibility, disability,
 * name change, different race/ethnicity, etc.
 */
import { mapFormDataToPdfFields } from "./server/pdfMapper";
import type { N400FormData } from "./shared/schema";
import fs from "fs";

const edgeCaseData: N400FormData = {
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
    eligibilityBasis: "3-year spouse", // 3-year spouse path
  },
  biographic: {
    ethnicity: "NotHispanic",
    race: "Asian", // testing different race
    heightFeet: 5,
    heightInches: 4,
    weightLbs: 98, // under 100 — tests leading zero in weight
    eyeColor: "GRN",
    hairColor: "BLN",
  },
  residenceHistory: [
    // Current address (no unit — tests no-unit path)
    {
      address: "9876 Wilshire Boulevard",
      city: "Los Angeles",
      state: "CA",
      zip: "90024",
      country: "United States",
      moveInDate: "06/2023",
    },
    // Previous address 1 (Suite — tests STE unit type)
    {
      address: "500 Broadway, Suite 300",
      city: "New York",
      state: "NY",
      zip: "10012",
      country: "United States",
      moveInDate: "01/2022",
      moveOutDate: "06/2023",
    },
    // Previous address 2 (Floor — tests FLR unit type)
    {
      address: "100 King Street, Floor 5",
      city: "Stockholm",
      state: "Stockholm",
      zip: "11149",
      country: "Sweden",
      moveInDate: "03/2019",
      moveOutDate: "12/2021",
    },
    // Previous address 3 (tests 4th address slot)
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
  family: {
    maritalStatus: "Married",
    timesMarried: 2, // married twice
    spouse: {
      fullName: "JAMES WILLIAM REYES",
      dateOfBirth: "05/14/1988",
      dateOfMarriage: "09/20/2021",
      isCitizen: true,
      citizenshipBy: "Other", // naturalized — tests "Other" path
    },
    children: [
      {
        fullName: "EMMA REYES",
        aNumber: "A111111111",
        livesWithYou: true,
      },
      {
        fullName: "LUCAS REYES",
        aNumber: "A222222222",
        livesWithYou: true,
      },
      {
        fullName: "SOFIA JOHANSSON",
        aNumber: "A333333333",
        livesWithYou: false, // child does NOT live with applicant
      },
      {
        fullName: "OLIVER ALEXANDER JOHANSSON",
        aNumber: "A444444444",
        livesWithYou: true,
      },
    ],
    totalChildren: 4,
    householdSize: 5, // 2 adults + 3 children living with (Sofia doesn't)
  },
  employment: [
    // Employer 1 (current)
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
    // Employer 2
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
    // Employer 3 (tests 3rd employer slot)
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
    // 6 trips — tests all 6 slots
    { destination: "Sweden", departureDate: "12/15/2024", returnDate: "01/10/2025" },
    { destination: "France", departureDate: "07/01/2024", returnDate: "07/20/2024" },
    { destination: "Japan", departureDate: "03/10/2024", returnDate: "03/25/2024" },
    { destination: "Mexico", departureDate: "11/20/2023", returnDate: "11/30/2023" },
    { destination: "United Kingdom", departureDate: "06/01/2023", returnDate: "06/15/2023" },
    { destination: "Norway", departureDate: "12/20/2022", returnDate: "01/05/2023" },
  ],
  moralCharacter: {
    // ALL flags triggered — worst-case scenario
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
    militaryService: true, // served in US military
    registeredSelectiveService: false, // NOT registered
  },
  oath: {
    // All "no" — tests oath refusal flips
    supportConstitution: false,
    willingTakeOath: false,
    willingBearArms: false,
    willingNoncombatService: false,
    willingNationalService: false,
  },
};

const result = mapFormDataToPdfFields(edgeCaseData);

// ── Verification ──
console.log("=== EDGE CASE TEST RESULTS ===\n");
console.log(`Total fields mapped: ${Object.keys(result).length}\n`);

// Check critical edge cases
const checks: [string, string | undefined, string][] = [
  // Eligibility: 3-year spouse → [1]
  ["Part1_Eligibility[1]", result["Part1_Eligibility[1]"], "3-year spouse eligibility"],
  ["Part1_Eligibility[0]", result["Part1_Eligibility[0]"], "should NOT have 5-year checked"],

  // Gender: Female → [1]
  ["P2_Line7_Gender[1]", result["P2_Line7_Gender[1]"], "Female gender"],
  ["P2_Line7_Gender[0]", result["P2_Line7_Gender[0]"], "should NOT have Male checked"],

  // Race: Asian → [1]
  ["P7_Line2_Race[1]", result["P7_Line2_Race[1]"], "Asian race"],
  // Ethnicity: NotHispanic → [0]
  ["P7_Line1_Ethnicity[0]", result["P7_Line1_Ethnicity[0]"], "Not Hispanic"],

  // Eye: GRN → [2]
  ["P7_Line5_Eye[2]", result["P7_Line5_Eye[2]"], "Green eyes"],
  // Hair: BLN → [5]
  ["P7_Line6_Hair[5]", result["P7_Line6_Hair[5]"], "Blonde hair"],

  // Weight 098 — leading zero
  ["P7_Line4_Pounds1[0]", result["P7_Line4_Pounds1[0]"], "Weight hundreds digit (0)"],
  ["P7_Line4_Pounds2[0]", result["P7_Line4_Pounds2[0]"], "Weight tens digit (9)"],
  ["P7_Line4_Pounds3[0]", result["P7_Line4_Pounds3[0]"], "Weight ones digit (8)"],

  // Suite unit type
  ["P4_Line1_Unit[1]", result["P4_Line1_Unit[1]"], "should NOT have STE on current (no unit)"],

  // Employer 3
  ["P7_EmployerName3[0]", result["P7_EmployerName3[0]"], "Third employer"],
  ["P7_ZipCode3[0]", result["P7_ZipCode3[0]"], "Third employer zip"],

  // 4 children
  ["P11_Line3A[0]", result["P11_Line3A[0]"], "Child 1 label"],
  ["P11_Line6A[0]", result["P11_Line6A[0]"], "Child 4 label"],
  ["P11_Line6D[0]", result["P11_Line6D[0]"], "Child 4 A-number"],

  // 6 travel trips
  ["P9_Line1_Countries1[0]", result["P9_Line1_Countries1[0]"], "Trip 1 country"],
  ["P8_Line1_Countries6[0]", result["P8_Line1_Countries6[0]"], "Trip 6 country"],

  // Previous address 3
  ["P4_Line3_PhysicalAddress3[0]", result["P4_Line3_PhysicalAddress3[0]"], "Address 3"],

  // Moral character flips: claimedUSCitizen=true → P9_Line7a should be [1] not [0]
  ["P9_Line7a[1]", result["P9_Line7a[1]"], "Claimed US citizen → Yes (flipped)"],
  ["P9_Line7a[0]", result["P9_Line7a[0]"], "should NOT have [0] (was flipped)"],

  // votedInElection=true → P9_Line8a[1]
  ["P9_Line8a[1]", result["P9_Line8a[1]"], "Voted in election → Yes (flipped)"],

  // convictedOfCrime=true → P9_Line9[1]
  ["P9_Line9[1]", result["P9_Line9[1]"], "Convicted → Yes (flipped)"],

  // usedIllegalDrugs=true → P12_Line16[1]
  ["P12_Line16[1]", result["P12_Line16[1]"], "Used drugs → Yes (flipped)"],

  // helpedIllegalEntry=true → P9_Line13[1]
  ["P9_Line13[1]", result["P9_Line13[1]"], "Helped illegal entry → Yes (flipped)"],

  // deported=true → P12_Line17d[1]
  ["P12_Line17d[1]", result["P12_Line17d[1]"], "Deported → Yes (flipped)"],

  // committedViolence=true → P9_Line11[1]
  ["P9_Line11[1]", result["P9_Line11[1]"], "Violence → Yes (flipped)"],

  // memberOfOrganizations=true → P12_6a[1]
  ["P12_6a[1]", result["P12_6a[1]"], "Member of orgs → Yes (flipped)"],

  // communistPartyMember=true → P12_6c[1]
  ["P12_6c[1]", result["P12_6c[1]"], "Communist → Yes (flipped)"],

  // terroristAssociation=true → P12_Line17g[1]
  ["P12_Line17g[1]", result["P12_Line17g[1]"], "Terrorist assoc → Yes (flipped)"],

  // registeredSelectiveService=false → P12_Line17f[1] (flipped from default [0]=Y)
  ["P12_Line17f[1]", result["P12_Line17f[1]"], "NOT registered selective service (flipped)"],
  ["P12_Line17f[0]", result["P12_Line17f[0]"], "should NOT have [0]"],

  // Military service=true → P7_Line2_Forces[1]
  ["P7_Line2_Forces[1]", result["P7_Line2_Forces[1]"], "Military service → Yes"],
  ["P7_Line2_Forces[0]", result["P7_Line2_Forces[0]"], "should NOT have [0]"],

  // Oath refusals: supportConstitution=false → P12_Line18[1]
  ["P12_Line18[1]", result["P12_Line18[1]"], "Won't support Constitution (flipped)"],
  ["P12_Line18[0]", result["P12_Line18[0]"], "should NOT have [0]"],

  // willingBearArms=false → P12_Line30a[1]
  ["P12_Line30a[1]", result["P12_Line30a[1]"], "Won't bear arms (flipped)"],

  // willingNoncombatService=false → P12_Line30b[1]
  ["P12_Line30b[1]", result["P12_Line30b[1]"], "Won't do noncombat (flipped)"],

  // willingNationalService=false → P12_Line31[0] (special: default was [1])
  ["P12_Line31[0]", result["P12_Line31[0]"], "Won't do national service (flipped)"],
  ["P12_Line31[1]", result["P12_Line31[1]"], "should NOT have [1]"],

  // Spouse citizenship by Other → P10_Line5a_When[1]
  ["P10_Line5a_When[1]", result["P10_Line5a_When[1]"], "Spouse citizenship by Other"],

  // Times married = 2
  ["Part9Line3_TimesMarried[0]", result["Part9Line3_TimesMarried[0]"], "Times married"],

  // Child 3 does NOT live with → P6_ChildThree[0] (No)
  ["P6_ChildThree[0]", result["P6_ChildThree[0]"], "Child 3 does NOT live with"],

  // MUST NOT have signatures
  ["P12_SignatureApplicant[0]", result["P12_SignatureApplicant[0]"], "MUST be blank (wet signature)"],
  ["P13_DateofSignature[0]", result["P13_DateofSignature[0]"], "MUST be blank (signature date)"],
  ["ApplicantsSignature[0]", result["ApplicantsSignature[0]"], "MUST be blank (interview signature)"],
];

let pass = 0;
let fail = 0;

for (const [field, value, desc] of checks) {
  const shouldExist = !desc.startsWith("should NOT") && !desc.startsWith("MUST be blank");

  if (shouldExist) {
    if (value === "yes" || (value && value !== "yes")) {
      console.log(`  PASS: ${field} = ${value} (${desc})`);
      pass++;
    } else {
      console.log(`  FAIL: ${field} = ${value ?? "MISSING"} (${desc})`);
      fail++;
    }
  } else {
    // Should NOT exist
    if (value === undefined) {
      console.log(`  PASS: ${field} is absent (${desc})`);
      pass++;
    } else {
      console.log(`  FAIL: ${field} = ${value} — should be absent! (${desc})`);
      fail++;
    }
  }
}

console.log(`\n───────────────────────────────────`);
console.log(`Checks: ${pass + fail} | Pass: ${pass} | Fail: ${fail}`);
console.log(`Score: ${Math.round((pass / (pass + fail)) * 100)}%`);

// Also write the full JSON for PDF generation
fs.mkdirSync("generated_pdfs", { recursive: true });
fs.writeFileSync(
  "generated_pdfs/edge_case_data.json",
  JSON.stringify(result, null, 2),
);
console.log(`\nWrote ${Object.keys(result).length} fields to generated_pdfs/edge_case_data.json`);
