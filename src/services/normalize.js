const { DateTime } = require("luxon");
const chrono = require("chrono-node");

const DEPT_MAP = {
  // Dental
  dentist: "Dentistry",
  dental: "Dentistry",
  dentistry: "Dentistry",
  "dental clinic": "Dentistry",
  "dental care": "Dentistry",
  "oral surgery": "Dentistry",
  "root canal": "Dentistry",
  tooth: "Dentistry",

  // Medical Specialties
  dermatology: "Dermatology",
  "skin doctor": "Dermatology",
  cardiology: "Cardiology",
  "heart doctor": "Cardiology",
  cardiac: "Cardiology",
  eye: "Ophthalmology",
  ophthalmology: "Ophthalmology",
  "eye doctor": "Ophthalmology",
  vision: "Ophthalmology",
  orthopedics: "Orthopedics",
  "bone doctor": "Orthopedics",
  orthopedic: "Orthopedics",
  general: "General Medicine",
  "family doctor": "General Medicine",
  "primary care": "General Medicine",
  "internal medicine": "Internal Medicine",
  pediatrics: "Pediatrics",
  "child doctor": "Pediatrics",
  gynecology: "Gynecology",
  "women's health": "Gynecology",
  neurology: "Neurology",
  "brain doctor": "Neurology",
  psychiatry: "Psychiatry",
  "mental health": "Psychiatry",
  psychology: "Psychology",
  therapy: "Psychology",
};

function normalizeDepartment(deptRaw) {
  if (!deptRaw) return { department_formal: null, dept_confidence: 0.0 };
  const key = String(deptRaw).toLowerCase().trim();

  // Direct mapping
  let mapped = DEPT_MAP[key];

  // Fuzzy matching for partial matches
  if (!mapped) {
    for (const [pattern, dept] of Object.entries(DEPT_MAP)) {
      if (key.includes(pattern) || pattern.includes(key)) {
        mapped = dept;
        break;
      }
    }
  }

  // Fallback patterns
  if (!mapped) {
    if (key.includes("dent") || key.includes("tooth") || key.includes("oral")) {
      mapped = "Dentistry";
    } else if (key.includes("skin") || key.includes("derma")) {
      mapped = "Dermatology";
    } else if (key.includes("heart") || key.includes("cardio")) {
      mapped = "Cardiology";
    } else if (key.includes("eye") || key.includes("vision")) {
      mapped = "Ophthalmology";
    } else if (key.includes("bone") || key.includes("ortho")) {
      mapped = "Orthopedics";
    } else if (key.includes("child") || key.includes("pediatric")) {
      mapped = "Pediatrics";
    } else if (key.includes("women") || key.includes("gyne")) {
      mapped = "Gynecology";
    } else if (key.includes("brain") || key.includes("neuro")) {
      mapped = "Neurology";
    } else if (key.includes("mental") || key.includes("psych")) {
      mapped = "Psychiatry";
    } else if (
      key.includes("general") ||
      key.includes("family") ||
      key.includes("primary")
    ) {
      mapped = "General Medicine";
    }
  }

  return {
    department_formal: mapped,
    dept_confidence: mapped ? 0.9 : 0.4,
  };
}

function normalizeDateTime(entities, tz) {
  const nowTz = DateTime.now().setZone(tz);
  const datePhrase = entities.date_phrase || "";
  const timePhrase = entities.time_phrase || "";

  // Use chrono structured parsing to avoid timezone shifts
  const dateResults = chrono.parse(datePhrase, nowTz.toJSDate());
  const timeResults = chrono.parse(timePhrase, nowTz.toJSDate());

  if (!dateResults.length || !timeResults.length) {
    return { status: "needs_clarification" };
  }

  const dStart = dateResults[0].start; // ParsedComponents
  const tStart = timeResults[0].start;

  const dateObj = {
    year: dStart.get("year") ?? nowTz.year,
    month: dStart.get("month") ?? nowTz.month,
    day: dStart.get("day") ?? nowTz.day,
  };
  const timeObj = {
    hour: tStart.get("hour") ?? 0,
    minute: tStart.get("minute") ?? 0,
  };

  const dt = DateTime.fromObject({
    ...dateObj,
    ...timeObj,
    second: 0,
    millisecond: 0,
  }, { zone: tz });

  return {
    status: "ok",
    date: dt.toFormat("yyyy-LL-dd"),
    time: dt.toFormat("HH:mm"),
  };
}

async function normalizeAppointment(entities, tz = "Asia/Kolkata") {
  const deptNorm = normalizeDepartment(entities.department);
  const dt = normalizeDateTime(entities, tz);
  if (dt.status !== "ok" || !deptNorm.department_formal) {
    return { status: "needs_clarification" };
  }
  return {
    status: "ok",
    normalized: {
      department_formal: deptNorm.department_formal,
      date: dt.date,
      time: dt.time,
      tz,
    },
    normalization_confidence: Math.min(
      0.95,
      0.8 + 0.1 * (deptNorm.dept_confidence >= 0.8 ? 1 : 0)
    ),
  };
}

module.exports = { normalizeAppointment };
