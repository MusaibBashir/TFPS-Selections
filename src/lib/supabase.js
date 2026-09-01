import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const DOMAINS = [
  "Photography",
  "Cinematography",
  "Editing",
  "VFX",
  "Sound Design/Music",
  "Scriptwriting",
  "Film Analysis",
  "Graphic Design"
];

export const HALLS = [
  "ABV", "Azad", "BCRoy", "BRH", "Gokhale", "HJB", "JCB", "LBS", "LLR",
  "MMM", "MS", "MT", "Nehru", "Patel", "PDFB", "RK", "RP", "SNIG", "SNVH",
  "SBP1", "SBP2", "VS", "ZH", "Other"
];

// ---------------------------------------------------------------------------
// Girls' halls. Hall values are messy — the website form stores codes ("SNVH")
// while the Google Form stored full names ("Sister Nivedita (SNVH) Hall"), so
// both have to resolve to the same hall.
//
// Matching is on whole tokens, never substrings: "MT" must not match "MMM", and
// "MS" (Megnad Saha) must never come out as a girls' hall.
const GIRLS_CODES = ["SNVH", "MT", "SNIG", "IGH", "VGH"];
const GIRLS_PHRASES = [
  ["SISTER NIVEDITA", "SNVH"],
  ["MOTHER TERESA", "MT"],
  ["INDIRA GANDHI", "IGH"],
  ["SAVITRIBAI PHULE", "SBP"],
  ["SAROJINI NAIDU", "SNIG"]
];

// Full names for the codes we can state with confidence; used as tooltips.
export const HALL_NAMES = {
  SNVH: "Sister Nivedita Hall",
  MT: "Mother Teresa Hall",
  IGH: "Indira Gandhi Hall",
  SBP: "Savitribai Phule Hall",
  SBP1: "Savitribai Phule Hall I",
  SBP2: "Savitribai Phule Hall II",
  SBPI: "Savitribai Phule Hall I",
  SBPII: "Savitribai Phule Hall II"
};

/** Returns the girls' hall code for a hall string, or null if it isn't one. */
export function girlsHallCode(hall) {
  if (!hall) return null;
  const norm = String(hall).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  if (!norm) return null;
  for (const [phrase, code] of GIRLS_PHRASES) if (norm.includes(phrase)) return code;
  for (const t of norm.split(" ")) {
    if (GIRLS_CODES.includes(t)) return t;
    // SBP, SBP1, SBP2, SBP-I, SBP-II all normalise to a token starting SBP
    if (/^SBP(\d+|I+)?$/.test(t)) return t;
  }
  return null;
}

export function isGirlsHall(hall) {
  return girlsHallCode(hall) !== null;
}

export function tagColor(tag) {
  if (tag === "green") return "text-green border-green/40 bg-green/10";
  if (tag === "yellow") return "text-yellow border-yellow/40 bg-yellow/10";
  if (tag === "red") return "text-red border-red/40 bg-red/10";
  return "text-muted border-edge bg-transparent";
}

// session helpers — persists across tabs/visits; expires after 7 days or on explicit logout
const SESSION_TTL = 7 * 24 * 3600 * 1000;
export function getSession() {
  if (typeof window === "undefined") return null;
  try {
    const s = JSON.parse(localStorage.getItem("tfps_session"));
    if (!s) return null;
    if (s.exp && Date.now() > s.exp) { localStorage.removeItem("tfps_session"); return null; }
    return s;
  } catch {
    return null;
  }
}
export function setSession(s) {
  localStorage.setItem("tfps_session", JSON.stringify({ ...s, exp: Date.now() + SESSION_TTL }));
}
export function clearSession() {
  localStorage.removeItem("tfps_session");
}

// admin-controlled editing locks
export async function getLocks() {
  const { data } = await supabase.from("app_settings").select("key,value");
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  return {
    interview: map.panel_feedback_editing ?? true, // panel interview reviews
    task: map.task_review_editing ?? true          // task reviews on the review board
  };
}
export async function setLock(key, value) {
  await supabase.from("app_settings").upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
}

// Admin-controlled selection phase. Stored as a boolean in the same settings
// table: false (or missing) = interview mode, true = task review mode.
export const MODE_KEY = "task_review_mode";
export async function getMode() {
  const { data } = await supabase
    .from("app_settings").select("value").eq("key", MODE_KEY).maybeSingle();
  return data?.value ? "task" : "interview";
}
export async function setMode(mode) {
  await setLock(MODE_KEY, mode === "task");
}
