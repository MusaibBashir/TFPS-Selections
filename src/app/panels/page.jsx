"use client";
import { useEffect, useState, useCallback } from "react";
import Guard from "@/components/Guard";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

const STATUS_STYLES = {
  open: "text-green border-green/40 bg-green/10",
  interviewing: "text-gold border-gold/40 bg-gold/10",
  paused: "text-yellow border-yellow/40 bg-yellow/10",
  closed: "text-muted border-edge"
};

function PanelsInner() {
  const [panels, setPanels] = useState([]);
  const [seated, setSeated] = useState([]); // panelists rows
  const [members, setMembers] = useState([]);

  const load = useCallback(async () => {
    const [p, s, m] = await Promise.all([
      supabase.from("panels").select("*").order("created_at"),
      supabase.from("panelists").select("*"),
      supabase.from("members").select("*").order("name")
    ]);
    setPanels(p.data || []);
    setSeated(s.data || []);
    setMembers(m.data || []);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("panels-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "panels" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "panelists" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  const seatedRolls = new Set(seated.map((s) => s.member_roll));
  const bench = members.filter((m) => !seatedRolls.has(m.roll_no));

  async function addPanel() {
    await supabase.from("panels").insert({ name: `Panel ${panels.length + 1}` });
    load();
  }
  async function setStatus(id, status) {
    await supabase.from("panels").update({ status }).eq("id", id);
    load();
  }
  async function removePanel(id) {
    if (!confirm("Remove this panel? Its queue entries will be deleted.")) return;
    await supabase.from("panels").delete().eq("id", id);
    load();
  }
  async function seatMember(member, panelId) {
    const { error } = await supabase.from("panelists").insert({
      name: member.name, domains: member.domains, panel_id: panelId, member_roll: member.roll_no
    });
    if (error) alert(error.message);
    load();
  }
  async function unseat(row) {
    await supabase.from("panelists").delete().eq("id", row.id);
    load();
  }

  return (
    <main className="px-4 sm:px-6 py-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="font-display text-3xl sm:text-4xl">Panel Management</h1>
        <button className="btn-gold text-sm" onClick={addPanel}>+ New Panel</button>
      </div>
      {members.length === 0 && (
        <p className="text-yellow text-sm mb-4">
          The members list is empty — <Link href="/members" className="underline">add your team</Link> first, then seat them on panels.
        </p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {panels.map((panel) => {
          const rows = seated.filter((s) => s.panel_id === panel.id);
          const expertise = [...new Set(rows.flatMap((r) => r.domains))];
          return (
            <div key={panel.id} className="card p-5 fade-up">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-display text-xl">{panel.name}</h2>
                <span className={`chip capitalize ${STATUS_STYLES[panel.status]}`}>{panel.status}</span>
              </div>
              <div className="space-y-1.5 mb-3 min-h-[40px]">
                {rows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <span>{r.name} <span className="text-muted text-xs">· {r.domains.join(", ") || "—"}</span></span>
                    <button className="text-muted hover:text-red text-xs" onClick={() => unseat(r)}>remove</button>
                  </div>
                ))}
                {rows.length === 0 && <p className="text-muted text-sm italic">No panelists seated</p>}
              </div>
              <select className="input !py-2 text-sm mb-3" value=""
                onChange={(e) => {
                  const m = bench.find((b) => b.roll_no === e.target.value);
                  if (m) seatMember(m, panel.id);
                }}>
                <option value="">+ Seat a member…</option>
                {bench.map((m) => <option key={m.roll_no} value={m.roll_no}>{m.name} ({m.domains.join(", ") || "—"})</option>)}
              </select>
              {expertise.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {expertise.map((d) => <span key={d} className="chip border-gold/30 text-gold/80 text-[10px]">{d}</span>)}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-edge">
                {["open", "paused", "closed"].map((s) => panel.status !== s && (
                  <button key={s} className="text-xs text-muted hover:text-gold capitalize" onClick={() => setStatus(panel.id, s)}>{s}</button>
                ))}
                <span className="flex-1" />
                <button className="text-xs text-muted hover:text-red" onClick={() => removePanel(panel.id)}>delete panel</button>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="font-display text-2xl mt-10 mb-4">Off-panel members <span className="text-muted text-base">({bench.length})</span></h2>
      <div className="flex flex-wrap gap-2">
        {bench.map((m) => (
          <span key={m.roll_no} className="chip border-edge text-muted">{m.name}</span>
        ))}
        {bench.length === 0 && members.length > 0 && <p className="text-muted text-sm italic">Everyone is seated on a panel.</p>}
      </div>
    </main>
  );
}

export default function Page() {
  return <Guard admin><PanelsInner /></Guard>;
}
