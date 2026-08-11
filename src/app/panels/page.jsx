"use client";
import { useEffect, useState, useCallback } from "react";
import Guard from "@/components/Guard";
import Combobox from "@/components/Combobox";
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
  const [benchFilter, setBenchFilter] = useState("");
  const [benchOpen, setBenchOpen] = useState(false);

  const load = useCallback(async () => {
    const [p, s, m] = await Promise.all([
      supabase.from("panels").select("*").order("created_at"),
      supabase.from("panelists").select("*"),
      supabase.from("members").select("*").order("name")
    ]);
    setPanels((p.data || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
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

  // Only a seat on a panel that still exists counts as "seated". A panelist row
  // whose panel is gone must not keep its member out of the off-panel list.
  const panelIds = new Set(panels.map((p) => p.id));
  const liveSeats = seated.filter((s) => s.panel_id && panelIds.has(s.panel_id));
  const seatedRolls = new Set(liveSeats.map((s) => s.member_roll));
  const bench = members.filter((m) => !seatedRolls.has(m.roll_no));

  // options for the seat-a-member picker
  const benchOptions = bench.map((m) => ({
    value: m.roll_no,
    label: m.name,
    hint: m.domains.join(", ") || "—"
  }));

  // the off-panel roster is long, so it gets its own filter box
  const benchQuery = benchFilter.trim().toLowerCase();
  const benchShown = benchQuery
    ? bench.filter(
        (m) =>
          m.name.toLowerCase().includes(benchQuery) ||
          m.roll_no.toLowerCase().includes(benchQuery) ||
          m.domains.some((d) => d.toLowerCase().includes(benchQuery))
      )
    : bench;

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
              <div className="mb-3">
                <Combobox
                  placeholder="+ Seat a member…"
                  emptyText="No off-panel member matches"
                  options={benchOptions}
                  onSelect={(roll) => {
                    const m = bench.find((b) => b.roll_no === roll);
                    if (m) seatMember(m, panel.id);
                  }}
                />
              </div>
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

      <div className="mt-10 mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl">
          Off-panel members <span className="text-muted text-base">({bench.length})</span>
        </h2>
        <input
          className="input !w-auto !py-1.5 flex-1 min-w-[12rem] max-w-xs text-sm"
          placeholder="Filter by name, roll or domain…"
          value={benchFilter}
          onChange={(e) => setBenchFilter(e.target.value)}
        />
        {bench.length > 0 && (
          <button
            className="text-xs text-muted hover:text-gold"
            onClick={() => setBenchOpen((v) => !v)}
          >
            {benchOpen ? "hide list" : "show all"}
          </button>
        )}
      </div>

      {(benchOpen || benchQuery) && (
        <div className="flex flex-wrap gap-2">
          {benchShown.slice(0, 80).map((m) => (
            <span
              key={m.roll_no}
              title={`${m.roll_no} · ${m.domains.join(", ") || "no domains"}`}
              className="chip border-edge text-muted"
            >
              {m.name}
            </span>
          ))}
          {benchShown.length > 80 && (
            <span className="chip border-edge text-muted italic">
              +{benchShown.length - 80} more — keep typing
            </span>
          )}
          {benchShown.length === 0 && (
            <p className="text-muted text-sm italic">No off-panel member matches “{benchFilter}”.</p>
          )}
        </div>
      )}

      {!benchOpen && !benchQuery && bench.length > 0 && (
        <p className="text-muted text-sm italic">
          {bench.length} members are not seated on any panel — search above, or “show all”.
        </p>
      )}

      {bench.length === 0 && members.length > 0 && (
        <p className="text-muted text-sm italic">Everyone is seated on a panel.</p>
      )}
    </main>
  );
}

export default function Page() {
  return <Guard admin><PanelsInner /></Guard>;
}
