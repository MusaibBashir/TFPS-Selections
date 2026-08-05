"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import Guard from "@/components/Guard";
import { supabase } from "@/lib/supabase";

function DistributeInner() {
  const [roll, setRoll] = useState("");
  const [candidate, setCandidate] = useState(null);
  const [panels, setPanels] = useState([]);
  const [panelists, setPanelists] = useState([]);
  const [queue, setQueue] = useState([]);
  const [candidates, setCandidates] = useState({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [p, m, q] = await Promise.all([
      supabase.from("panels").select("*").order("created_at"),
      supabase.from("panelists").select("*"),
      supabase.from("queue_entries").select("*").in("status", ["waiting", "in_interview"]).order("position")
    ]);
    setPanels(p.data || []);
    setPanelists(m.data || []);
    const entries = q.data || [];
    setQueue(entries);
    const rolls = [...new Set(entries.map((e) => e.roll_no))];
    if (rolls.length) {
      const { data: cands } = await supabase.from("candidates").select("roll_no,name,domains").in("roll_no", rolls);
      setCandidates(Object.fromEntries((cands || []).map((c) => [c.roll_no, c])));
    }
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("distribute")
      .on("postgres_changes", { event: "*", schema: "public", table: "panels" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "panelists" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_entries" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  async function lookup(e) {
    e.preventDefault();
    setError(""); setCandidate(null);
    const r = roll.trim().toUpperCase();
    if (!r) return;
    const { data } = await supabase.from("candidates").select("*").eq("roll_no", r).maybeSingle();
    if (!data) return setError("Candidate not found. Ask them to register first.");
    setCandidate(data);
  }

  // rank open panels by domain overlap with candidate
  const ranked = useMemo(() => {
    const active = panels.filter((p) => p.status !== "closed");
    return active.map((p) => {
      const members = panelists.filter((m) => m.panel_id === p.id);
      const expertise = [...new Set(members.flatMap((m) => m.domains))];
      const waiting = queue.filter((q) => q.panel_id === p.id && q.status === "waiting").length;
      const busy = queue.some((q) => q.panel_id === p.id && q.status === "in_interview");
      const match = candidate ? expertise.filter((d) => candidate.domains.includes(d)).length : 0;
      return { ...p, members, expertise, waiting, busy, match };
    }).sort((a, b) => b.match - a.match || a.waiting - b.waiting);
  }, [panels, panelists, queue, candidate]);

  async function assignTo(panelId) {
    const maxPos = Math.max(0, ...queue.filter((q) => q.panel_id === panelId).map((q) => q.position));
    const { error: err } = await supabase.from("queue_entries").insert({
      roll_no: candidate.roll_no, panel_id: panelId, position: maxPos + 1
    });
    if (err) return setError(err.code === "23505" ? "Already in that panel's queue." : err.message);
    await supabase.from("candidates").update({ status: "queued" }).eq("roll_no", candidate.roll_no);
    setCandidate(null); setRoll("");
  }

  async function shift(entry, toPanelId) {
    await supabase.from("queue_entries").update({ panel_id: toPanelId }).eq("id", entry.id);
  }
  async function dequeue(entry) {
    await supabase.from("queue_entries").delete().eq("id", entry.id);
  }

  return (
    <main className="px-4 sm:px-6 py-8 max-w-6xl mx-auto">
      <h1 className="font-display text-3xl sm:text-4xl mb-6">Distributor</h1>

      <form onSubmit={lookup} className="flex gap-3 mb-4 max-w-md">
        <input className="input" placeholder="Enter roll number…" value={roll} onChange={(e) => setRoll(e.target.value)} />
        <button className="btn-gold whitespace-nowrap">Find</button>
      </form>
      {error && <p className="text-red text-sm mb-4">{error}</p>}

      {candidate && (
        <div className="card p-5 mb-6 fade-up border-gold/40">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <h2 className="font-display text-2xl">{candidate.name} <span className="text-muted text-base">· {candidate.roll_no}</span></h2>
              <p className="text-muted text-sm">{candidate.hall || "—"} {candidate.department ? `· ${candidate.department}` : ""}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {candidate.domains.map((d) => <span key={d} className="chip border-gold bg-gold/15 text-gold">{d}</span>)}
            </div>
          </div>
          <p className="text-muted text-xs mt-3">Panels below are ranked by domain match — tap one to queue.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ranked.map((p) => {
          const pq = queue.filter((q) => q.panel_id === p.id).sort((a, b) => a.position - b.position);
          return (
            <div key={p.id} className={`card p-5 fade-up ${candidate && p.match > 0 ? "border-gold/60 shadow-[0_0_24px_rgba(230,180,90,0.08)]" : ""}`}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-display text-xl">{p.name}</h3>
                <span className={`chip capitalize ${p.busy ? "text-gold border-gold/40 bg-gold/10" : p.status === "open" ? "text-green border-green/40 bg-green/10" : "text-yellow border-yellow/40 bg-yellow/10"}`}>
                  {p.busy ? "in interview" : p.status}
                </span>
              </div>
              <p className="text-muted text-xs mb-2">{p.members.map((m) => m.name).join(", ") || "no panelists"}</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {p.expertise.map((d) => (
                  <span key={d} className={`chip text-[10px] ${candidate && candidate.domains.includes(d) ? "border-gold bg-gold/20 text-gold" : "border-edge text-muted"}`}>{d}</span>
                ))}
              </div>
              {candidate && (
                <button className="btn-gold w-full text-sm mb-3" onClick={() => assignTo(p.id)}>
                  Queue here {p.match > 0 && `· ${p.match} domain match`}
                </button>
              )}
              <div className="space-y-1.5">
                {pq.map((entry, i) => {
                  const c = candidates[entry.roll_no];
                  return (
                    <div key={entry.id} className={`flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 ${entry.status === "in_interview" ? "bg-gold/10 text-gold" : "bg-panel"}`}>
                      <span className="text-muted text-xs w-4">{entry.status === "in_interview" ? "▶" : i}</span>
                      <span className="flex-1 truncate">{c ? c.name : entry.roll_no}</span>
                      <select className="bg-transparent text-muted text-xs outline-none cursor-pointer" value=""
                        onChange={(e) => e.target.value && shift(entry, e.target.value)} title="Shift to another panel">
                        <option value="">⇄</option>
                        {ranked.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                      <button className="text-muted hover:text-red text-xs" onClick={() => dequeue(entry)}>✕</button>
                    </div>
                  );
                })}
                {pq.length === 0 && <p className="text-muted text-xs italic">Queue empty</p>}
              </div>
              <Link href={`/panel/${p.id}`} className="block text-center text-gold/80 hover:text-gold text-xs mt-3">Open workspace →</Link>
            </div>
          );
        })}
      </div>
      {ranked.length === 0 && <p className="text-muted italic">No active panels. Ask an admin to create panels.</p>}
    </main>
  );
}

export default function Page() {
  return <Guard><DistributeInner /></Guard>;
}
