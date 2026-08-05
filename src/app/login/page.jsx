"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, setSession } from "@/lib/supabase";

function maskEmail(e) {
  const [u, d] = e.split("@");
  return (u.length <= 3 ? u[0] + "**" : u.slice(0, 2) + "***" + u.slice(-1)) + "@" + d;
}

export default function Login() {
  const [step, setStep] = useState("roll"); // roll | otp | password
  const [rollNo, setRollNo] = useState("");
  const [member, setMember] = useState(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  function finish(m) {
    setSession({ role: m.is_admin ? "admin" : "panelist", name: m.name, roll_no: m.roll_no });
    router.push(m.is_admin ? "/panels" : "/distribute");
  }

  async function lookup(e) {
    e.preventDefault();
    setBusy(true); setError("");
    const roll = rollNo.trim().toUpperCase();
    const { data: m } = await supabase.from("members").select("*").eq("roll_no", roll).maybeSingle();
    setBusy(false);
    if (!m) return setError("Your roll number isn't in the TFPS members list. Ask an admin to add you.");
    setMember(m);
    if (m.email) {
      setBusy(true);
      const { error: err } = await supabase.auth.signInWithOtp({ email: m.email });
      setBusy(false);
      if (err) { setError(err.message + " — use password instead."); setStep("password"); return; }
      setStep("otp");
    } else {
      setError("No email on file for you — logging in with the shared password. Ask an admin to add your email for OTP login.");
      setStep("password");
    }
  }

  async function verifyCode(e) {
    e.preventDefault();
    setBusy(true); setError("");
    const { error: err } = await supabase.auth.verifyOtp({ email: member.email, token: code.trim(), type: "email" });
    setBusy(false);
    if (err) return setError("Wrong or expired code. Try again or use the password.");
    await supabase.auth.signOut();
    finish(member);
  }

  async function verifyPassword(e) {
    e.preventDefault();
    setBusy(true); setError("");
    const role = member.is_admin ? "admin" : "panelist";
    const { data: ok, error: err } = await supabase.rpc("check_password", { p_role: role, p_password: password });
    setBusy(false);
    if (err || !ok) return setError(err ? err.message : "Wrong password.");
    finish(member);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm fade-up">
        <Link href="/" className="text-muted text-sm hover:text-gold">&larr; Home</Link>
        <h1 className="font-display text-4xl mt-4 mb-6">Crew Login</h1>

        {step === "roll" && (
          <form onSubmit={lookup} className="card p-6 space-y-4">
            <input className="input" placeholder="Your roll number / username" value={rollNo} onChange={(e) => setRollNo(e.target.value)} />
            {error && <p className="text-red text-sm">{error}</p>}
            <button className="btn-gold w-full" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
            <p className="text-muted text-xs">Members only. We&apos;ll email you a one-time code.</p>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyCode} className="card p-6 space-y-4">
            <p className="text-sm">Hey <span className="text-gold">{member.name}</span> — we sent a code to <span className="text-cream">{maskEmail(member.email)}</span>.</p>
            <input className="input text-center text-2xl tracking-[0.35em]" inputMode="numeric" maxLength={10} placeholder="••••••••" value={code} onChange={(e) => setCode(e.target.value)} />
            {error && <p className="text-red text-sm">{error}</p>}
            <button className="btn-gold w-full" disabled={busy || code.trim().length < 6}>{busy ? "Verifying…" : "Verify"}</button>
            <button type="button" className="text-muted text-xs hover:text-gold w-full" onClick={() => { setStep("password"); setError(""); }}>
              Use shared password instead
            </button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={verifyPassword} className="card p-6 space-y-4">
            <p className="text-sm">Logging in as <span className="text-gold">{member?.name}</span></p>
            <input className="input" type="password" placeholder={member?.is_admin ? "Admin password" : "Panelist password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="text-yellow text-sm">{error}</p>}
            <button className="btn-gold w-full" disabled={busy}>{busy ? "Checking…" : "Enter"}</button>
            {member?.email && (
              <button type="button" className="text-muted text-xs hover:text-gold w-full" onClick={() => { setStep("roll"); setError(""); }}>
                Back — try email code
              </button>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
