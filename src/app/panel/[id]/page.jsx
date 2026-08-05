"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Guard from "@/components/Guard";
import { supabase, getSession, tagColor, DOMAINS } from "@/lib/supabase";

function PanelInner() {
  const { id } = useParams();
  const session = getSession();
  const [panel, setPanel] = useState(null);
  const [members, setMembers] = useState([]);
  const [queue, setQueue] = useState([]);
  const [candidates, setCandidates] = useState({});
  const [current, setCurrent] = useState(null); // active queue entry
  const [interview, setInterview] = useState(null); // active interview row
  const [notes, setNotes] = useState([]); // interview_feedback rows
  const [mine, setMine] = useState({ feedback: "", score: "" });
  const [saveState, setSaveState] = useState("");
  const [editingMember, setEditingMember] = useState(null); // panelist row being edited
  const loadedFor = useRef(null);
  const [fin, setFin] = useState({ score: "", tag: "", tasks_assigned: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [p, m, q] = await Promise.all([
      supabase.from("panels").select("*").eq("id", id).maybeSingle(),
      supabase.from("panelists").select("*").eq("panel_id", id),
      supabase.from("queue_entries").select("*").eq("panel_id", id).in("status", ["waiting", "in_interview"]).order("position")
    ]);
    setPanel(p.data); setMembers(m.data || []);
    const entries = q.data || [];
    setQueue(entries);
    const active = entries.find((e) => e.status === "in_interview") || null;
    setCurrent(active);
    const rolls = entries.map((e) => e.roll_no);
    if (rolls.length) {
      const { data: cands } = await supabase.from("candidates").select("*").in("roll_no", rolls);
      setCandidates(Object.fromEntries((cands || []).map((c) => [c.roll_no, c])));
    }
    if (active) {
      const { data: iv } = await supabase.from("interviews").select("*")
        .eq("panel_id", id).eq("roll_no", active.roll_no).is("ended_at", null)
        .order("started_at", { ascending: false }).limit(1).maybeSingle();
      setInterview(iv || null);
      if (iv) {
        const { data: fb } = await supabase.from("interview_feedback").select("*").eq("interview_id", iv.id).order("created_at");
        setNotes(fb || []);
      }
    } else {
      setInterview(null); setNotes([]);
    }
  }, [id]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`panel-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "panelists" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "interview_feedback" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [id, load]);

  const canEditMembers = session && (session.role === "admin" || members.some((m) => m.member_roll === session.roll_no));

  async function toggleMemberDomain(row, d) {
    const next = row.domains.includes(d) ? row.domains.filter((x) => x !== d) : [...row.domains, d];
    await supabase.from("panelists").update({ domains: next }).eq("id", row.id);
    if (row.member_roll) await supabase.from("members").update({ domains: next }).eq("roll_no", row.member_roll);
    load();
  }

  async function startInterview(entry) {
    await supabase.from("interviews").insert({
      roll_no: entry.roll_no,
      panel_id: id,
      panel_name: panel?.name,
      panelist_names: members.map((m) => m.name)
    });
    await supabase.from("queue_entries").update({ status: "in_interview" }).eq("id", entry.id);
    await supabase.from("panels").update({ status: "interviewing" }).eq("id", id);
    await supabase.from("candidates").update({ status: "interviewing" }).eq("roll_no", entry.roll_no);
    setMine({ feedback: "", score: "" });
    setFin({ score: "", tag: "", tasks_assigned: "" });
    load();
  }

  async function finishInterview() {
    if (!current || !interview) return;
    setSaving(true);
    await supabase.from("interviews").update({
      score: fin.score === "" ? null : Number(fin.score),
      tag: fin.tag || null,
      tasks_assigned: fin.tasks_assigned || null,
      panelist_names: members.map((m) => m.name),
      ended_at: new Date().toISOString()
    }).eq("id", interview.id);
    await supabase.from("queue_entries").update({ status: "done" }).eq("id", current.id);
    await supabase.from("candidates").update({ status: "interviewed" }).eq("roll_no", current.roll_no);
    await supabase.from("panels").update({ status: "open" }).eq("id", id);
    setSaving(false);
    load();
  }

  useEffect(() => {
    if (interview && loadedFor.current !== interview.id) {
      loadedFor.current = interview.id;
      const n = notes.find((x) => x.panelist === session?.name);
      setMine(n ? { feedback: n.feedback || "", score: n.score ?? "" } : { feedback: "", score: "" });
      setSaveState("");
    }
    if (!interview) loadedFor.current = null;
  }, [interview, notes, session]);

  // autosave my feedback (debounced)
  useEffect(() => {
    if (!interview || !session || loadedFor.current !== interview.id) return;
    if (mine.feedback === "" && mine.score === "") return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      await supabase.from("interview_feedback").upsert({
        interview_id: interview.id,
        roll_no: interview.roll_no,
        panelist: session.name,
        feedback: mine.feedback || null,
        score: mine.score === "" ? null : Number(mine.score)
      }, { onConflict: "interview_id,panelist" });
      setSaveState("saved");
    }, 800);
    return () => clearTimeout(t);
  }, [mine, interview, session]);

  const cand = current ? candidates[current.roll_no] : null;
  const waiting = queue.filter((e) => e.status === "waiting");

  if (!panel) return <main className="p-10 text-muted">Loading panel…</main>;

  return (
    <main className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h1 className="font-display text-3xl sm:text-4xl">{panel.name}</h1>
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {members.map((m) => (
          <div key={m.id} className="chip border-edge text-muted gap-2">
            <span className="text-cream">{m.name}</span>
            <span className="text-xs">{m.domains.join(", ") || "—"}</span>
            {canEditMembers && (
              <button className="text-gold/70 hover:text-gold text-xs" title="Edit domains"
                onClick={() => setEditingMember(editingMember === m.id ? null : m.id)}>✎</button>
            )}
          </div>
        ))}
        {members.length === 0 && <span className="chip border-edge text-muted">no panelists</span>}
      </div>
      {editingMember && (() => {
        const row = members.find((m) => m.id === editingMember);
        if (!row) return null;
        return (
          <div className="card p-4 mb-6 fade-up">
            <p className="text-sm mb-2">Domains for <span className="text-gold">{row.name}</span> <span className="text-muted text-xs">(saves instantly)</span></p>
            <div className="flex flex-wrap gap-2">
              {DOMAINS.map((d) => (
                <button key={d} type="button" onClick={() => toggleMemberDomain(row, d)}
                  className={`chip ${row.domains.includes(d) ? "border-gold bg-gold/15 text-gold" : "border-edge text-muted"}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div>
          {cand && interview ? (
            <div className="card p-6 fade-up border-gold/40">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-display text-3xl">{cand.name}</h2>
                  <p className="text-muted">{cand.roll_no} · {cand.hall || "—"} {cand.department ? `· ${cand.department}` : ""}</p>
                  <p className="text-muted text-sm">{cand.email} {cand.phone ? `· ${cand.phone}` : ""}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 max-w-[50%]">
                  {cand.domains.map((d) => <span key={d} className="chip border-gold bg-gold/15 text-gold">{d}</span>)}
                </div>
              </div>
              {cand.hobbies && <p className="text-sm text-cream/80 mb-1"><span className="text-muted">Hobbies:</span> {cand.hobbies}</p>}
              {cand.movie_love && <p className="text-sm text-cream/80 mb-1"><span className="text-muted">Loves:</span> {cand.movie_love}</p>}
              {cand.movie_hate && <p className="text-sm text-cream/80 mb-1"><span className="text-muted">Hates:</span> {cand.movie_hate}</p>}
              {cand.about_us && <p className="text-sm text-cream/80 mb-1"><span className="text-muted">On TFPS:</span> {cand.about_us}</p>}
              {cand.about && <p className="text-sm text-cream/80 mb-2"><span className="text-muted">About:</span> {cand.about}</p>}
              {cand.portfolio_link && <a className="text-gold text-sm hover:underline" href={cand.portfolio_link} target="_blank" rel="noreferrer">Portfolio ↗</a>}

              {/* individual feedback */}
              <div className="border-t border-edge mt-5 pt-5">
                <h3 className="font-display text-lg mb-2">Your feedback <span className="text-muted text-sm">({session?.name})</span></h3>
                <textarea className="input min-h-[90px] mb-3" placeholder="Your personal notes on this candidate… (autosaves)"
                  value={mine.feedback} onChange={(e) => setMine({ ...mine, feedback: e.target.value })} />
                <div className="flex items-center gap-3">
                  <input className="input !w-28" type="number" step="0.5" min="0" max="10" placeholder="Your /10"
                    value={mine.score} onChange={(e) => setMine({ ...mine, score: e.target.value })} />
                  <span className="text-muted text-xs">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : "Autosaves as you type"}</span>
                </div>
                {notes.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {notes.map((n) => (
                      <div key={n.id} className="bg-panel rounded-xl p-3 text-sm flex items-start gap-3">
                        <span className="chip border-edge text-muted shrink-0">{n.panelist}</span>
                        {n.score != null && <span className="chip border-gold/40 text-gold shrink-0">{n.score}/10</span>}
                        <p className="text-cream/80">{n.feedback}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* panel verdict */}
              <div className="border-t border-edge mt-5 pt-5 space-y-4">
                <h3 className="font-display text-lg">Panel verdict <span className="text-muted text-sm font-body">(all optional — just hit Finish when done)</span></h3>
                <input className="input" placeholder="Task assigned (e.g. Street photo series, 1-min edit…)"
                  value={fin.tasks_assigned} onChange={(e) => setFin({ ...fin, tasks_assigned: e.target.value })} />
                <div className="flex flex-wrap items-center gap-3">
                  <input className="input !w-28" type="number" step="0.5" min="0" max="10" placeholder="Panel /10"
                    value={fin.score} onChange={(e) => setFin({ ...fin, score: e.target.value })} />
                  <div className="flex gap-2">
                    {["green", "yellow", "red"].map((t) => (
                      <button key={t} type="button" onClick={() => setFin({ ...fin, tag: fin.tag === t ? "" : t })}
                        className={`chip capitalize ${fin.tag === t ? tagColor(t) + " ring-1 ring-current" : "border-edge text-muted"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <span className="flex-1" />
                  <button className="btn-gold" onClick={finishInterview} disabled={saving}>
                    {saving ? "Saving…" : "Finish Interview"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-10 text-center text-muted fade-up">
              <p className="text-4xl mb-3">🎥</p>
              <p>No interview in progress.</p>
              <p className="text-sm">Call the next candidate from the queue →</p>
            </div>
          )}
        </div>

        <div>
          <h2 className="font-display text-xl mb-3">Queue <span className="text-muted text-sm">({waiting.length} waiting)</span></h2>
          <div className="space-y-2">
            {waiting.map((entry, i) => {
              const c = candidates[entry.roll_no];
              return (
                <div key={entry.id} className="card px-4 py-3 flex items-center gap-3">
                  <span className="text-muted text-sm">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c ? c.name : entry.roll_no}</p>
                    <p className="text-muted text-xs truncate">{c ? c.domains.join(", ") : ""}</p>
                  </div>
                  <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => startInterview(entry)} disabled={!!current}>
                    Call in
                  </button>
                </div>
              );
            })}
            {waiting.length === 0 && <p className="text-muted text-sm italic">Queue is empty.</p>}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return <Guard><PanelInner /></Guard>;
}
