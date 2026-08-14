"use client";
import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const RESOURCES = "https://docs.google.com/document/d/1aBK18nj4wxiTqk6z8hFYViVuymifKj2hbtXnY6O7GBw/edit?usp=sharing";

// accepts drive.google.com/drive/folders/... (with or without query params)
function isDriveFolder(url) {
  try {
    const u = new URL(url.trim());
    if (!/^(www\.)?drive\.google\.com$/.test(u.hostname)) return false;
    return /\/drive\/(u\/\d+\/)?folders\//.test(u.pathname);
  } catch {
    return false;
  }
}

export default function Submit() {
  const [roll, setRoll] = useState("");
  const [candidate, setCandidate] = useState(null);
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState("lookup"); // lookup | form | saving | done
  const [error, setError] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  async function lookup(e) {
    e.preventDefault();
    setError("");
    const { data } = await supabase.from("candidates").select("roll_no,name").eq("roll_no", roll.trim().toUpperCase()).maybeSingle();
    if (!data) return setError("Roll number not found. Use the same roll number you registered with.");
    setCandidate(data);
    setState("form");
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!link.trim()) return setError("Please paste your Google Drive folder link.");
    if (!isDriveFolder(link)) {
      return setError("That doesn't look like a Google Drive folder link. It should look like https://drive.google.com/drive/folders/…");
    }
    setState("saving");
    const { error: err } = await supabase.from("task_submissions").insert({
      roll_no: candidate.roll_no,
      links: [{ label: "Drive folder", url: link.trim() }],
      notes: notes.trim() || null
    });
    if (err) { setState("form"); setError(err.message); } else setState("done");
  }

  if (state === "done")
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="card p-10 max-w-md text-center fade-up">
          <div className="text-5xl mb-4">🏆</div>
          <h1 className="font-display text-3xl mb-2">Task submitted!</h1>
          <p className="text-muted">Your work is linked to your profile, {candidate.name}. Results will be announced soon.</p>
          <p className="text-muted text-xs mt-4">Double-check that your folder is shared with &quot;Anyone with the link&quot; — we can&apos;t review what we can&apos;t open.</p>
          <Link href="/" className="btn-ghost mt-8">Back to home</Link>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen px-4 sm:px-6 py-10 max-w-xl mx-auto">
      <Link href="/" className="text-muted text-sm hover:text-gold">&larr; Home</Link>
      <h1 className="font-display text-4xl sm:text-5xl mt-4 mb-1">Task Submission</h1>
      <p className="text-muted mb-3">Submit one Google Drive folder containing all your work.</p>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <a href={RESOURCES} target="_blank" rel="noopener noreferrer"
          className="btn-ghost !py-2 text-sm border-gold/40 text-gold hover:bg-gold/10">
          Task Resources ↗
        </a>
        <span className="text-sm text-cream/90">Deadline: <span className="text-gold font-semibold">18th August</span></span>
      </div>

      {state === "lookup" && (
        <form onSubmit={lookup} className="card p-6 sm:p-8 space-y-4 fade-up">
          <label className="text-sm text-muted">Your Roll Number</label>
          <input className="input" placeholder="26XX10001" value={roll} onChange={(e) => setRoll(e.target.value)} />
          {error && <p className="text-red text-sm">{error}</p>}
          <button className="btn-gold w-full">Find my profile</button>
        </form>
      )}

      {(state === "form" || state === "saving") && (
        <form onSubmit={submit} className="card p-6 sm:p-8 space-y-5 fade-up">
          <p className="text-sm">Submitting as <span className="text-gold font-semibold">{candidate.name}</span> ({candidate.roll_no})</p>

          <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm space-y-2">
            <p className="text-gold font-semibold">Before you submit</p>
            <ul className="text-cream/80 space-y-1.5 list-disc pl-5">
              <li>Submit a <strong>single Google Drive folder link</strong> — put each task in its own subfolder inside it, clearly named.</li>
              <li>Set sharing to <strong>&quot;Anyone with the link&quot;</strong>, or we won&apos;t be able to open your work and it can&apos;t be evaluated.</li>
            </ul>
            <button type="button" className="text-gold text-xs hover:underline" onClick={() => setShowHelp(!showHelp)}>
              {showHelp ? "Hide" : "How do I give access?"}
            </button>
            {showHelp && (
              <ol className="text-cream/80 text-xs space-y-1 list-decimal pl-5 pt-1">
                <li>Open the folder in Google Drive.</li>
                <li>Right-click the folder → <strong>Share</strong> (or click Share at the top).</li>
                <li>Under <strong>General access</strong>, change &quot;Restricted&quot; to <strong>&quot;Anyone with the link&quot;</strong>.</li>
                <li>Keep the role as <strong>Viewer</strong>, then click <strong>Copy link</strong> and <strong>Done</strong>.</li>
                <li>Paste that link below. Tip: open it in an incognito window to confirm it works.</li>
              </ol>
            )}
          </div>

          <div>
            <label className="text-sm text-muted">Google Drive folder link *</label>
            <input className="input mt-1" placeholder="https://drive.google.com/drive/folders/…" value={link} onChange={(e) => setLink(e.target.value)} />
          </div>

          <div>
            <label className="text-sm text-muted">Note (optional)</label>
            <textarea className="input mt-1 min-h-[80px]" placeholder="Anything the reviewers should know — which folder is which, tools used, etc." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <p className="text-red text-sm">{error}</p>}
          <button className="btn-gold w-full" disabled={state === "saving"}>{state === "saving" ? "Submitting…" : "Submit Task"}</button>
        </form>
      )}
    </main>
  );
}
