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

export function tagColor(tag) {
  if (tag === "green") return "text-green border-green/40 bg-green/10";
  if (tag === "yellow") return "text-yellow border-yellow/40 bg-yellow/10";
  if (tag === "red") return "text-red border-red/40 bg-red/10";
  return "text-muted border-edge bg-transparent";
}

// session helpers
export function getSession() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(sessionStorage.getItem("tfps_session"));
  } catch {
    return null;
  }
}
export function setSession(s) {
  sessionStorage.setItem("tfps_session", JSON.stringify(s));
}
export function clearSession() {
  sessionStorage.removeItem("tfps_session");
}
