/**
 * Rule-based local conversation engine for N-400 form filling.
 * No external AI dependency — works fully offline/locally.
 */
import {
  type Section,
  type N400FormData,
  type RedFlag,
  type ChatMessage,
  SECTIONS,
} from "@shared/schema";

interface ConversationResult {
  botMessage: string;
  extractedFields: Record<string, unknown>;
  shouldMoveToNextSection: boolean;
  nextSection?: Section;
  redFlags: RedFlag[];
  updatedFormData: N400FormData;
}

// ── Section question sets ──
interface SectionQuestion {
  field: string;
  question: string;
  extract: (input: string, formData: N400FormData) => Record<string, unknown> | null;
  validate?: (value: unknown) => string | null;
}

function getIntroQuestions(): SectionQuestion[] {
  return [
    {
      field: "eligibilityCheck",
      question:
        "Welcome to CitizenFlow! I'm here to help you complete your N-400 Application for Naturalization.\n\nBefore we start, do you have your Green Card and have you been a permanent resident for at least 5 years (or 3 years if married to a US citizen)?",
      extract: (input) => {
        const lower = input.toLowerCase();
        if (lower.includes("yes") || lower.includes("have") || lower.includes("5") || lower.includes("3") || lower.includes("year")) {
          return { eligible: true };
        }
        return { eligible: false };
      },
    },
  ];
}

function parseDate(input: string): string | null {
  const dateMatch = input.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dateMatch) {
    return `${dateMatch[1].padStart(2, "0")}/${dateMatch[2].padStart(2, "0")}/${dateMatch[3]}`;
  }
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };
  const textMatch = input.toLowerCase().match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (textMatch && months[textMatch[1]]) {
    return `${months[textMatch[1]]}/${textMatch[2].padStart(2, "0")}/${textMatch[3]}`;
  }
  return null;
}

function getPersonalInfoQuestions(): SectionQuestion[] {
  return [
    {
      field: "personalInfo.fullName",
      question: "Let's start with your personal information. What is your full legal name as it appears on your Green Card? (Please give me your first name, middle name, and last name.)",
      extract: (input) => {
        const parts = input.trim().split(/\s+/);
        if (parts.length >= 2) {
          const firstName = parts[0].toUpperCase();
          const lastName = parts[parts.length - 1].toUpperCase();
          const middleName = parts.length > 2 ? parts.slice(1, -1).join(" ").toUpperCase() : undefined;
          return {
            "personalInfo.fullName": input.toUpperCase(),
            "personalInfo.firstName": firstName,
            "personalInfo.lastName": lastName,
            ...(middleName ? { "personalInfo.middleName": middleName } : {}),
          };
        }
        return null;
      },
    },
    {
      field: "personalInfo.dateOfBirth",
      question: "Got it! What is your date of birth? (Please use MM/DD/YYYY format)",
      extract: (input) => {
        const d = parseDate(input);
        return d ? { "personalInfo.dateOfBirth": d } : null;
      },
    },
    {
      field: "personalInfo.aNumber",
      question: "What is your A-Number (Alien Registration Number)? It starts with 'A' followed by 9 digits.",
      extract: (input) => {
        const match = input.match(/A?\s*(\d{7,9})/i);
        if (match) {
          const num = match[1].padStart(9, "0");
          return { "personalInfo.aNumber": `A${num}` };
        }
        return null;
      },
    },
    {
      field: "personalInfo.uscisElisNumber",
      question: "What is your USCIS ELIS Account Number? (It's on your Green Card — a 10 or 13 digit number. If you don't have one, say 'none'.)",
      extract: (input) => {
        const lower = input.toLowerCase();
        if (lower.includes("none") || lower.includes("don't") || lower.includes("n/a")) return {};
        const match = input.match(/(\d{10,13})/);
        return match ? { "personalInfo.uscisElisNumber": match[1] } : { "personalInfo.uscisElisNumber": input.trim() };
      },
    },
    {
      field: "personalInfo.dateBecamePR",
      question: "What date did you become a permanent resident? (Check your Green Card for the 'Resident Since' date, MM/DD/YYYY)",
      extract: (input) => {
        const d = parseDate(input);
        return d ? { "personalInfo.dateBecamePR": d } : null;
      },
    },
    {
      field: "personalInfo.countryOfBirth",
      question: "What country were you born in?",
      extract: (input) => ({ "personalInfo.countryOfBirth": input.trim() }),
    },
    {
      field: "personalInfo.nationality",
      question: "And what is your current nationality? (This may be different from your country of birth.)",
      extract: (input) => ({ "personalInfo.nationality": input.trim() }),
    },
    {
      field: "personalInfo.gender",
      question: "What is your gender? (Male or Female)",
      extract: (input) => {
        const lower = input.toLowerCase();
        if (lower.includes("male") && !lower.includes("female")) return { "personalInfo.gender": "Male" };
        if (lower.includes("female")) return { "personalInfo.gender": "Female" };
        return { "personalInfo.gender": input.trim() };
      },
    },
    {
      field: "personalInfo.ssn",
      question: "What is your Social Security Number?",
      extract: (input) => {
        const match = input.replace(/\s/g, "").match(/(\d{3})-?(\d{2})-?(\d{4})/);
        if (match) return { "personalInfo.ssn": `${match[1]}-${match[2]}-${match[3]}` };
        return { "personalInfo.ssn": input.trim() };
      },
    },
    {
      field: "personalInfo.email",
      question: "What is your email address?",
      extract: (input) => ({ "personalInfo.email": input.trim().toLowerCase() }),
    },
    {
      field: "personalInfo.phone",
      question: "What is your daytime phone number?",
      extract: (input) => {
        const digits = input.replace(/[^\d]/g, "");
        if (digits.length === 10) {
          return { "personalInfo.phone": `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}` };
        }
        return { "personalInfo.phone": input.trim() };
      },
    },
    {
      field: "personalInfo.mobilePhone",
      question: "What is your mobile phone number? (Say 'same' if it's the same as your daytime number.)",
      extract: (input, formData) => {
        const lower = input.toLowerCase();
        if (lower.includes("same")) {
          return { "personalInfo.mobilePhone": formData.personalInfo.phone || input.trim() };
        }
        const digits = input.replace(/[^\d]/g, "");
        if (digits.length === 10) {
          return { "personalInfo.mobilePhone": `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}` };
        }
        return { "personalInfo.mobilePhone": input.trim() };
      },
    },
    {
      field: "personalInfo.eligibilityBasis",
      question: "What is your basis for eligibility? Are you applying as a 5-year permanent resident, or as a 3-year permanent resident married to a US citizen?",
      extract: (input) => {
        const lower = input.toLowerCase();
        if (lower.includes("3") || lower.includes("spouse") || lower.includes("married")) {
          return { "personalInfo.eligibilityBasis": "3-year spouse" };
        }
        return { "personalInfo.eligibilityBasis": "5-year LPR" };
      },
    },
    // Biographic information — collected in this section
    {
      field: "biographic.ethnicity",
      question: "Now some biographic details for the form. Are you of Hispanic, Latino, or Spanish origin?",
      extract: (input) => {
        const lower = input.toLowerCase();
        if (lower.includes("yes") || lower.includes("hispanic") || lower.includes("latino") || lower.includes("spanish")) {
          return { "biographic.ethnicity": "Hispanic" };
        }
        return { "biographic.ethnicity": "NotHispanic" };
      },
    },
    {
      field: "biographic.race",
      question: "What is your race? (White, Asian, Black or African American, American Indian or Alaska Native, or Native Hawaiian or Pacific Islander)",
      extract: (input) => {
        const lower = input.toLowerCase();
        if (lower.includes("white") || lower.includes("caucasian")) return { "biographic.race": "White" };
        if (lower.includes("asian")) return { "biographic.race": "Asian" };
        if (lower.includes("black") || lower.includes("african")) return { "biographic.race": "Black" };
        if (lower.includes("indian") || lower.includes("alaska")) return { "biographic.race": "AmericanIndian" };
        if (lower.includes("hawaiian") || lower.includes("pacific")) return { "biographic.race": "PacificIslander" };
        return { "biographic.race": input.trim() };
      },
    },
    {
      field: "biographic.height",
      question: "How tall are you? (e.g., 5 feet 10 inches, or 5'10\")",
      extract: (input) => {
        const match = input.match(/(\d)\s*(?:feet|ft|')\s*(\d{1,2})\s*(?:inches|in|")?/i);
        if (match) {
          return { "biographic.heightFeet": parseInt(match[1]), "biographic.heightInches": parseInt(match[2]) };
        }
        const simple = input.match(/(\d)\s+(\d{1,2})/);
        if (simple) {
          return { "biographic.heightFeet": parseInt(simple[1]), "biographic.heightInches": parseInt(simple[2]) };
        }
        return null;
      },
    },
    {
      field: "biographic.weight",
      question: "What is your weight in pounds?",
      extract: (input) => {
        const match = input.match(/(\d{2,3})/);
        return match ? { "biographic.weightLbs": parseInt(match[1]) } : null;
      },
    },
    {
      field: "biographic.eyeColor",
      question: "What is your eye color? (Brown, Blue, Green, Hazel, Gray, Black, Pink, Maroon, or Unknown)",
      extract: (input) => {
        const lower = input.toLowerCase();
        const eyeMap: Record<string, string> = {
          brown: "BRO", blue: "BLU", green: "GRN", hazel: "HAZ",
          gray: "GRY", grey: "GRY", black: "BLK", pink: "PNK", maroon: "MAR", unknown: "XXX",
        };
        for (const [word, code] of Object.entries(eyeMap)) {
          if (lower.includes(word)) return { "biographic.eyeColor": code };
        }
        return { "biographic.eyeColor": input.trim().toUpperCase().slice(0, 3) };
      },
    },
    {
      field: "biographic.hairColor",
      question: "What is your hair color? (Bald, Sandy, Red, White, Gray, Blonde, Brown, Black, or Unknown)",
      extract: (input) => {
        const lower = input.toLowerCase();
        const hairMap: Record<string, string> = {
          bald: "BAL", sandy: "SDY", red: "RED", white: "WHI",
          gray: "GRY", grey: "GRY", blonde: "BLN", blond: "BLN", brown: "BRO", black: "BLK", unknown: "XXX",
        };
        for (const [word, code] of Object.entries(hairMap)) {
          if (lower.includes(word)) return { "biographic.hairColor": code };
        }
        return { "biographic.hairColor": input.trim().toUpperCase().slice(0, 3) };
      },
    },
  ];
}

function getResidenceQuestions(): SectionQuestion[] {
  return [
    {
      field: "residenceHistory.current",
      question: "Now let's go over your address history. What is your current home address? (Street, City, State, ZIP)",
      extract: (input) => {
        const parts = input.split(",").map((s) => s.trim());
        if (parts.length >= 3) {
          const stateZip = parts[parts.length - 1].match(/([A-Z]{2})\s*(\d{5})/i);
          return {
            "residenceHistory[0].address": parts[0],
            "residenceHistory[0].city": parts.length > 2 ? parts[1] : "",
            "residenceHistory[0].state": stateZip ? stateZip[1].toUpperCase() : parts[2] || "",
            "residenceHistory[0].zip": stateZip ? stateZip[2] : "",
            "residenceHistory[0].country": "United States",
          };
        }
        return { "residenceHistory[0].address": input.trim() };
      },
    },
    {
      field: "residenceHistory.moveIn",
      question: "When did you move into your current address? (Month/Year is fine, e.g., 08/2022)",
      extract: (input) => ({ "residenceHistory[0].moveInDate": input.trim() }),
    },
    {
      field: "residenceHistory.previous",
      question: "Have you lived anywhere else in the past 5 years? If yes, please provide that address and the dates you lived there. If not, just say 'no'.",
      extract: (input) => {
        const lower = input.toLowerCase();
        if (lower === "no" || lower === "no, that's it" || lower.includes("only")) {
          return { "residenceHistory.complete": true };
        }
        return { "residenceHistory.previousInfo": input.trim() };
      },
    },
  ];
}

function getFamilyQuestions(): SectionQuestion[] {
  return [
    {
      field: "family.maritalStatus",
      question: "Let's talk about your family. What is your current marital status? (Single, Married, Divorced, Widowed, or Separated)",
      extract: (input) => {
        const lower = input.toLowerCase();
        const statuses = ["married", "single", "divorced", "widowed", "separated", "annulled"];
        const found = statuses.find((s) => lower.includes(s));
        return { "family.maritalStatus": found ? found.charAt(0).toUpperCase() + found.slice(1) : input.trim() };
      },
    },
    {
      field: "family.timesMarried",
      question: "How many times have you been married in total?",
      extract: (input) => {
        const numMatch = input.match(/(\d+)/);
        if (numMatch) return { "family.timesMarried": parseInt(numMatch[1]) };
        const lower = input.toLowerCase();
        if (lower.includes("once") || lower.includes("one") || lower.includes("first")) return { "family.timesMarried": 1 };
        if (lower.includes("twice") || lower.includes("two")) return { "family.timesMarried": 2 };
        return { "family.timesMarried": 1 };
      },
    },
    {
      field: "family.spouseTimesMarried",
      question: "How many times has your current spouse been married in total? If this is their first marriage, just say 1.",
      extract: (input) => {
        const numMatch = input.match(/(\d+)/);
        if (numMatch) return { "family.spouseTimesMarried": parseInt(numMatch[1]) };
        const lower = input.toLowerCase();
        if (lower.includes("once") || lower.includes("one") || lower.includes("first")) return { "family.spouseTimesMarried": 1 };
        if (lower.includes("twice") || lower.includes("two")) return { "family.spouseTimesMarried": 2 };
        return { "family.spouseTimesMarried": 1 };
      },
    },
    {
      field: "family.spouse",
      question: "What is your current spouse's full legal name?",
      extract: (input) => ({ "family.spouse.fullName": input.trim().toUpperCase() }),
    },
    {
      field: "family.spouseDOB",
      question: "What is your spouse's date of birth? (MM/DD/YYYY)",
      extract: (input) => {
        const d = parseDate(input);
        return d ? { "family.spouse.dateOfBirth": d } : { "family.spouse.dateOfBirth": input.trim() };
      },
    },
    {
      field: "family.marriageDate",
      question: "When did you get married? (MM/DD/YYYY)",
      extract: (input) => {
        const d = parseDate(input);
        return d ? { "family.spouse.dateOfMarriage": d } : { "family.spouse.dateOfMarriage": input.trim() };
      },
    },
    {
      field: "family.spouseCitizen",
      question: "Is your spouse a US citizen?",
      extract: (input) => {
        const yes = input.toLowerCase().includes("yes");
        return { "family.spouse.isCitizen": yes };
      },
    },
    {
      field: "family.spouseCitizenshipBy",
      question: "Did your spouse become a citizen by birth or through naturalization (or other means)?",
      extract: (input) => {
        const lower = input.toLowerCase();
        if (lower.includes("birth") || lower.includes("born")) return { "family.spouse.citizenshipBy": "Birth" };
        return { "family.spouse.citizenshipBy": "Other" };
      },
    },
    {
      field: "family.children",
      question: "Do you have any children? If yes, how many? If no, just say 'no'.",
      extract: (input) => {
        const lower = input.toLowerCase();
        if (lower === "no" || lower.includes("no children") || lower.includes("don't have") || lower.includes("none")) {
          return { "family.totalChildren": 0 };
        }
        const numMatch = input.match(/(\d+)/);
        return { "family.totalChildren": numMatch ? parseInt(numMatch[1]) : 0 };
      },
    },
    {
      field: "family.childrenDetails",
      question: "Please list your children's full names and A-Numbers (if they have one). For example: 'Sofia Martinez, A111222333; Diego Martinez, A444555666'. Also note if any child does NOT live with you.",
      extract: (input) => {
        const children: Array<{ fullName?: string; aNumber?: string; livesWithYou?: boolean }> = [];
        // Split by semicolons or newlines
        const entries = input.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
        for (const entry of entries) {
          const aMatch = entry.match(/A\d{7,9}/i);
          const notLiving = entry.toLowerCase().includes("not live") || entry.toLowerCase().includes("doesn't live") || entry.toLowerCase().includes("does not live");
          const namePart = entry.replace(/,?\s*A\d{7,9}/i, "").replace(/,?\s*(not|doesn't|does not)\s*live.*$/i, "").trim();
          children.push({
            fullName: namePart.toUpperCase(),
            aNumber: aMatch ? aMatch[0].toUpperCase() : undefined,
            livesWithYou: !notLiving,
          });
        }
        return { "family.children": children };
      },
    },
    {
      field: "family.householdSize",
      question: "How many people currently live in your household (including yourself)?",
      extract: (input) => {
        const numMatch = input.match(/(\d+)/);
        return numMatch ? { "family.householdSize": parseInt(numMatch[1]) } : null;
      },
    },
  ];
}

function getEmploymentQuestions(): SectionQuestion[] {
  return [
    {
      field: "employment.current",
      question: "Let's go over your work history. Are you currently employed? If yes, where do you work and what is your job title?",
      extract: (input) => {
        const lower = input.toLowerCase();
        if (lower.includes("unemployed") || lower.includes("not working") || lower.includes("retired")) {
          return { "employment[0].status": lower.includes("retired") ? "Retired" : "Unemployed" };
        }
        return { "employment[0].info": input.trim() };
      },
    },
    {
      field: "employment.startDate",
      question: "When did you start this job? (Month/Year)",
      extract: (input) => ({ "employment[0].startDate": input.trim() }),
    },
    {
      field: "employment.previous",
      question: "Have you had any other jobs in the past 5 years? If yes, please tell me about them. If not, just say 'no'.",
      extract: (input) => {
        const lower = input.toLowerCase();
        if (lower === "no" || lower.includes("only job") || lower.includes("that's it")) {
          return { "employment.complete": true };
        }
        return { "employment.previousInfo": input.trim() };
      },
    },
  ];
}

function getTravelQuestions(): SectionQuestion[] {
  return [
    {
      field: "travel.any",
      question: "Now I need to ask about your travel history. Have you traveled outside the United States since you became a permanent resident? If yes, please tell me about your trips (country, departure date, return date).",
      extract: (input) => {
        const lower = input.toLowerCase();
        if (lower === "no" || lower.includes("haven't") || lower.includes("never left")) {
          return { "travelHistory.none": true };
        }
        return { "travelHistory.info": input.trim() };
      },
    },
    {
      field: "travel.more",
      question: "Any other trips outside the US? If not, just say 'no more'.",
      extract: (input) => {
        const lower = input.toLowerCase();
        if (lower.includes("no") || lower.includes("that's all") || lower.includes("done")) {
          return { "travelHistory.complete": true };
        }
        return { "travelHistory.moreInfo": input.trim() };
      },
    },
  ];
}

function getMoralCharacterQuestions(): SectionQuestion[] {
  return [
    {
      field: "moral.intro",
      question: "I need to ask you some important questions about your background. These are standard for everyone applying for citizenship. Please answer honestly — there's no judgment here.\n\nHave you ever claimed to be a US citizen (when you weren't)?",
      extract: (input) => ({ "moralCharacter.claimedUSCitizen": input.toLowerCase().includes("yes") }),
    },
    {
      field: "moral.voted",
      question: "Have you ever registered to vote or voted in any federal, state, or local election in the United States?",
      extract: (input) => ({ "moralCharacter.votedInElection": input.toLowerCase().includes("yes") }),
    },
    {
      field: "moral.arrest",
      question: "Have you EVER been arrested, cited, or detained by any law enforcement officer? (This includes traffic tickets.)",
      extract: (input) => ({ "moralCharacter.arrestedOrDetained": input.toLowerCase().includes("yes") }),
    },
    {
      field: "moral.crime",
      question: "Have you EVER been convicted of a crime or offense?",
      extract: (input) => ({ "moralCharacter.convictedOfCrime": input.toLowerCase().includes("yes") }),
    },
    {
      field: "moral.drugs",
      question: "Have you EVER used or sold illegal drugs (including marijuana)?",
      extract: (input) => ({ "moralCharacter.usedIllegalDrugs": input.toLowerCase().includes("yes") }),
    },
    {
      field: "moral.organizations",
      question: "Have you ever been a member of, or associated with, the Communist Party, a terrorist organization, or any group that advocates violence?",
      extract: (input) => ({
        "moralCharacter.communistPartyMember": input.toLowerCase().includes("yes"),
        "moralCharacter.terroristAssociation": input.toLowerCase().includes("yes"),
      }),
    },
    {
      field: "moral.selective",
      question: "If you are male and lived in the US between ages 18-26, did you register with Selective Service?",
      extract: (input) => {
        const lower = input.toLowerCase();
        if (lower.includes("yes") || lower.includes("registered")) {
          return { "moralCharacter.registeredSelectiveService": true };
        }
        if (lower.includes("female") || lower.includes("n/a") || lower.includes("not applicable")) {
          return { "moralCharacter.registeredSelectiveService": null };
        }
        return { "moralCharacter.registeredSelectiveService": lower.includes("yes") };
      },
    },
  ];
}

function getOathQuestions(): SectionQuestion[] {
  return [
    {
      field: "oath.support",
      question: "Almost done! These are the oath questions.\n\nDo you support the Constitution and form of government of the United States?",
      extract: (input) => ({ "oath.supportConstitution": input.toLowerCase().includes("yes") }),
    },
    {
      field: "oath.allegiance",
      question: "Are you willing to take the full Oath of Allegiance to the United States?",
      extract: (input) => ({ "oath.willingTakeOath": input.toLowerCase().includes("yes") }),
    },
    {
      field: "oath.arms",
      question: "Are you willing to bear arms on behalf of the United States if required by law?",
      extract: (input) => ({ "oath.willingBearArms": input.toLowerCase().includes("yes") }),
    },
    {
      field: "oath.noncombat",
      question: "Are you willing to perform noncombatant service in the US Armed Forces if required?",
      extract: (input) => ({ "oath.willingNoncombatService": input.toLowerCase().includes("yes") }),
    },
    {
      field: "oath.national",
      question: "Are you willing to perform work of national importance under civilian direction if required?",
      extract: (input) => ({ "oath.willingNationalService": input.toLowerCase().includes("yes") }),
    },
  ];
}

function getQuestionsForSection(section: Section): SectionQuestion[] {
  switch (section) {
    case "INTRO": return getIntroQuestions();
    case "PERSONAL_INFO": return getPersonalInfoQuestions();
    case "RESIDENCE_HISTORY": return getResidenceQuestions();
    case "FAMILY_INFO": return getFamilyQuestions();
    case "EMPLOYMENT": return getEmploymentQuestions();
    case "TRAVEL": return getTravelQuestions();
    case "MORAL_CHARACTER": return getMoralCharacterQuestions();
    case "OATH": return getOathQuestions();
    case "REVIEW": return [];
    default: return [];
  }
}

function findCurrentQuestionIndex(
  section: Section,
  messages: ChatMessage[],
): number {
  const questions = getQuestionsForSection(section);
  // Count how many assistant questions in this section have been asked
  const sectionMessages = messages.filter(
    (m) => m.role === "assistant" && m.section === section,
  );
  return Math.min(sectionMessages.length, questions.length);
}

function applyExtractedFields(
  formData: N400FormData,
  extracted: Record<string, unknown>,
): N400FormData {
  const data = JSON.parse(JSON.stringify(formData)) as N400FormData;

  for (const [key, value] of Object.entries(extracted)) {
    const parts = key.split(".");
    if (parts[0] === "personalInfo" && parts.length === 2) {
      (data.personalInfo as any)[parts[1]] = value;
    } else if (parts[0] === "family" && parts.length === 2) {
      (data.family as any)[parts[1]] = value;
    } else if (parts[0] === "family" && parts[1] === "spouse" && parts.length === 3) {
      if (!data.family.spouse) data.family.spouse = {};
      (data.family.spouse as any)[parts[2]] = value;
    } else if (parts[0] === "moralCharacter" && parts.length === 2) {
      (data.moralCharacter as any)[parts[1]] = value;
    } else if (parts[0] === "oath" && parts.length === 2) {
      (data.oath as any)[parts[1]] = value;
    }
  }

  return data;
}

function detectRedFlags(formData: N400FormData): RedFlag[] {
  const flags: RedFlag[] = [];

  // Check travel duration
  for (const trip of formData.travelHistory) {
    if (trip.departureDate && trip.returnDate) {
      const dep = new Date(trip.departureDate);
      const ret = new Date(trip.returnDate);
      const days = (ret.getTime() - dep.getTime()) / (1000 * 60 * 60 * 24);
      if (days > 365) {
        flags.push({
          type: "travel_over_1_year",
          severity: "error",
          field: "travelHistory",
          description: `Trip to ${trip.destination} lasted over 1 year (${Math.round(days)} days). This may break continuous residence.`,
          recommendation: "CRITICAL: Do not submit without legal advice. This may break continuous residence.",
        });
      } else if (days > 180) {
        flags.push({
          type: "travel_over_6_months",
          severity: "warning",
          field: "travelHistory",
          description: `Trip to ${trip.destination} lasted over 6 months (${Math.round(days)} days). This may affect continuous residence.`,
          recommendation: "Consult an immigration lawyer before submitting.",
        });
      }
    }
  }

  // Criminal history
  if (formData.moralCharacter.convictedOfCrime) {
    flags.push({
      type: "criminal_history",
      severity: "error",
      description: "Criminal conviction reported. This may affect eligibility.",
      recommendation: "Consult an immigration lawyer before submitting.",
    });
  }
  if (formData.moralCharacter.arrestedOrDetained) {
    flags.push({
      type: "arrest_history",
      severity: "warning",
      description: "Arrest/citation history reported. Gather all documentation.",
      recommendation: "Bring court records and dispositions to your interview.",
    });
  }
  if (formData.moralCharacter.usedIllegalDrugs) {
    flags.push({
      type: "drug_use",
      severity: "error",
      description: "Drug use reported. This may affect eligibility.",
      recommendation: "Get legal advice before submitting.",
    });
  }
  if (formData.moralCharacter.owedUnpaidTaxes) {
    flags.push({
      type: "unpaid_taxes",
      severity: "warning",
      description: "Unpaid taxes reported. Address before submitting.",
      recommendation: "Pay taxes owed or set up a payment plan with the IRS.",
    });
  }

  return flags;
}

export function processMessage(
  userMessage: string,
  currentSection: Section,
  formData: N400FormData,
  messages: ChatMessage[],
): ConversationResult {
  const questions = getQuestionsForSection(currentSection);
  const questionIndex = findCurrentQuestionIndex(currentSection, messages);

  // Try to extract fields from user message
  let extractedFields: Record<string, unknown> = {};
  if (questionIndex > 0 && questionIndex <= questions.length) {
    const prevQ = questions[questionIndex - 1];
    const extracted = prevQ.extract(userMessage, formData);
    if (extracted) {
      extractedFields = extracted;
    }
  }

  // Apply extracted fields
  const updatedFormData = applyExtractedFields(formData, extractedFields);

  // Check if we're done with this section
  const isLastQuestion = questionIndex >= questions.length;

  // Determine next question or section
  let botMessage: string;
  let shouldMoveToNextSection = false;
  let nextSection: Section | undefined;

  if (isLastQuestion || currentSection === "REVIEW") {
    // Move to next section
    const currentIndex = SECTIONS.indexOf(currentSection);
    if (currentIndex < SECTIONS.length - 1) {
      nextSection = SECTIONS[currentIndex + 1] as Section;
      shouldMoveToNextSection = true;

      // Confirmation + transition message
      const nextQuestions = getQuestionsForSection(nextSection);
      if (nextQuestions.length > 0) {
        botMessage = `Great, I've got all the information I need for this section. Let's move on.\n\n${nextQuestions[0].question}`;
      } else {
        botMessage = "Excellent! We've completed all the sections. Let me prepare your review summary. You can review all your information on the Review page.";
      }
    } else {
      botMessage = "We've completed all sections! Please head to the Review page to check everything and generate your PDF.";
    }
  } else {
    // Ask the next question
    const nextQ = questions[questionIndex];

    // If extraction failed, ask for clarification
    if (questionIndex > 0 && Object.keys(extractedFields).length === 0) {
      const prevQ = questions[questionIndex - 1];
      botMessage = `I didn't quite catch that. ${prevQ.question}`;
    } else {
      // Provide confirmation + next question
      let confirmation = "";
      if (Object.keys(extractedFields).length > 0 && questionIndex > 0) {
        const values = Object.values(extractedFields).filter(
          (v) => v !== null && v !== undefined && v !== true && v !== false,
        );
        if (values.length > 0) {
          confirmation = `Got it — ${values[0]}. `;
        } else {
          confirmation = "Got it. ";
        }
      }
      botMessage = confirmation + nextQ.question;
    }
  }

  // Detect red flags
  const redFlags = detectRedFlags(updatedFormData);

  return {
    botMessage,
    extractedFields,
    shouldMoveToNextSection,
    nextSection,
    redFlags,
    updatedFormData,
  };
}

export function getInitialMessage(section: Section): string {
  const questions = getQuestionsForSection(section);
  if (questions.length > 0) return questions[0].question;
  return "Let's continue with your application.";
}
