"use client";
import { useEffect, useState, useCallback } from "react";
import Guard from "@/components/Guard";
import { supabase, DOMAINS } from "@/lib/supabase";

function fmtDur(ms) {
  if (!ms) return "—";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function MembersInner() {
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState({});
  const [draft, setDraft] = useState({ roll_no: "", name: "", domains: [] });
  const [editing, setEditing] = useState(null); // roll_no being edited
  const [edit, setEdit] = useState({ email: "", domains: [] });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [{ data }, { data: ivs }] = await Promise.all([
      supabase.from("members").select("*").order("name"),
      supabase.from("interviews").select("panelist_names,started_at,ended_at").not("ended_at", "is", null)
    ]);
    setMembers(data || []);
    const st = {};
    (ivs || []).forEach((iv) => {
      const dur = new Date(iv.ended_at) - new Date(iv.started_at);
      if (dur <= 0 || dur > 4 * 3600 * 1000) return; // ignore glitches
      (iv.panelist_names || []).forEach((n) => {
        if (!st[n]) st[n] = { count: 0, total: 0 };
        st[n].count += 1;
        st[n].total += dur;
      });
    });
    setStats(st);
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

  async function saveEdit(roll_no) {
    await supabase.from("members").update({ email: edit.email.trim() || null, domains: edit.domains }).eq("roll_no", roll_no);
    await supabase.from("panelists").update({ domains: edit.domains }).eq("member_roll", roll_no);
    setEditing(null);
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

      {Object.keys(stats).length > 0 && (
        <div className="card overflow-x-auto mb-8">
          <p className="px-5 pt-4 font-display text-xl">Selection stats</p>
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="text-muted text-xs uppercase tracking-wider border-b border-edge">
                {["Member", "Interviews taken", "Time spent", "Avg interview"].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats).sort((a, b) => b[1].count - a[1].count).map(([name, st]) => (
                <tr key={name} className="border-b border-edge/50">
                  <td className="px-5 py-2.5 font-medium">{name}</td>
                  <td className="px-5 py-2.5">{st.count}</td>
                  <td className="px-5 py-2.5 text-muted">{fmtDur(st.total)}</td>
                  <td className="px-5 py-2.5 text-muted">{fmtDur(st.total / st.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
          <div key={m.roll_no} className="px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{m.name} <span className="text-muted text-sm">· {m.roll_no}</span>
                  {m.is_admin && <span className="chip border-gold/40 text-gold ml-2 text-[10px]">admin</span>}
                </p>
                <p className="text-muted text-xs">{m.domains.join(", ") || "no domains set"} {m.email ? `· ${m.email}` : "· no email (OTP login unavailable)"}</p>
              </div>
              <button className="text-muted hover:text-gold text-sm"
                onClick={() => { setEditing(editing === m.roll_no ? null : m.roll_no); setEdit({ email: m.email || "", domains: m.domains }); }}>
                {editing === m.roll_no ? "Close" : "Edit"}
              </button>
              <button className="text-muted hover:text-gold text-sm" onClick={() => toggleAdmin(m)}>
                {m.is_admin ? "Demote" : "Make admin"}
              </button>
              <button className="text-muted hover:text-red text-sm" onClick={() => remove(m.roll_no)}>Remove</button>
            </div>
            {editing === m.roll_no && (
              <div className="mt-3 space-y-3 fade-up">
                <input className="input" type="email" placeholder="Email for OTP login" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
                <div className="flex flex-wrap gap-2">
                  {DOMAINS.map((d) => (
                    <button key={d} type="button"
                      onClick={() => setEdit((s2) => ({ ...s2, domains: s2.domains.includes(d) ? s2.domains.filter((x) => x !== d) : [...s2.domains, d] }))}
                      className={`chip ${edit.domains.includes(d) ? "border-gold bg-gold/15 text-gold" : "border-edge text-muted"}`}>
                      {d}
                    </button>
                  ))}
                </div>
                <button className="btn-gold text-sm" onClick={() => saveEdit(m.roll_no)}>Save</button>
              </div>
            )}
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
