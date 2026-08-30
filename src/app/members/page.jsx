"use client";
import { useEffect, useState, useCallback } from "react";
import Guard from "@/components/Guard";
import { supabase, DOMAINS, getLocks, setLock, getMode, setMode } from "@/lib/supabase";

function fmtDur(ms) {
  if (!ms) return "—";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function Collapsible({ title, count, open, onToggle, children }) {
  return (
    <div className="card mb-4 overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-panel/60 transition-colors">
        <span className="font-display text-xl flex-1">
          {title} {count != null && <span className="text-muted text-base">({count})</span>}
        </span>
        <span className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && <div className="overflow-x-auto border-t border-edge">{children}</div>}
    </div>
  );
}

function MembersInner() {
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState({});
  const [reviewStats, setReviewStats] = useState({});
  const [showIv, setShowIv] = useState(false);
  const [showRv, setShowRv] = useState(false);
  const [search, setSearch] = useState("");
  const [locks, setLocks] = useState({ interview: true, task: true });
  const [mode, setModeState] = useState("interview"); // interview | task
  const [draft, setDraft] = useState({ roll_no: "", name: "", email: "", domains: [] });
  const [editing, setEditing] = useState(null); // roll_no being edited
  const [edit, setEdit] = useState({ email: "", domains: [] });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [{ data }, { data: ivs }, { data: evs }] = await Promise.all([
      supabase.from("members").select("*").order("name"),
      supabase.from("interviews").select("panelist_names,started_at,ended_at").not("ended_at", "is", null),
      supabase.from("evaluations").select("evaluator,score")
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

    // who reviewed how many task submissions, and how they scored
    const rv = {};
    (evs || []).forEach((e) => {
      const who = e.evaluator;
      if (!who) return;
      if (!rv[who]) rv[who] = { count: 0, scored: 0, total: 0 };
      rv[who].count += 1;
      if (e.score != null) { rv[who].scored += 1; rv[who].total += Number(e.score); }
    });
    setReviewStats(rv);
  }, []);
  useEffect(() => { load(); getLocks().then(setLocks); getMode().then(setModeState); }, [load]);

  async function toggleMode() {
    const next = mode === "task" ? "interview" : "task";
    setModeState(next);          // optimistic; header picks it up over realtime
    await setMode(next);
  }

  async function toggleLock(which) {
    const key = which === "interview" ? "panel_feedback_editing" : "task_review_editing";
    const next = !locks[which];
    setLocks((l) => ({ ...l, [which]: next }));
    await setLock(key, next);
  }

  async function add(e) {
    e.preventDefault();
    setError("");
    if (!draft.roll_no.trim() || !draft.name.trim() || !draft.email.trim()) return setError("Roll number, name and email are all required.");
    const name = draft.name.trim();
    const email = draft.email.trim().toLowerCase();
    // block duplicates by name or email (old imports may exist under a different username)
    const dupe = members.find((m) =>
      m.name.trim().toLowerCase() === name.toLowerCase() ||
      (m.email && m.email.toLowerCase() === email)
    );
    if (dupe) return setError(`Already exists as "${dupe.name}" (${dupe.roll_no}) — edit that entry instead of adding a new one.`);
    const { error: err } = await supabase.from("members").insert({
      roll_no: draft.roll_no.trim().toUpperCase(), name, email, domains: draft.domains
    });
    if (err) return setError(err.code === "23505" ? "That roll number is already a member." : err.message);
    setDraft({ roll_no: "", name: "", email: "", domains: [] });
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

  const q = search.trim().toLowerCase();
  const shown = q
    ? members.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        m.roll_no.toLowerCase().includes(q) ||
        (m.email || "").toLowerCase().includes(q) ||
        m.domains.some((d) => d.toLowerCase().includes(q))
      )
    : members;

  return (
    <main className="px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      <h1 className="font-display text-3xl sm:text-4xl mb-2">Members</h1>
      <p className="text-muted mb-4">Only these roll numbers can log in as panelist or admin.</p>

      <div className="card p-5 mb-6 space-y-3">
        <p className="font-display text-lg">Selection phase</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[220px]">
            <p className="font-medium">{mode === "task" ? "Task review mode" : "Interview mode"}</p>
            <p className="text-muted text-xs">
              {mode === "task"
                ? "Header shows task submissions and how many have been reviewed."
                : "Header shows interviews done today and total interviews."}
            </p>
          </div>
          <button onClick={toggleMode}
            className={`btn !py-2 ${mode === "task"
              ? "bg-gold/15 text-gold border border-gold/40"
              : "bg-cream/10 text-cream border border-edge"}`}>
            {mode === "task" ? "◆ Task review" : "● Interview"}
          </button>
        </div>
        <p className="text-muted text-xs">Switches the counters in the top bar for everyone. Applies instantly.</p>
      </div>

      <div className="card p-5 mb-6 space-y-4">
        <p className="font-display text-lg">Editing locks</p>
        {[
          { key: "interview", title: "Interview reviews", desc: "Panel reviews, ratings, colours and assigned tasks in the panel workspace." },
          { key: "task", title: "Task reviews", desc: "Task scores and feedback on the Review Board, plus final colour tags." }
        ].map((row) => (
          <div key={row.key} className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px]">
              <p className="font-medium">{row.title}</p>
              <p className="text-muted text-xs">{row.desc}</p>
            </div>
            <button onClick={() => toggleLock(row.key)}
              className={`btn !py-2 ${locks[row.key] ? "bg-green/15 text-green border border-green/40" : "bg-red/15 text-red border border-red/40"}`}>
              {locks[row.key] ? "● Unlocked" : "■ Locked"}
            </button>
          </div>
        ))}
        <p className="text-muted text-xs">Locking makes that section read-only for everyone, admins included. Applies instantly.</p>
      </div>

      <Collapsible title="Interview stats" count={Object.keys(stats).length}
        open={showIv} onToggle={() => setShowIv((v) => !v)}>
        {Object.keys(stats).length === 0 ? (
          <p className="px-5 py-6 text-muted italic text-sm">No completed interviews yet.</p>
        ) : (
          <table className="w-full text-sm">
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
        )}
      </Collapsible>

      <Collapsible title="Task review stats" count={Object.keys(reviewStats).length}
        open={showRv} onToggle={() => setShowRv((v) => !v)}>
        {Object.keys(reviewStats).length === 0 ? (
          <p className="px-5 py-6 text-muted italic text-sm">No task reviews submitted yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs uppercase tracking-wider border-b border-edge">
                {["Member", "Reviews done", "With a score", "Avg score given"].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(reviewStats).sort((a, b) => b[1].count - a[1].count).map(([name, rv]) => (
                <tr key={name} className="border-b border-edge/50">
                  <td className="px-5 py-2.5 font-medium">{name}</td>
                  <td className="px-5 py-2.5">{rv.count}</td>
                  <td className="px-5 py-2.5 text-muted">{rv.scored}</td>
                  <td className="px-5 py-2.5 text-muted">
                    {rv.scored ? (rv.total / rv.scored).toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Collapsible>
      <div className="mb-8" />

      <form onSubmit={add} className="card p-5 mb-8 space-y-3 fade-up">
        <div className="grid sm:grid-cols-3 gap-3">
          <input className="input" placeholder="Roll number" value={draft.roll_no} onChange={(e) => setDraft({ ...draft, roll_no: e.target.value })} />
          <input className="input" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="input" type="email" placeholder="Email (for OTP login)" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
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

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          className="input flex-1 min-w-[14rem]"
          placeholder="Search members by name, roll, email or domain…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-muted text-sm">
          {shown.length}{shown.length !== members.length ? ` of ${members.length}` : ""} members
        </span>
      </div>

      <div className="card divide-y divide-edge/50">
        {shown.map((m) => (
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
        {members.length > 0 && shown.length === 0 && (
          <p className="px-5 py-8 text-muted italic text-center">No member matches “{search}”.</p>
        )}
      </div>
    </main>
  );
}

export default function Page() {
  return <Guard admin><MembersInner /></Guard>;
}
