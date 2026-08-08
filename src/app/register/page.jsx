"use client";
import { useState } from "react";
import Link from "next/link";
import { supabase, DOMAINS, HALLS } from "@/lib/supabase";

export default function Register() {
  const [form, setForm] = useState({ roll_no: "", name: "", email: "", phone: "", hall: "", department: "", hobbies: "", movie_love: "", movie_hate: "", about_us: "", about: "", portfolio_link: "" });
  const [domains, setDomains] = useState([]);
  const [state, setState] = useState("idle"); // idle | saving | done | error
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleDomain = (d) =>
    setDomains(domains.includes(d) ? domains.filter((x) => x !== d) : [...domains, d]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    const required = [
      ["roll_no", "Roll number"],
      ["name", "Full name"],
      ["email", "Email"],
      ["phone", "Phone / WhatsApp"],
      ["hall", "Hall of residence"],
      ["department", "Department"],
      ["hobbies", "Interests & hobbies"],
      ["movie_love", "A movie you love"],
      ["movie_hate", "A movie you hate"],
      ["about", "Something interesting about yourself"],
    ];
    for (const [key, label] of required) {
      if (!form[key].trim()) return setError(`${label} is required.`);
    }
    if (domains.length === 0) return setError("Pick at least one domain you're interested in.");
    setState("saving");
    const { error: err } = await supabase.from("candidates").insert({
      ...form,
      roll_no: form.roll_no.trim().toUpperCase(),
      domains
    });
    if (err) {
      setState("idle");
      setError(err.code === "23505" ? "This roll number is already registered." : err.message);
    } else setState("done");
  }

  if (state === "done")
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="card p-10 max-w-md text-center fade-up">
          <div className="text-5xl mb-4">🎬</div>
          <h1 className="font-display text-3xl mb-2">You&apos;re in the frame!</h1>
          <p className="text-muted">Registration received. See you at the interviews — keep an eye on our channels for your slot.</p>
          <Link href="/" className="btn-ghost mt-8">Back to home</Link>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen px-4 sm:px-6 py-10 max-w-2xl mx-auto">
      <Link href="/" className="text-muted text-sm hover:text-gold">&larr; Home</Link>
      <h1 className="font-display text-4xl sm:text-5xl mt-4 mb-1">Register</h1>
      <p className="text-muted mb-8">TFPS Selections 2026 · Freshers&apos; onboarding</p>
      <form onSubmit={submit} className="card p-6 sm:p-8 space-y-5 fade-up">
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <label className="text-sm text-muted">Roll Number *</label>
            <input className="input mt-1" placeholder="26XX10001" value={form.roll_no} onChange={set("roll_no")} />
          </div>
          <div>
            <label className="text-sm text-muted">Full Name *</label>
            <input className="input mt-1" placeholder="Your name" value={form.name} onChange={set("name")} />
          </div>
          <div>
            <label className="text-sm text-muted">Email *</label>
            <input className="input mt-1" type="email" required placeholder="you@kgpian.iitkgp.ac.in" value={form.email} onChange={set("email")} />
          </div>
          <div>
            <label className="text-sm text-muted">Phone / WhatsApp *</label>
            <input className="input mt-1" required placeholder="+91…" value={form.phone} onChange={set("phone")} />
          </div>
          <div>
            <label className="text-sm text-muted">Hall of Residence *</label>
            <select className="input mt-1" required value={form.hall} onChange={set("hall")}>
              <option value="">Select hall</option>
              {HALLS.map((h) => <option key={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-muted">Department *</label>
            <input className="input mt-1" required placeholder="e.g. ECE" value={form.department} onChange={set("department")} />
          </div>
        </div>
        <div>
          <label className="text-sm text-muted">Preferred Domains * <span className="text-xs">(pick any)</span></label>
          <div className="flex flex-wrap gap-2 mt-2">
            {DOMAINS.map((d) => (
              <button type="button" key={d} onClick={() => toggleDomain(d)}
                className={`chip transition-all ${domains.includes(d) ? "border-gold bg-gold/15 text-gold" : "border-edge text-muted hover:border-gold/40"}`}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm text-muted">Interests &amp; hobbies *</label>
          <input className="input mt-1" required placeholder="What do you do outside academics?" value={form.hobbies} onChange={set("hobbies")} />
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <label className="text-sm text-muted">A movie you love (and why) *</label>
            <textarea className="input mt-1 min-h-[70px]" required value={form.movie_love} onChange={set("movie_love")} />
          </div>
          <div>
            <label className="text-sm text-muted">A movie you hate (and why) *</label>
            <textarea className="input mt-1 min-h-[70px]" required value={form.movie_hate} onChange={set("movie_hate")} />
          </div>
        </div>
        <div>
          <label className="text-sm text-muted">What do you think about us (TFPS)?</label>
          <textarea className="input mt-1 min-h-[70px]" value={form.about_us} onChange={set("about_us")} />
        </div>
        <div>
          <label className="text-sm text-muted">Tell us something interesting about yourself *</label>
          <textarea className="input mt-1 min-h-[90px]" required value={form.about} onChange={set("about")} />
        </div>
        <div>
          <label className="text-sm text-muted">Anything you&apos;ve made? (portfolio / drive / insta link)</label>
          <input className="input mt-1" placeholder="https://…" value={form.portfolio_link} onChange={set("portfolio_link")} />
        </div>
        {error && <p className="text-red text-sm">{error}</p>}
        <button className="btn-gold w-full text-lg" disabled={state === "saving"}>
          {state === "saving" ? "Submitting…" : "Submit Registration"}
        </button>
      </form>
    </main>
  );
}
