/**
 * Maps structured N400FormData → flat JSON for the Python PDF populator.
 * Keys match the actual AcroForm field names in n400_acroform.pdf.
 *
 * Field reference: server/pdf/sample_data.json (gold standard)
 * Checkbox convention: set value to "yes" to check the box.
 *   - [0] / [1] index selects WHICH radio button in a Y/N pair.
 *   - on_state varies per field (some reversed). See sample_data.json.
 */
import type { N400FormData } from "../shared/schema.js";

export function mapFormDataToPdfFields(
  data: N400FormData,
): Record<string, string> {
  const f: Record<string, string> = {};
  const pi = data.personalInfo;
  const fam = data.family;
  const mc = data.moralCharacter;
  const oath = data.oath;

  const check = (field: string) => {
    f[field] = "yes";
  };

  // ═══════════════════════════════════════════════════════════
  // A-NUMBER — appears on every page (indices 0-13)
  // ═══════════════════════════════════════════════════════════
  if (pi.aNumber) {
    for (let i = 0; i <= 13; i++) {
      f[`Line1_AlienNumber[${i}]`] = pi.aNumber;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 1: ELIGIBILITY & HEADER
  // ═══════════════════════════════════════════════════════════

  // Current legal name (Part 2, Line 1 on page 1)
  if (pi.lastName) f["P2_Line1_FamilyName[0]"] = pi.lastName;
  if (pi.firstName) f["P2_Line1_GivenName[0]"] = pi.firstName;
  if (pi.middleName) f["P2_Line1_MiddleName[0]"] = pi.middleName;

  // Eligibility basis
  const eligibilityMap: Record<string, string> = {
    "5-year LPR": "Part1_Eligibility[0]",
    "General Provision": "Part1_Eligibility[0]",
    "3-year spouse": "Part1_Eligibility[1]",
    VAWA: "Part1_Eligibility[2]",
    "Qualified Employment Abroad": "Part1_Eligibility[3]",
    "Military During Hostilities": "Part1_Eligibility[4]",
    Other: "Part1_Eligibility[5]",
    "Military Service Any Time": "Part1_Eligibility[6]",
  };
  check(eligibilityMap[pi.eligibilityBasis ?? ""] ?? "Part1_Eligibility[0]");
  if (pi.eligibilityBasis === "Other" && pi.eligibilityOtherExplanation) {
    f["Part1Line5_OtherExplain[0]"] = pi.eligibilityOtherExplanation;
  }
  if (pi.eligibilityBasis === "Qualified Employment Abroad" && pi.eligibilityUscisOffice) {
    f["DropDownList1[0]"] = pi.eligibilityUscisOffice;
  }

  // Name as it appears on Permanent Resident Card (usually same as legal name)
  if (pi.lastName) f["Line2_FamilyName1[0]"] = pi.lastName;
  if (pi.firstName) f["Line3_GivenName1[0]"] = pi.firstName;
  if (pi.middleName) f["Line3_MiddleName1[0]"] = pi.middleName;
  const priorName = pi.otherNamesUsed?.[0];
  if (priorName?.lastName) f["Line2_FamilyName2[0]"] = priorName.lastName;
  if (priorName?.firstName) f["Line3_GivenName2[0]"] = priorName.firstName;
  if (priorName?.middleName) f["Line3_MiddleName2[0]"] = priorName.middleName;

  // ═══════════════════════════════════════════════════════════
  // PAGE 2: PERSONAL INFORMATION
  // ═══════════════════════════════════════════════════════════

  // Legal name repeated (Part 2, Lines 3-4)
  if (pi.lastName) f["Part2Line3_FamilyName[0]"] = pi.lastName;
  if (pi.firstName) f["Part2Line4a_GivenName[0]"] = pi.firstName;
  if (pi.middleName) f["Part2Line4a_MiddleName[0]"] = pi.middleName;

  // SSN
  if (pi.ssn) {
    f["Line12b_SSN[0]"] = pi.ssn;
    check("Line12a_Checkbox[0]"); // No — don't issue new SS card (already have one)
  } else {
    check("Line12a_Checkbox[1]"); // Yes — issue SS card
  }

  // Gender
  if (pi.gender === "Male") check("P2_Line7_Gender[0]"); // on_state=M
  else if (pi.gender === "Female") check("P2_Line7_Gender[1]"); // on_state=F

  // Date of birth
  if (pi.dateOfBirth) f["P2_Line8_DateOfBirth[0]"] = pi.dateOfBirth;

  // USCIS ELIS Account Number
  if (pi.uscisElisNumber)
    f["P2_Line6_USCISELISAcctNumber[0]"] = pi.uscisElisNumber;

  // Date became permanent resident
  if (pi.dateBecamePR)
    f["P2_Line9_DateBecamePermanentResident[0]"] = pi.dateBecamePR;

  // Country of birth & nationality
  if (pi.countryOfBirth) f["P2_Line10_CountryOfBirth[0]"] = pi.countryOfBirth;
  if (pi.nationality) f["P2_Line11_CountryOfNationality[0]"] = pi.nationality;

  // Disability accommodations — default No
  check("P2_Line10_claimdisability[0]"); // [0]=N → No
  check("P2_Line11_claimdisability[0]"); // [0]=N → No

  // Name change — default No
  check("P2_Line34_NameChange[0]"); // [0]=N → No

  // Accommodations received — default No
  check("c_Checkbox[0]"); // [0]=N → No

  // ═══════════════════════════════════════════════════════════
  // PAGE 3: CURRENT ADDRESS & BIOGRAPHIC INFO
  // ═══════════════════════════════════════════════════════════

  // Current address
  if (data.residenceHistory.length > 0) {
    const cur = data.residenceHistory[0];
    if (cur.address) {
      const { street, unit, unitType } = parseAddress(cur.address);
      f["P4_Line1_StreetName[0]"] = street;
      if (unit) {
        f["P4_Line1_Number[0]"] = unit;
        // Check APT/STE/FLR checkbox: [2]=APT, [1]=STE, [0]=FLR
        if (unitType === "STE") check("P4_Line1_Unit[1]");
        else if (unitType === "FLR") check("P4_Line1_Unit[0]");
        else check("P4_Line1_Unit[2]"); // default: APT
      }
    }
    if (cur.city) f["P4_Line1_City[0]"] = cur.city;
    if (cur.state) f["P4_Line1_State[0]"] = cur.state;
    if (cur.zip) f["P4_Line1_ZipCode[0]"] = cur.zip;
    if (cur.inCareOfName) f["P4_Line1_InCareOfName[0]"] = cur.inCareOfName;
    if (cur.province) f["P4_Line1_Province[0]"] = cur.province;
    if (cur.postalCode) f["P4_Line1_PostalCode[0]"] = cur.postalCode;
    if (cur.country) f["P4_Line1_Country[0]"] = cur.country;
    if (cur.moveInDate) f["P4_Line1_DatesofResidence[1]"] = cur.moveInDate;
  }

  const mailing = data.mailingAddress;
  const hasSeparateMailingAddress =
    mailing !== undefined &&
    Object.values(mailing).some((value) => value !== undefined && String(value).trim() !== "");

  delete f["Pt3_Line2a_Checkbox[0]"];
  delete f["Pt3_Line2a_Checkbox[1]"];
  check(hasSeparateMailingAddress ? "Pt3_Line2a_Checkbox[0]" : "Pt3_Line2a_Checkbox[1]");

  const mailingSource = hasSeparateMailingAddress ? mailing! : data.residenceHistory[0];
  if (mailingSource) {
    if (mailingSource.address) {
      const { street, unit, unitType } = parseAddress(mailingSource.address);
      f["P5_Line1b_StreetName[0]"] = street;
      if (unit) {
        f["P5_Line1b_Number[0]"] = unit;
        if (unitType === "STE") check("P5_Line1b_Unit[1]");
        else if (unitType === "FLR") check("P5_Line1b_Unit[0]");
        else check("P5_Line1b_Unit[2]");
      }
    }
    if (mailingSource.inCareOfName) f["P5_Line1b_InCareOfName[0]"] = mailingSource.inCareOfName;
    if (mailingSource.city) f["P5_Line1b_City[0]"] = mailingSource.city;
    if (mailingSource.state) f["P4_Line1_State[1]"] = mailingSource.state;
    if (mailingSource.zip) f["P5_Line1b_ZipCode[0]"] = mailingSource.zip;
    if (mailingSource.province) f["P5_Line1b_Province[0]"] = mailingSource.province;
    if (mailingSource.postalCode) f["P5_Line1b_PostalCode[0]"] = mailingSource.postalCode;
    if (mailingSource.country) f["P5_Line1b_Country[0]"] = mailingSource.country;
  }

  // Previous address 1
  if (data.residenceHistory.length > 1) {
    const prev = data.residenceHistory[1];
    if (prev.address) f["P4_Line3_PhysicalAddress1[0]"] = prev.address;
    if (prev.city) f["P4_Line3_CityTown1[0]"] = prev.city;
    if (prev.state) f["P4_Line3_State1[0]"] = prev.state;
    if (prev.zip) f["P4_Line3_ZipCode1[0]"] = prev.zip;
    if (prev.country) f["P4_Line3_Country1[0]"] = prev.country;
    if (prev.moveInDate) f["P4_Line3_From1[0]"] = prev.moveInDate;
    if (prev.moveOutDate) f["P4_Line3_From1[1]"] = prev.moveOutDate;
  }

  // Previous address 2
  if (data.residenceHistory.length > 2) {
    const prev = data.residenceHistory[2];
    if (prev.address) f["P4_Line3_PhysicalAddress2[0]"] = prev.address;
    if (prev.city) f["P4_Line3_CityTown2[0]"] = prev.city;
    if (prev.state) f["P4_Line3_State2[0]"] = prev.state;
    if (prev.zip) f["P4_Line3_ZipCode2[0]"] = prev.zip;
    if (prev.country) f["P4_Line3_Country2[0]"] = prev.country;
    if (prev.moveInDate) f["P4_Line3_From2[0]"] = prev.moveInDate;
    if (prev.moveOutDate) f["P4_Line3_To2[0]"] = prev.moveOutDate;
  }

  // Previous address 3
  if (data.residenceHistory.length > 3) {
    const prev = data.residenceHistory[3];
    if (prev.address) f["P4_Line3_PhysicalAddress3[0]"] = prev.address;
    if (prev.city) f["P4_Line3_CityTown3[0]"] = prev.city;
    if (prev.state) f["P4_Line3_State3[0]"] = prev.state;
    if (prev.zip) f["P4_Line3_ZipCode3[0]"] = prev.zip;
    if (prev.country) f["P4_Line3_Country3[0]"] = prev.country;
    if (prev.moveInDate) f["P4_Line3_From3[0]"] = prev.moveInDate;
    if (prev.moveOutDate) f["P4_Line3_To3[0]"] = prev.moveOutDate;
  }

  // Biographic info (Page 3)
  const bio = data.biographic;
  if (bio) {
    // Ethnicity: [0]=N (Not Hispanic), [1]=Y (Hispanic)
    if (bio.ethnicity === "Hispanic") check("P7_Line1_Ethnicity[1]");
    else if (bio.ethnicity === "NotHispanic") check("P7_Line1_Ethnicity[0]");

    // Race: [0]=I (AmericanIndian), [1]=A (Asian), [2]=B (Black), [3]=A (PacificIslander), [4]=W (White)
    const raceMap: Record<string, string> = {
      AmericanIndian: "P7_Line2_Race[0]",
      Asian: "P7_Line2_Race[1]",
      Black: "P7_Line2_Race[2]",
      PacificIslander: "P7_Line2_Race[3]",
      White: "P7_Line2_Race[4]",
    };
    if (bio.race && raceMap[bio.race]) check(raceMap[bio.race]);

    // Height (ComboBox fields — set as string values)
    if (bio.heightFeet !== undefined)
      f["P7_Line3_HeightFeet[0]"] = String(bio.heightFeet);
    if (bio.heightInches !== undefined)
      f["P7_Line3_HeightInches[0]"] = String(bio.heightInches);

    // Weight — 3 individual digit fields (hundreds, tens, ones)
    if (bio.weightLbs !== undefined) {
      const w = String(bio.weightLbs).padStart(3, "0");
      f["P7_Line4_Pounds1[0]"] = w[0];
      f["P7_Line4_Pounds2[0]"] = w[1];
      f["P7_Line4_Pounds3[0]"] = w[2];
    }

    // Eye color: BRO=0, BLU=1, GRN=2, HAZ=3, GRY=4, BLK=5, PNK=6, MAR=7, XXX=8
    const eyeMap: Record<string, number> = {
      BRO: 0, BLU: 1, GRN: 2, HAZ: 3, GRY: 4, BLK: 5, PNK: 6, MAR: 7, XXX: 8,
    };
    if (bio.eyeColor && eyeMap[bio.eyeColor] !== undefined)
      check(`P7_Line5_Eye[${eyeMap[bio.eyeColor]}]`);

    // Hair color: BAL=0, SDY=1, RED=2, WHI=3, GRY=4, BLN=5, BRO=6, BLK=7, XXX=8
    const hairMap: Record<string, number> = {
      BAL: 0, SDY: 1, RED: 2, WHI: 3, GRY: 4, BLN: 5, BRO: 6, BLK: 7, XXX: 8,
    };
    if (bio.hairColor && hairMap[bio.hairColor] !== undefined)
      check(`P7_Line6_Hair[${hairMap[bio.hairColor]}]`);
  }

  // Accommodations checkbox — default No
  // NOTE: sample_data checks [1] which has on_state=Y. This appears to be
  // "Yes, I can take the oath" not an accommodation request.

  // ═══════════════════════════════════════════════════════════
  // PAGE 4: MARITAL STATUS & SPOUSE
  // ═══════════════════════════════════════════════════════════

  const maritalMap: Record<string, string> = {
    Divorced: "P10_Line1_MaritalStatus[0]", // on_state=D
    Single: "P10_Line1_MaritalStatus[1]", // on_state=S
    Widowed: "P10_Line1_MaritalStatus[2]", // on_state=W
    Married: "P10_Line1_MaritalStatus[3]", // on_state=M
    Annulled: "P10_Line1_MaritalStatus[4]", // on_state=A
    Separated: "P10_Line1_MaritalStatus[5]", // on_state=E
  };
  if (fam.maritalStatus && maritalMap[fam.maritalStatus]) {
    check(maritalMap[fam.maritalStatus]);
  }

  if (fam.spouse) {
    const sp = fam.spouse;
    if (sp.fullName) {
      const parts = sp.fullName.split(/\s+/);
      f["P10_Line4a_FamilyName[0]"] = parts[parts.length - 1];
      f["P10_Line4a_GivenName[0]"] = parts[0];
      if (parts.length > 2)
        f["P10_Line4a_MiddleName[0]"] = parts.slice(1, -1).join(" ");
    }
    if (sp.dateOfBirth) f["P10_Line4d_DateofBirth[0]"] = sp.dateOfBirth;
    if (sp.dateOfMarriage)
      f["P10_Line4e_DateEnterMarriage[0]"] = sp.dateOfMarriage;
    if (sp.isCitizen !== undefined) {
      check(
        sp.isCitizen ? "P10_Line5_Citizen[1]" : "P10_Line5_Citizen[0]",
      );
    }
    if (sp.citizenshipBy === "Birth")
      check("P10_Line5a_When[0]"); // on_state=B (Birth)
    else if (sp.citizenshipBy) check("P10_Line5a_When[1]"); // on_state=O (Other)
    if (sp.dateBecameCitizen) f["P10_Line5b_DateBecame[0]"] = sp.dateBecameCitizen;
    if (sp.aNumber) f["P7_Line6_ANumber[0]"] = sp.aNumber;
    if (sp.currentEmployer) f["P10_Line4g_Employer[0]"] = sp.currentEmployer;
  }

  if (fam.timesMarried)
    f["Part9Line3_TimesMarried[0]"] = String(fam.timesMarried);
  if (fam.spouseTimesMarried !== undefined)
    f["TextField1[0]"] = String(fam.spouseTimesMarried);

  // Military service in US Armed Forces
  if (mc.militaryService) {
    check("P7_Line2_Forces[1]"); // [1]=Y → Yes
  } else {
    check("P7_Line2_Forces[0]"); // [0]=N → No (default)
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 5: EMPLOYMENT & CHILDREN COUNT
  // ═══════════════════════════════════════════════════════════

  if (fam.totalChildren !== undefined) {
    f["P11_Line1_TotalChildren[0]"] = String(fam.totalChildren);
  }

  if (fam.children) {
    const pageFiveSupportFields = [
      { base: "P9_Line5a", yesIndex: 0, noIndex: 1 },
      { base: "P6_ChildTwo", yesIndex: 1, noIndex: 0 },
      { base: "P6_ChildThree", yesIndex: 1, noIndex: 0 },
    ];

    for (let i = 0; i < Math.min(fam.children.length, 3); i++) {
      const child = fam.children[i];
      const idx = i + 1;

      if (child.fullName) f[`P7_EmployerName${idx}[0]`] = child.fullName;

      const residence =
        child.residence ??
        (child.livesWithYou === true
          ? "resides with me"
          : child.livesWithYou === false
            ? "does not reside with me"
            : undefined);
      if (residence) f[`P7_From${idx}[0]`] = residence;

      if (child.dateOfBirth) f[`P7_OccupationFieldStudy${idx}[0]`] = child.dateOfBirth;
      if (child.relationship) f[`P7_OccupationFieldStudy${idx}[1]`] = child.relationship;

      const supportConfig = pageFiveSupportFields[i];
      if (supportConfig && child.receivingSupport !== undefined) {
        check(
          child.receivingSupport
            ? `${supportConfig.base}[${supportConfig.yesIndex}]`
            : `${supportConfig.base}[${supportConfig.noIndex}]`,
        );
      }
    }
  }

  // Employment / schools row 1
  if (data.employment.length > 0) {
    const emp = data.employment[0];
    if (emp.employerName) f["P5_EmployerName1[0]"] = emp.employerName;
    if (emp.occupation) f["P7_OccupationFieldStudy1[2]"] = emp.occupation;
    if (emp.city) f["P7_City1[0]"] = emp.city;
    if (emp.state) f["P7_State1[0]"] = emp.state;
    if (emp.zip) f["P7_ZipCode1[0]"] = emp.zip;
    if (emp.country) f["P7_Country1[0]"] = emp.country;
    if (emp.startDate) f["P7_From1[1]"] = emp.startDate;
  }

  // Employment / schools row 2
  if (data.employment.length > 1) {
    const emp = data.employment[1];
    if (emp.employerName) f["P5_EmployerName2[0]"] = emp.employerName;
    if (emp.occupation) f["P7_OccupationFieldStudy2[2]"] = emp.occupation;
    if (emp.city) f["P7_City2[0]"] = emp.city;
    if (emp.state) f["P7_State2[0]"] = emp.state;
    if (emp.zip) f["P7_ZipCode2[0]"] = emp.zip;
    if (emp.country) f["P7_Country2[0]"] = emp.country;
    if (emp.startDate) f["P7_From2[1]"] = emp.startDate;
    if (emp.endDate) f["P7_To2[0]"] = emp.endDate;
  }

  // Employment / schools row 3
  if (data.employment.length > 2) {
    const emp = data.employment[2];
    if (emp.employerName) f["P5_EmployerName3[0]"] = emp.employerName;
    if (emp.occupation) f["P7_OccupationFieldStudy3[2]"] = emp.occupation;
    if (emp.city) f["P7_City3[0]"] = emp.city;
    if (emp.state) f["P7_State3[0]"] = emp.state;
    if (emp.zip) f["P7_ZipCode3[0]"] = emp.zip;
    if (emp.country) f["P7_Country3[0]"] = emp.country;
    if (emp.startDate) f["P7_From3[1]"] = emp.startDate;
    if (emp.endDate) f["P7_To3[0]"] = emp.endDate;
  }

  // "Does child live with you?" checkboxes (Page 5)
  // P6_ChildTwo: [0]=N, [1]=Y  |  P6_ChildThree: [0]=N, [1]=Y
  if (fam.children && fam.children.length > 1) {
    const c2 = fam.children[1];
    check(c2.livesWithYou !== false ? "P6_ChildTwo[1]" : "P6_ChildTwo[0]");
  }
  if (fam.children && fam.children.length > 2) {
    const c3 = fam.children[2];
    check(c3.livesWithYou !== false ? "P6_ChildThree[1]" : "P6_ChildThree[0]");
  } else if (fam.children && fam.children.length <= 2 && fam.totalChildren !== undefined) {
    // No third child → check "No" for child three
    check("P6_ChildThree[0]");
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 6: TRAVEL HISTORY
  // ═══════════════════════════════════════════════════════════

  // Up to 6 trips
  for (let i = 0; i < Math.min(data.travelHistory.length, 6); i++) {
    const t = data.travelHistory[i];
    const idx = i + 1;

    // First country field has different naming
    if (i === 0) {
      if (t.destination) f["P9_Line1_Countries1[0]"] = t.destination;
    } else {
      if (t.destination) f[`P8_Line1_Countries${idx}[0]`] = t.destination;
    }
    if (t.departureDate) f[`P8_Line1_DateLeft${idx}[0]`] = t.departureDate;
    if (t.returnDate) f[`P8_Line1_DateReturn${idx}[0]`] = t.returnDate;
  }

  // Travel section Y/N checkboxes (clean-application defaults from sample_data.json)
  check("P9_Line5a[1]"); // [1]=N → No
  check("P9_5a[1]"); // [1]=N → No
  check("P9_5b[1]"); // [1]=N → No
  check("P9_Line1[0]"); // [0]=N → No
  check("P9_Line2[0]"); // [0]=N → No
  check("P9_Line3[0]"); // [0]=Y → Yes (reversed field, "Yes" is clean)
  check("P9_Line4[1]"); // [1]=N → No

  // ═══════════════════════════════════════════════════════════
  // PAGES 7-10: MORAL CHARACTER & OATH
  // All checkboxes default to clean-application values.
  // Pattern: check [0] for most fields (matches sample_data.json).
  // ═══════════════════════════════════════════════════════════

  // Fields where checking [0] is the correct clean-application answer.
  // Some are "No" (on_state=N), some are "Yes" (on_state=Y) — the index
  // is what matters, not the label. Verified against sample_data.json.
  const cleanDefaultsCheckZero = [
    // Page 7: Part 12 moral character
    "P12_6a",
    "P12_6b",
    "P12_6c",
    "P9_Line7a",
    "P9_Line8a",
    "P9_Line8b",
    "P9_Line9",
    "P9_Line10a",
    "P9_Line10b",
    "P9_Line11",
    "P9_Line12",
    "P9_Line13",
    "P9_Line14",
    // Page 8
    "P9_Line15a",
    "P9_Line15b",
    "P12_Line16",
    // Page 9
    "P11_Line17A",
    "P11_Line17B",
    "P11_Line17C",
    "P12_Line17d",
    "P12_Line17e",
    "P12_Line17f", // selective service — [0]=Y → Yes (registered)
    "P12_Line17g",
    "P12_Line17h",
    "P12_Line18", // support Constitution — [0]=Y → Yes
    "P12_Line19", // understand oath — [0]=Y → Yes
    "P12_Line20",
    "P12_Line21",
    "P9_Line22a",
    "Pt9_Line22b",
    "P12_Line23",
    "P12_Line24",
    "P12_Line25",
    // Page 10
    "P12_Line26a",
    "P12_Line26b",
    "P12_Line26c",
    "P11_Line26d",
    "P12_Line27", // willing take oath — [0]=Y → Yes
    "P12_Line28", // obey laws — [0]=Y → Yes
    "P9_Line29",
    "P12_Line30a", // bear arms — [0]=Y → Yes
    "P12_Line30b", // noncombat service — [0]=Y → Yes
    "P12_Line32", // oath affirmation — [0]=Y → Yes
    "P12_Line33", // oath affirmation — [0]=Y → Yes
    "P12_Line34", // no nobility titles — [0]=N → No
    "P12_Line35", // oath affirmation — [0]=Y → Yes
    "P12_Line36", // no desertion — [0]=N → No
    "P12_Line37", // oath affirmation — [0]=Y → Yes
  ];

  for (const field of cleanDefaultsCheckZero) {
    check(`${field}[0]`);
  }

  // Fields where checking [1] is the correct clean-application answer
  check("P9_Line10c[1]"); // [1]=N → No (reversed: [0]=Y, [1]=N)
  check("P12_Line31[1]"); // [1]=Y → Yes (national service willingness)

  // Unnamed Page 7 moral character checkboxes (all default No via [0]=N)
  check("[0]"); // unnamed checkbox
  check("c[0]"); // unnamed checkbox
  check("P11_7d[0]"); // Part 11, Q7d
  check("e[0]"); // unnamed checkbox
  check("f[0]"); // unnamed checkbox
  check("g[0]"); // unnamed checkbox

  // ── Moral character overrides ──
  // Flip from default when user reports a "yes" to a negative question.
  const flip = (base: string) => {
    delete f[`${base}[0]`];
    check(`${base}[1]`);
  };

  if (mc.claimedUSCitizen) flip("P9_Line7a");
  if (mc.votedInElection) flip("P9_Line8a");
  if (mc.arrestedOrDetained) flip("P9_Line15a");
  if (mc.convictedOfCrime) flip("P9_Line9");
  if (mc.usedIllegalDrugs) flip("P12_Line16");
  if (mc.helpedIllegalEntry) flip("P9_Line13");
  if (mc.liedToGovernment) flip("P9_Line14");
  if (mc.deported) flip("P12_Line17d");
  if (mc.committedViolence) flip("P9_Line11");
  if (mc.memberOfOrganizations) flip("P12_6a");
  if (mc.communistPartyMember) flip("P12_6c");
  if (mc.terroristAssociation) flip("P12_Line17g");

  // Selective service: default is [0]=Y (registered). Flip if NOT registered.
  if (mc.registeredSelectiveService === false) flip("P12_Line17f");

  // Oath overrides — only flip if user explicitly says "no"
  if (oath.supportConstitution === false) flip("P12_Line18");
  if (oath.willingTakeOath === false) flip("P12_Line27");
  if (oath.willingBearArms === false) flip("P12_Line30a");
  if (oath.willingNoncombatService === false) flip("P12_Line30b");
  if (oath.willingNationalService === false) {
    delete f["P12_Line31[1]"];
    check("P12_Line31[0]"); // special: default was [1], flip to [0]
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 11: CONTACT & FEE REDUCTION
  // ═══════════════════════════════════════════════════════════
  // NOTE: P12_SignatureApplicant[0] and P13_DateofSignature[0]
  // are intentionally left BLANK. The applicant must sign and
  // date by hand under penalty of perjury (8 U.S.C. § 1015(a)).
  // Pre-filling a signature is legally non-compliant.

  // Contact info
  if (pi.phone) f["P12_Line3_Telephone[0]"] = pi.phone;
  if (pi.mobilePhone) f["P12_Line3_Mobile[0]"] = pi.mobilePhone;
  if (pi.email) f["P12_Line5_Email[0]"] = pi.email;

  delete f["P10_Line2_TotalHouseholdIn[0]"];
  delete f["P11_Line1_TotalChildren[1]"];
  delete f["P10_Line1_Citizen[0]"];
  delete f["P10_Line1_Citizen[1]"];
  delete f["P10_Line5a[0]"];
  delete f["P10_Line5a[1]"];
  delete f["P10_Line5b_NameOfHousehold[0]"];

  if (fam.feeReductionRequested !== undefined) {
    check(fam.feeReductionRequested ? "P10_Line1_Citizen[1]" : "P10_Line1_Citizen[0]");
  } else {
    check("P10_Line1_Citizen[0]");
  }

  if (fam.totalHouseholdIncome !== undefined) {
    f["P10_Line2_TotalHouseholdIn[0]"] = String(fam.totalHouseholdIncome);
  }

  if (fam.householdIncomeEarners !== undefined) {
    f["P11_Line1_TotalChildren[1]"] = String(fam.householdIncomeEarners);
  }

  if (fam.headOfHousehold !== undefined) {
    check(fam.headOfHousehold ? "P10_Line5a[1]" : "P10_Line5a[0]");
  } else {
    check("P10_Line5a[0]");
  }

  if (fam.headOfHousehold === false && fam.headOfHouseholdName) {
    f["P10_Line5b_NameOfHousehold[0]"] = fam.headOfHouseholdName;
  }

  // Total children (repeated on page 11)
  if (fam.totalChildren !== undefined) {
    f["P11_Line1_TotalChildren[1]"] = String(fam.totalChildren);
  }

  // Household size
  if (fam.householdSize !== undefined) {
    f["P10_Line2_TotalHouseholdIn[0]"] = String(fam.householdSize);
    f["P10_Line3_HouseHoldSize[0]"] = String(fam.householdSize);
  }

  // Fee reduction — default No
  check("P10_Line1_Citizen[0]"); // [0]=N → No
  check("P10_Line5a[0]"); // [0]=N → No

  // ═══════════════════════════════════════════════════════════
  // PAGE 13: ADDITIONAL INFO — NAME & CHILDREN
  // ═══════════════════════════════════════════════════════════

  // Final cleanup pass so legacy assignments above cannot leave
  // contradictory values in the emitted field map.
  delete f["P10_Line1_Citizen[0]"];
  delete f["P10_Line1_Citizen[1]"];
  delete f["P10_Line5a[0]"];
  delete f["P10_Line5a[1]"];
  delete f["P10_Line2_TotalHouseholdIn[0]"];
  delete f["P10_Line3_HouseHoldSize[0]"];
  delete f["P11_Line1_TotalChildren[1]"];
  delete f["P10_Line5b_NameOfHousehold[0]"];
  delete f["P9_Line5a[0]"];
  delete f["P9_Line5a[1]"];

  if (fam.feeReductionRequested !== undefined) {
    check(fam.feeReductionRequested ? "P10_Line1_Citizen[1]" : "P10_Line1_Citizen[0]");
  } else {
    check("P10_Line1_Citizen[0]");
  }

  if (fam.feeReductionRequested === true) {
    if (fam.totalHouseholdIncome !== undefined) {
      f["P10_Line2_TotalHouseholdIn[0]"] = String(fam.totalHouseholdIncome);
    }

    if (fam.householdSize !== undefined) {
      f["P10_Line3_HouseHoldSize[0]"] = String(fam.householdSize);
    }

    if (fam.householdIncomeEarners !== undefined) {
      f["P11_Line1_TotalChildren[1]"] = String(fam.householdIncomeEarners);
    }

    if (fam.headOfHousehold !== undefined) {
      check(fam.headOfHousehold ? "P10_Line5a[1]" : "P10_Line5a[0]");
    } else {
      check("P10_Line5a[0]");
    }

    if (fam.headOfHousehold === false && fam.headOfHouseholdName) {
      f["P10_Line5b_NameOfHousehold[0]"] = fam.headOfHouseholdName;
    }
  }

  if (fam.children?.[0]?.receivingSupport !== undefined) {
    check(fam.children[0].receivingSupport ? "P9_Line5a[0]" : "P9_Line5a[1]");
  }

  // Applicant name repeated on page 13
  if (pi.lastName) f["P2_Line1_FamilyName[1]"] = pi.lastName;
  if (pi.firstName) f["P2_Line1_GivenName[1]"] = pi.firstName;
  if (pi.middleName) f["P2_Line1_MiddleName[1]"] = pi.middleName;

  // Part 14 additional information entries
  const additionalFieldSets = [
    ["P11_Line3A", "P11_Line3B", "P11_Line3C", "P11_Line3D"],
    ["P11_Line4A", "P11_Line4B", "P11_Line4C", "P11_Line4D"],
    ["P11_Line5A", "P11_Line5B", "P11_Line5C", "P11_Line5D"],
    ["P11_Line6A", "P11_Line6B", "P11_Line6C", "P11_Line6D"],
  ];
  const additionalEntries = [
    ...(data.additionalInfo ?? []),
    ...buildOverflowAdditionalInfo(data),
  ].slice(0, 4);

  for (let i = 0; i < additionalEntries.length; i++) {
    const entry = additionalEntries[i];
    const [pageField, partField, itemField, responseField] = additionalFieldSets[i];
    if (entry.pageNumber) f[`${pageField}[0]`] = entry.pageNumber;
    if (entry.partNumber) f[`${partField}[0]`] = entry.partNumber;
    if (entry.itemNumber) f[`${itemField}[0]`] = entry.itemNumber;
    if (entry.response) f[`${responseField}[0]`] = entry.response;
  }

  // ═══════════════════════════════════════════════════════════
  // PAGE 14: FOR USCIS USE ONLY — DO NOT FILL
  // ═══════════════════════════════════════════════════════════
  // ApplicantsSignature[0], Part15ApplicantsSignature[0],
  // Part15USCISName[0], Part15USCISSignature[0], etc.
  // are all USCIS-only or interview-time fields. Left blank.

  return f;
}

/** Title-case name with middle initial for signatures: "CARLOS EDUARDO MARTINEZ" → "Carlos E. Martinez" */
function formatName(fullName: string): string {
  const parts = fullName.split(/\s+/);
  return parts
    .map((p, i) => {
      const titleCase = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      // Use initial for middle name(s) — not first or last
      if (parts.length > 2 && i > 0 && i < parts.length - 1) {
        return p.charAt(0).toUpperCase() + ".";
      }
      return titleCase;
    })
    .join(" ");
}

/** Split "123 Main Street, Apt 4B" → { street: "123 Main Street", unit: "Apt 4B", unitType: "APT" } */
function parseAddress(address: string): {
  street: string;
  unit?: string;
  unitType?: "APT" | "STE" | "FLR";
} {
  // Match common unit patterns: Apt, Suite/Ste, Floor/Flr, Unit, #
  const unitPattern =
    /[,\s]+(?:(apt|apartment|suite|ste|floor|flr|unit|#)\s*\.?\s*(.+))$/i;
  const match = address.match(unitPattern);

  if (!match) return { street: address };

  const street = address.slice(0, match.index!).trim();
  const unitLabel = match[1].toLowerCase();
  const unitNum = match[2].trim();
  const fullUnit = `${match[1]} ${unitNum}`.trim();

  let unitType: "APT" | "STE" | "FLR" = "APT";
  if (unitLabel.startsWith("s") || unitLabel === "ste")
    unitType = "STE";
  else if (unitLabel.startsWith("f") || unitLabel === "flr")
    unitType = "FLR";

  return { street, unit: fullUnit, unitType };
}

function buildOverflowAdditionalInfo(data: N400FormData) {
  const entries: Array<{
    pageNumber: string;
    partNumber: string;
    itemNumber: string;
    response: string;
  }> = [];

  const overflowChildren = (data.family.children ?? []).slice(3);
  for (let i = 0; i < overflowChildren.length; i++) {
    const child = overflowChildren[i];
    const pieces = [
      `Child ${i + 4}: ${child.fullName ?? "Unknown name"}`,
      child.aNumber ? `A-Number ${child.aNumber}` : undefined,
      child.dateOfBirth ? `DOB ${child.dateOfBirth}` : undefined,
      child.relationship ? `Relationship ${child.relationship}` : undefined,
      child.livesWithYou === undefined ? undefined : `Lives with you ${child.livesWithYou ? "Yes" : "No"}`,
      child.receivingSupport === undefined ? undefined : `Providing support ${child.receivingSupport ? "Yes" : "No"}`,
    ].filter(Boolean);

    entries.push({
      pageNumber: "5",
      partNumber: "6",
      itemNumber: "2",
      response: pieces.join("; "),
    });
  }

  return entries;
}
