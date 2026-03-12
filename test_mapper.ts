import { mapFormDataToPdfFields } from "./server/pdfMapper";
import fs from "fs";

const formData: any = {
  personalInfo: {
    fullName: "CARLOS EDUARDO MARTINEZ", firstName: "CARLOS", lastName: "MARTINEZ", middleName: "EDUARDO",
    dateOfBirth: "04/15/1985", aNumber: "A987654321", uscisElisNumber: "1234567890", dateBecamePR: "06/01/2019",
    countryOfBirth: "Mexico", nationality: "Mexico", gender: "Male", ssn: "123-45-6789",
    email: "carlos.martinez@email.com", phone: "217-555-0100", mobilePhone: "217-555-0199", eligibilityBasis: "5-year LPR",
  },
  biographic: { ethnicity: "Hispanic", race: "White", heightFeet: 5, heightInches: 10, weightLbs: 175, eyeColor: "BRO", hairColor: "BLK" },
  residenceHistory: [
    { address: "123 Main Street, Apt 4B", city: "Springfield", state: "IL", zip: "62701", country: "United States", moveInDate: "08/2022" },
    { address: "456 Oak Avenue", city: "Chicago", state: "IL", zip: "60601", country: "United States", moveInDate: "01/2017", moveOutDate: "08/2022" },
    { address: "789 Elm Street", city: "Guadalajara", state: "Jalisco", zip: "44100", country: "Mexico", moveInDate: "01/2015", moveOutDate: "12/2016" },
  ],
  family: {
    maritalStatus: "Married", timesMarried: 1, householdSize: 4,
    spouse: { fullName: "MARIA ISABEL MARTINEZ", dateOfBirth: "09/22/1987", dateOfMarriage: "06/15/2013", isCitizen: true, citizenshipBy: "Birth" },
    children: [{ fullName: "SOFIA MARTINEZ", aNumber: "A111222333" }, { fullName: "DIEGO MARTINEZ", aNumber: "A444555666" }],
    totalChildren: 2,
  },
  employment: [
    { employerName: "ABC Technology Corp", occupation: "Software Engineer", city: "Springfield", state: "IL", zip: "62701", country: "United States", startDate: "03/2020", endDate: "Present" },
    { employerName: "XYZ Solutions LLC", occupation: "Software Developer", city: "Chicago", state: "IL", zip: "60601", country: "United States", startDate: "01/2017", endDate: "02/2020" },
  ],
  travelHistory: [
    { destination: "Mexico", departureDate: "12/20/2023", returnDate: "01/05/2024" },
    { destination: "Mexico", departureDate: "07/10/2022", returnDate: "07/25/2022" },
    { destination: "Canada", departureDate: "09/01/2021", returnDate: "09/05/2021" },
  ],
  moralCharacter: { claimedUSCitizen: false, votedInElection: false, alwaysFiledTaxes: true, owedUnpaidTaxes: false, arrestedOrDetained: false, convictedOfCrime: false, usedIllegalDrugs: false, habitualDrunkard: false, helpedIllegalEntry: false, liedToGovernment: false, deported: false, memberOfOrganizations: false, communistPartyMember: false, terroristAssociation: false, committedViolence: false, militaryService: false, registeredSelectiveService: true },
  oath: { supportConstitution: true, willingTakeOath: true, willingBearArms: true, willingNoncombatService: true, willingNationalService: true },
};

const result = mapFormDataToPdfFields(formData);
const sample = JSON.parse(fs.readFileSync("server/pdf/sample_data.json", "utf-8"));
const sc: Record<string, string> = {};
for (const [k, v] of Object.entries(sample)) { if (!k.startsWith("_")) sc[k] = v as string; }

let m = 0, w = 0, e = 0;
for (const [k, v] of Object.entries(sc)) {
  if (!(k in result)) { console.log("MISSING: " + k + " = " + v); m++; }
  else if (result[k] !== v) { console.log("WRONG: " + k + "  exp=" + JSON.stringify(v) + "  got=" + JSON.stringify(result[k])); w++; }
}
for (const k of Object.keys(result)) { if (!(k in sc)) { console.log("EXTRA: " + k + " = " + result[k]); e++; } }

console.log("───────────────────────────────────");
console.log(`Sample: ${Object.keys(sc).length} | Mapped: ${Object.keys(result).length}`);
console.log(`Missing: ${m} | Wrong: ${w} | Extra: ${e}`);
console.log(`Match: ${Math.round((1 - (m + w) / Object.keys(sc).length) * 100)}%`);
