"use client";
import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function Submit() {
  const [roll, setRoll] = useState("");
  const [candidate, setCandidate] = useState(null);
  const [links, setLinks] = useState([{ label: "", url: "" }]);
  const [notes, setNotes] = useState("");
  const [state, setState] = useState("lookup"); // lookup | form | saving | done
  const [error, setError] = useState("");

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
    const clean = links.filter((l) => l.url.trim());
    if (clean.length === 0) return setError("Add at least one link.");
    setState("saving");
    const { error: err } = await supabase.from("task_submissions").insert({
      roll_no: candidate.roll_no, links: clean, notes
    });
    if (err) { setState("form"); setError(err.message); } else setState("done");
  }

  const setLink = (i, k, v) => {
    const next = [...links]; next[i] = { ...next[i], [k]: v }; setLinks(next);
  };

  if (state === "done")
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="card p-10 max-w-md text-center fade-up">
          <div className="text-5xl mb-4">🏆</div>
          <h1 className="font-display text-3xl mb-2">Task submitted!</h1>
          <p className="text-muted">Your work is linked to your profile, {candidate.name}. Results will be announced soon.</p>
          <Link href="/" className="btn-ghost mt-8">Back to home</Link>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen px-4 sm:px-6 py-10 max-w-xl mx-auto">
      <Link href="/" className="text-muted text-sm hover:text-gold">&larr; Home</Link>
      <h1 className="font-display text-4xl sm:text-5xl mt-4 mb-1">Task Submission</h1>
      <p className="text-muted mb-3">Submit links to your completed tasks (Drive, YouTube, Behance, etc.)</p>
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <a href="https://docs.google.com/document/d/1aBK18nj4wxiTqk6z8hFYViVuymifKj2hbtXnY6O7GBw/edit?usp=sharing"
          target="_blank" rel="noopener noreferrer"
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
          {links.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_2fr] gap-3">
              <input className="input" placeholder="Label (e.g. Photo task)" value={l.label} onChange={(e) => setLink(i, "label", e.target.value)} />
              <input className="input" placeholder="https://drive.google.com/…" value={l.url} onChange={(e) => setLink(i, "url", e.target.value)} />
            </div>
          ))}
          <button type="button" className="text-gold text-sm hover:underline" onClick={() => setLinks([...links, { label: "", url: "" }])}>+ Add another link</button>
          <textarea className="input min-h-[80px]" placeholder="Notes for the reviewers (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <p className="text-muted text-xs">Make sure your links are viewable by anyone with the link.</p>
          {error && <p className="text-red text-sm">{error}</p>}
          <button className="btn-gold w-full" disabled={state === "saving"}>{state === "saving" ? "Submitting…" : "Submit Task"}</button>
        </form>
      )}
    </main>
  );
}
