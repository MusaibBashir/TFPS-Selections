"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Guard from "@/components/Guard";
import { supabase, getSession, tagColor, DOMAINS, getFeedbackEditing } from "@/lib/supabase";

function PanelInner() {
  const { id } = useParams();
  const session = getSession();
  const [panel, setPanel] = useState(null);
  const [members, setMembers] = useState([]); // seated panelists
  const [allMembers, setAllMembers] = useState([]); // society members
  const [allSeated, setAllSeated] = useState([]); // panelists across all panels
  const [queue, setQueue] = useState([]);
  const [candidates, setCandidates] = useState({});
  const [current, setCurrent] = useState(null);
  const [interview, setInterview] = useState(null);
  const [reviews, setReviews] = useState({}); // { panelistName: text }
  const [saveState, setSaveState] = useState({}); // { panelistName: "saving"|"saved" }
  const [fin, setFin] = useState({ score: "", tag: "", tasks_assigned: "" });
  const [saving, setSaving] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [past, setPast] = useState([]);
  const [pastCands, setPastCands] = useState({});
  const [openPast, setOpenPast] = useState(null); // interview id
  const [pastFB, setPastFB] = useState({});
  const [pastFin, setPastFin] = useState({ score: "", tag: "", tasks_assigned: "" });
  const [pastSaving, setPastSaving] = useState(false);
  const [fbEditing, setFbEditing] = useState(true);
  const loadedFor = useRef(null);
  const timers = useRef({});
  const dirty = useRef({}); // boxes with unsaved local edits
  const finDirty = useRef(false);
  const finTimer = useRef(null);

  const load = useCallback(async () => {
    const [p, m, q, am, asd] = await Promise.all([
      supabase.from("panels").select("*").eq("id", id).maybeSingle(),
      supabase.from("panelists").select("*").eq("panel_id", id).order("name"),
      supabase.from("queue_entries").select("*").eq("panel_id", id).in("status", ["waiting", "in_interview"]).order("position"),
      supabase.from("members").select("*").order("name"),
      supabase.from("panelists").select("member_roll")
    ]);
    setPanel(p.data); setMembers(m.data || []);
    setAllMembers(am.data || []); setAllSeated(asd.data || []);
    const entries = q.data || [];
    setQueue(entries);
    const active = entries.find((e) => e.status === "in_interview") || null;
    setCurrent(active);
    const rolls = entries.map((e) => e.roll_no);
    if (rolls.length) {
      const { data: cands } = await supabase.from("candidates").select("*").in("roll_no", rolls);
      setCandidates(Object.fromEntries((cands || []).map((c) => [c.roll_no, c])));
    }
    const { data: done } = await supabase.from("interviews").select("*")
      .eq("panel_id", id).not("ended_at", "is", null).order("ended_at", { ascending: false });
    setPast(done || []);
    const doneRolls = [...new Set((done || []).map((x) => x.roll_no))];
    if (doneRolls.length) {
      const { data: dc } = await supabase.from("candidates").select("roll_no,name,domains").in("roll_no", doneRolls);
      setPastCands(Object.fromEntries((dc || []).map((c) => [c.roll_no, c])));
    }
    if (active) {
      const { data: iv } = await supabase.from("interviews").select("*")
        .eq("panel_id", id).eq("roll_no", active.roll_no).is("ended_at", null)
        .order("started_at", { ascending: false }).limit(1).maybeSingle();
      setInterview(iv || null);
      if (iv && loadedFor.current !== iv.id) {
        loadedFor.current = iv.id;
        const { data: fb } = await supabase.from("interview_feedback").select("*").eq("interview_id", iv.id);
        setReviews(Object.fromEntries((fb || []).map((n) => [n.panelist, n.feedback || ""])));
        setSaveState({});
        dirty.current = {};
        finDirty.current = false;
        setFin({ score: iv.score ?? "", tag: iv.tag || "", tasks_assigned: iv.tasks_assigned || "" });
      }
    } else {
      setInterview(null);
      loadedFor.current = null;
    }
  }, [id]);

  useEffect(() => {
    getFeedbackEditing().then(setFbEditing);
    const st = supabase.channel("settings-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => getFeedbackEditing().then(setFbEditing))
      .subscribe();
    return () => supabase.removeChannel(st);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel(`panel-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "panelists" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "interview_feedback" }, (payload) => {
        const row = payload.new;
        if (!row || row.interview_id !== loadedFor.current) return;
        if (dirty.current[row.panelist]) return; // don't clobber a box being typed in here
        setReviews((r) => ({ ...r, [row.panelist]: row.feedback || "" }));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "interviews" }, (payload) => {
        const row = payload.new;
        if (!row || row.id !== loadedFor.current) return;
        if (row.ended_at) { load(); return; } // other laptop finished
        if (finDirty.current) return;
        setFin({ score: row.score ?? "", tag: row.tag || "", tasks_assigned: row.tasks_assigned || "" });
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [id, load]);

  const canManage = session && (session.role === "admin" || members.some((m) => m.member_roll === session.roll_no));

  // ---- seat management (any member of this panel, or admin) ----
  const seatedRolls = new Set(allSeated.map((s) => s.member_roll));
  const bench = allMembers.filter((m) => !seatedRolls.has(m.roll_no));

  async function seatMember(rollNo) {
    const m = bench.find((b) => b.roll_no === rollNo);
    if (!m) return;
    await supabase.from("panelists").insert({ name: m.name, domains: m.domains, panel_id: id, member_roll: m.roll_no });
    load();
  }
  async function unseat(row) {
    await supabase.from("panelists").delete().eq("id", row.id);
    load();
  }
  async function toggleMemberDomain(row, d) {
    const next = row.domains.includes(d) ? row.domains.filter((x) => x !== d) : [...row.domains, d];
    await supabase.from("panelists").update({ domains: next }).eq("id", row.id);
    if (row.member_roll) await supabase.from("members").update({ domains: next }).eq("roll_no", row.member_roll);
    load();
  }

  // ---- review autosave (one laptop, everyone's box on screen) ----
  function setReview(panelist, text) {
    setReviews((r) => ({ ...r, [panelist]: text }));
    setSaveState((s2) => ({ ...s2, [panelist]: "saving" }));
    dirty.current[panelist] = true;
    clearTimeout(timers.current[panelist]);
    timers.current[panelist] = setTimeout(async () => {
      if (!interview) return;
      await supabase.from("interview_feedback").upsert({
        interview_id: interview.id,
        roll_no: interview.roll_no,
        panelist,
        feedback: text || null
      }, { onConflict: "interview_id,panelist" });
      dirty.current[panelist] = false;
      setSaveState((s2) => ({ ...s2, [panelist]: "saved" }));
    }, 800);
  }

  // verdict autosaves too, so both laptops stay in sync
  function setFinSynced(next) {
    setFin(next);
    finDirty.current = true;
    clearTimeout(finTimer.current);
    finTimer.current = setTimeout(async () => {
      if (!interview) return;
      await supabase.from("interviews").update({
        score: next.score === "" ? null : Number(next.score),
        tag: next.tag || null,
        tasks_assigned: next.tasks_assigned || null
      }).eq("id", interview.id);
      finDirty.current = false;
    }, 800);
  }

  async function startInterview(entry) {
    const { error: dup } = await supabase.from("interviews").insert({
      roll_no: entry.roll_no,
      panel_id: id,
      panel_name: panel?.name,
      panelist_names: members.map((m) => m.name)
    });
    if (dup && dup.code !== "23505") { alert(dup.message); return; }
    await supabase.from("queue_entries").update({ status: "in_interview" }).eq("id", entry.id);
    await supabase.from("panels").update({ status: "interviewing" }).eq("id", id);
    await supabase.from("candidates").update({ status: "interviewing" }).eq("roll_no", entry.roll_no);
    load();
  }

  async function openPastInterview(iv) {
    if (openPast === iv.id) { setOpenPast(null); return; }
    const { data: fb } = await supabase.from("interview_feedback").select("*").eq("interview_id", iv.id);
    const map = Object.fromEntries((fb || []).map((n) => [n.panelist, n.feedback || ""]));
    // include current seats + anyone who wrote back then
    members.forEach((m) => { if (!(m.name in map)) map[m.name] = ""; });
    setPastFB(map);
    setPastFin({ score: iv.score ?? "", tag: iv.tag || "", tasks_assigned: iv.tasks_assigned || "" });
    setOpenPast(iv.id);
  }

  async function savePast(iv) {
    setPastSaving(true);
    await supabase.from("interviews").update({
      score: pastFin.score === "" ? null : Number(pastFin.score),
      tag: pastFin.tag || null,
      tasks_assigned: pastFin.tasks_assigned || null
    }).eq("id", iv.id);
    for (const [panelist, text] of Object.entries(pastFB)) {
      if (text === "" ) continue;
      await supabase.from("interview_feedback").upsert({
        interview_id: iv.id, roll_no: iv.roll_no, panelist, feedback: text || null
      }, { onConflict: "interview_id,panelist" });
    }
    setPastSaving(false);
    setOpenPast(null);
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
    await supabase.from("queue_entries").delete().eq("id", current.id);
    await supabase.from("candidates").update({ status: "interviewed" }).eq("roll_no", current.roll_no);
    await supabase.from("panels").update({ status: "open" }).eq("id", id);
    setSaving(false);
    load();
  }

  const cand = current ? candidates[current.roll_no] : null;
  const waiting = queue.filter((e) => e.status === "waiting");

  if (!panel) return <main className="p-10 text-muted">Loading panel…</main>;

  return (
    <main className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h1 className="font-display text-3xl sm:text-4xl">{panel.name}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {members.map((m) => (
          <div key={m.id} className="chip border-edge text-muted gap-2">
            <span className="text-cream">{m.name}</span>
            <span className="text-xs">{m.domains.join(", ") || "—"}</span>
            {canManage && (
              <>
                <button className="text-gold/70 hover:text-gold text-xs" title="Edit domains"
                  onClick={() => setEditingMember(editingMember === m.id ? null : m.id)}>✎</button>
                <button className="text-muted hover:text-red text-xs" title="Remove from panel" onClick={() => unseat(m)}>✕</button>
              </>
            )}
          </div>
        ))}
        {canManage && (
          <select className="bg-panel border border-edge rounded-full text-xs text-muted px-3 py-1.5 outline-none cursor-pointer" value=""
            onChange={(e) => e.target.value && seatMember(e.target.value)}>
            <option value="">+ add member…</option>
            {bench.map((m) => <option key={m.roll_no} value={m.roll_no}>{m.name}</option>)}
          </select>
        )}
        {members.length === 0 && !canManage && <span className="chip border-edge text-muted">no panelists</span>}
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

              {/* one review box per seated panelist */}
              <div className="border-t border-edge mt-5 pt-5">
                <h3 className="font-display text-lg mb-3">Review</h3>
                {members.length === 0 && <p className="text-muted text-sm italic">Seat panel members above to write reviews.</p>}
                <div className="space-y-3">
                  {members.map((m) => (
                    <div key={m.id}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm text-gold">{m.name}</label>
                        <span className="text-muted text-[10px]">
                          {saveState[m.name] === "saving" ? "saving…" : saveState[m.name] === "saved" ? "✓ saved" : ""}
                        </span>
                      </div>
                      <textarea className="input min-h-[70px]" placeholder={`${m.name}'s notes… (autosaves)`}
                        value={reviews[m.name] || ""} onChange={(e) => setReview(m.name, e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* panel verdict */}
              <div className="border-t border-edge mt-5 pt-5 space-y-4">
                <h3 className="font-display text-lg">Panel verdict <span className="text-muted text-sm font-body">(rating &amp; colour optional)</span></h3>
                <input className="input" placeholder="Task assigned by the panel (e.g. Street photo series, 1-min edit…)"
                  value={fin.tasks_assigned} onChange={(e) => setFinSynced({ ...fin, tasks_assigned: e.target.value })} />
                <div className="flex flex-wrap items-center gap-3">
                  <input className="input !w-28" type="number" step="0.5" min="0" max="10" placeholder="Rating /10"
                    value={fin.score} onChange={(e) => setFinSynced({ ...fin, score: e.target.value })} />
                  <div className="flex gap-2">
                    {["green", "yellow", "red"].map((t) => (
                      <button key={t} type="button" onClick={() => setFinSynced({ ...fin, tag: fin.tag === t ? "" : t })}
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

      <h2 className="font-display text-2xl mt-10 mb-4">Past interviews <span className="text-muted text-base">({past.length})</span></h2>
      <div className="space-y-2">
        {past.map((iv) => {
          const c = pastCands[iv.roll_no];
          return (
            <div key={iv.id} className="card">
              <button className="w-full flex items-center gap-3 px-5 py-3 text-left" onClick={() => openPastInterview(iv)}>
                <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0`} style={{ background: iv.tag === "green" ? "#4ade80" : iv.tag === "yellow" ? "#facc15" : iv.tag === "red" ? "#f87171" : "#2b2721" }} />
                <span className="font-medium">{c ? c.name : iv.roll_no}</span>
                <span className="text-muted text-xs">{iv.roll_no}</span>
                <span className="text-muted text-xs hidden sm:inline">{c ? c.domains.join(", ") : ""}</span>
                <span className="flex-1" />
                {iv.score != null && <span className="chip border-edge text-muted text-[10px]">{iv.score}/10</span>}
                <span className="text-muted text-xs">{new Date(iv.ended_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="text-muted">{openPast === iv.id ? "▾" : "▸"}</span>
              </button>
              {openPast === iv.id && (
                <div className="px-5 pb-5 space-y-3 fade-up border-t border-edge pt-4">
                  {!fbEditing && <p className="text-yellow text-xs">Editing is locked by an admin — showing saved reviews read-only.</p>}
                  {Object.entries(pastFB).map(([name, text]) => (
                    <div key={name}>
                      <label className="text-sm text-gold">{name}</label>
                      <textarea className="input min-h-[60px] mt-1" value={text} disabled={!fbEditing}
                        onChange={(e) => setPastFB({ ...pastFB, [name]: e.target.value })} />
                    </div>
                  ))}
                  <input className="input" placeholder="Task assigned" disabled={!fbEditing}
                    value={pastFin.tasks_assigned} onChange={(e) => setPastFin({ ...pastFin, tasks_assigned: e.target.value })} />
                  <div className="flex flex-wrap items-center gap-3">
                    <input className="input !w-28" type="number" step="0.5" min="0" max="10" placeholder="/10" disabled={!fbEditing}
                      value={pastFin.score} onChange={(e) => setPastFin({ ...pastFin, score: e.target.value })} />
                    <div className="flex gap-2">
                      {["green", "yellow", "red"].map((t) => (
                        <button key={t} type="button" disabled={!fbEditing} onClick={() => setPastFin({ ...pastFin, tag: pastFin.tag === t ? "" : t })}
                          className={`chip capitalize ${pastFin.tag === t ? tagColor(t) + " ring-1 ring-current" : "border-edge text-muted"}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <span className="flex-1" />
                    <button className="btn-gold text-sm" onClick={() => savePast(iv)} disabled={pastSaving || !fbEditing}>
                      {pastSaving ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {past.length === 0 && <p className="text-muted text-sm italic">No interviews finished by this panel yet.</p>}
      </div>
    </main>
  );
}

export default function Page() {
  return <Guard><PanelInner /></Guard>;
}
