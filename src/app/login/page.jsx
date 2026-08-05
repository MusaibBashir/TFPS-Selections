"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, setSession } from "@/lib/supabase";

export default function Login() {
  const [rollNo, setRollNo] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const router = useRouter();

  async function login(e) {
    e.preventDefault();
    setState("checking"); setError("");

    const roll = rollNo.trim().toUpperCase();
    const { data: member } = await supabase.from("members").select("*").eq("roll_no", roll).maybeSingle();
    if (!member) {
      setState("idle");
      return setError("Your roll number isn't in the TFPS members list. Ask an admin to add you.");
    }

    const role = member.is_admin ? "admin" : "panelist";
    const { data: pwOk, error: pwErr } = await supabase.rpc("check_password", { p_role: role, p_password: password });
    if (pwErr || !pwOk) {
      setState("idle");
      return setError(pwErr ? pwErr.message : "Wrong password.");
    }

    setSession({ role, name: member.name, roll_no: member.roll_no });
    router.push(role === "admin" ? "/panels" : "/distribute");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm fade-up">
        <Link href="/" className="text-muted text-sm hover:text-gold">&larr; Home</Link>
        <h1 className="font-display text-4xl mt-4 mb-6">Crew Login</h1>
        <form onSubmit={login} className="card p-6 space-y-4">
          <input className="input" placeholder="Your roll number / username" value={rollNo} onChange={(e) => setRollNo(e.target.value)} />
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-red text-sm">{error}</p>}
          <button className="btn-gold w-full" disabled={state === "checking"}>{state === "checking" ? "Checking…" : "Enter"}</button>
          <p className="text-muted text-xs">Members only. Admins use the admin password, everyone else the panelist password.</p>
        </form>
      </div>
    </main>
  );
}
