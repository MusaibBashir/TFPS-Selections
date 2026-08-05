"use client";
import { useEffect, useState, useCallback } from "react";
import Guard from "@/components/Guard";
import { supabase, DOMAINS } from "@/lib/supabase";

function MembersInner() {
  const [members, setMembers] = useState([]);
  const [draft, setDraft] = useState({ roll_no: "", name: "", domains: [] });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("members").select("*").order("name");
    setMembers(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setError("");
    if (!draft.roll_no.trim() || !draft.name.trim()) return setError("Roll number and name required.");
    const { error: err } = await supabase.from("members").insert({
      ...draft, roll_no: draft.roll_no.trim().toUpperCase(), name: draft.name.trim()
    });
    if (err) return setError(err.code === "23505" ? "That roll number is already a member." : err.message);
    setDraft({ roll_no: "", name: "", domains: [] });
    load();
  }

  async function toggleAdmin(m) {
    await supabase.from("members").update({ is_admin: !m.is_admin }).eq("roll_no", m.roll_no);
    load();
  }

  async function remove(roll_no) {
    if (!confirm(`Remove ${roll_no} from the members list?`)) return;
    await supabase.from("members").delete().eq("roll_no", roll_no);
    load();
  }

  return (
    <main className="px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      <h1 className="font-display text-3xl sm:text-4xl mb-2">Members</h1>
      <p className="text-muted mb-6">Only these roll numbers can log in as panelist or admin.</p>

      <form onSubmit={add} className="card p-5 mb-8 space-y-3 fade-up">
        <div className="grid sm:grid-cols-2 gap-3">
          <input className="input" placeholder="Roll number" value={draft.roll_no} onChange={(e) => setDraft({ ...draft, roll_no: e.target.value })} />
          <input className="input" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-2">
          {DOMAINS.map((d) => (
            <button key={d} type="button"
              onClick={() => setDraft((s) => ({ ...s, domains: s.domains.includes(d) ? s.domains.filter((x) => x !== d) : [...s.domains, d] }))}
              className={`chip ${draft.domains.includes(d) ? "border-gold bg-gold/15 text-gold" : "border-edge text-muted"}`}>
              {d}
            </button>
          ))}
        </div>
        {error && <p className="text-red text-sm">{error}</p>}
        <button className="btn-gold text-sm">Add member</button>
      </form>

      <div className="card divide-y divide-edge/50">
        {members.map((m) => (
          <div key={m.roll_no} className="flex items-center gap-3 px-5 py-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium">{m.name} <span className="text-muted text-sm">· {m.roll_no}</span>
                {m.is_admin && <span className="chip border-gold/40 text-gold ml-2 text-[10px]">admin</span>}
              </p>
              <p className="text-muted text-xs">{m.domains.join(", ") || "no domains set"}</p>
            </div>
            <button className="text-muted hover:text-gold text-sm" onClick={() => toggleAdmin(m)}>
              {m.is_admin ? "Demote" : "Make admin"}
            </button>
            <button className="text-muted hover:text-red text-sm" onClick={() => remove(m.roll_no)}>Remove</button>
          </div>
        ))}
        {members.length === 0 && <p className="px-5 py-8 text-muted italic text-center">No members yet — add the team above.</p>}
      </div>
    </main>
  );
}

export default function Page() {
  return <Guard admin><MembersInner /></Guard>;
}
