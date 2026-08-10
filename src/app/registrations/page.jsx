"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import Guard from "@/components/Guard";
import { supabase, DOMAINS } from "@/lib/supabase";
import SlotPicker from "@/components/SlotPicker";

function RegistrationsInner() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [filterDomain, setFilterDomain] = useState("");
  const [mailState, setMailState] = useState("");
  const [showAuto, setShowAuto] = useState(false);
  const [auto, setAuto] = useState({ from: "2026-08-10", to: "2026-08-15", start: "18:30", end: "22:00", perSlot: 8 });
  const [autoState, setAutoState] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("candidates").select("*").order("created_at", { ascending: false });
    setRows(data || []);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("regs-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "candidates" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (filterDomain && !r.domains.includes(filterDomain)) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.roll_no.toLowerCase().includes(q) || (r.hall || "").toLowerCase().includes(q);
    }
    return true;
  }), [rows, search, filterDomain]);

  async function toggleEmailed(r) {
    await supabase.from("candidates").update({ slot_emailed_at: r.slot_emailed_at ? null : new Date().toISOString() }).eq("roll_no", r.roll_no);
    load();
  }

  async function setSlot(roll_no, slot) {
    await supabase.from("candidates").update({ slot, slot_emailed_at: null }).eq("roll_no", roll_no);
    load();
  }

  async function autoAssign() {
    setAutoState("working");
    // build all slot times in the window
    const [sh, sm] = auto.start.split(":").map(Number);
    const [eh, em] = auto.end.split(":").map(Number);
    const slots = [];
    for (let d = new Date(auto.from + "T00:00:00"); d <= new Date(auto.to + "T00:00:00"); d.setDate(d.getDate() + 1)) {
      for (let t = sh * 60 + sm; t <= eh * 60 + em; t += 15) {
        const dt = new Date(d);
        dt.setHours(Math.floor(t / 60), t % 60, 0, 0);
        slots.push(dt.toISOString());
      }
    }
    // current occupancy + unslotted candidates (registration order)
    const occupancy = {};
    rows.forEach((r) => { if (r.slot) occupancy[r.slot] = (occupancy[r.slot] || 0) + 1; });
    const unslotted = [...rows].filter((r) => !r.slot).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let i = 0, assigned = 0;
    for (const slot of slots) {
      const free = auto.perSlot - (occupancy[slot] || 0);
      if (free <= 0) continue;
      const batch = unslotted.slice(i, i + free);
      if (batch.length === 0) break;
      await supabase.from("candidates").update({ slot, slot_emailed_at: null }).in("roll_no", batch.map((r) => r.roll_no));
      i += batch.length; assigned += batch.length;
    }
    setAutoState("");
    setShowAuto(false);
    alert(assigned < unslotted.length
      ? `Assigned ${assigned}; ${unslotted.length - assigned} didn't fit — widen the window or raise per-slot.`
      : `Assigned ${assigned} candidate(s).`);
    load();
  }

  async function sendSlotEmails() {
    const password = window.prompt("Admin password to send slot emails:");
    if (!password) return;
    setMailState("sending");
    const { data, error } = await supabase.functions.invoke("send-slot-emails", { body: { password } });
    if (error) { setMailState(""); return alert("Failed: " + error.message); }
    setMailState("");
    alert(`Sent to ${data.sent} candidate(s) across ${data.groups} slot group(s).` + (data.errors?.length ? `\nErrors: ${data.errors.join("; ")}` : ""));
    load();
  }

  function exportCSV() {
    const head = ["Roll No", "Name", "Slot", "Email", "Phone", "Hall", "Dept", "Domains", "Hobbies", "Movie Loved", "Movie Hated", "On TFPS", "About", "Portfolio", "Status", "Registered At"];
    const lines = filtered.map((r) =>
      [r.roll_no, r.name, r.slot ? new Date(r.slot).toLocaleString("en-IN") : "", r.email, r.phone, r.hall, r.department, r.domains.join("; "), r.hobbies, r.movie_love, r.movie_hate, r.about_us, r.about, r.portfolio_link, r.status, new Date(r.created_at).toLocaleString()]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([head.join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tfps-registrations.csv";
    a.click();
  }

  return (
    <main className="px-4 sm:px-6 py-8 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="font-display text-3xl sm:text-4xl flex-1">Registrations <span className="text-muted text-lg">({rows.length})</span></h1>
        <input className="input !w-56" placeholder="Search name / roll / hall…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input !w-auto" value={filterDomain} onChange={(e) => setFilterDomain(e.target.value)}>
          <option value="">All domains</option>
          {DOMAINS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <button className="btn-ghost text-xs" onClick={exportCSV}>Export CSV</button>
        <button className="btn-ghost text-xs" onClick={() => setShowAuto(!showAuto)}>⚡ Auto-assign slots</button>
        <button className="btn-gold text-xs" onClick={sendSlotEmails} disabled={mailState === "sending"}>
          {mailState === "sending" ? "Sending…" : "✉ Email new slots"}
        </button>
      </div>

      {showAuto && (
        <div className="card p-5 mb-6 fade-up">
          <p className="font-display text-lg mb-3">Auto-assign unslotted candidates <span className="text-muted text-sm font-body">(15-min slots, registration order; existing slots untouched)</span></p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-xs text-muted">From<br /><input type="date" className="input mt-1 !w-auto" value={auto.from} onChange={(e) => setAuto({ ...auto, from: e.target.value })} /></label>
            <label className="text-xs text-muted">To<br /><input type="date" className="input mt-1 !w-auto" value={auto.to} onChange={(e) => setAuto({ ...auto, to: e.target.value })} /></label>
            <label className="text-xs text-muted">First slot<br /><input type="time" step="900" className="input mt-1 !w-auto" value={auto.start} onChange={(e) => setAuto({ ...auto, start: e.target.value })} /></label>
            <label className="text-xs text-muted">Last slot<br /><input type="time" step="900" className="input mt-1 !w-auto" value={auto.end} onChange={(e) => setAuto({ ...auto, end: e.target.value })} /></label>
            <label className="text-xs text-muted">Per slot<br /><input type="number" min="1" max="50" className="input mt-1 !w-24" value={auto.perSlot} onChange={(e) => setAuto({ ...auto, perSlot: Number(e.target.value) || 1 })} /></label>
            <button className="btn-gold text-sm" onClick={autoAssign} disabled={autoState === "working"}>
              {autoState === "working" ? "Assigning…" : `Assign ${rows.filter((r) => !r.slot).length} unslotted`}
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted text-xs uppercase tracking-wider border-b border-edge">
              {["Roll", "Name", "Slot", "Hall", "Dept", "Contact", "Domains", "Hobbies", "Movie ♥", "Movie ✗", "On TFPS", "About", "Portfolio", "Status", "Registered"].map((h) => (
                <th key={h} className="px-3 py-3 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.roll_no} className="border-b border-edge/50 hover:bg-panel align-top">
                <td className="px-3 py-2.5 text-muted whitespace-nowrap">{r.roll_no}</td>
                <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.name}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <SlotPicker compact value={r.slot} onChange={(v) => setSlot(r.roll_no, v)} />
                  {r.slot && (
                    <button className="ml-1 text-[10px] hover:scale-125 transition-transform" onClick={() => toggleEmailed(r)}
                      title={r.slot_emailed_at ? "Email sent — click to mark as pending" : "Email pending — click to mark as sent"}>
                      {r.slot_emailed_at ? <span className="text-green">✓</span> : <span className="text-yellow">●</span>}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2.5 text-muted whitespace-nowrap">{r.hall || "—"}</td>
                <td className="px-3 py-2.5 text-muted">{r.department || "—"}</td>
                <td className="px-3 py-2.5 text-muted text-xs">{r.email}<br />{r.phone}</td>
                <td className="px-3 py-2.5 text-muted text-xs min-w-[140px]">{r.domains.join(", ")}</td>
                <td className="px-3 py-2.5 text-cream/80 text-xs min-w-[160px] max-w-[220px]">{r.hobbies}</td>
                <td className="px-3 py-2.5 text-cream/80 text-xs min-w-[160px] max-w-[220px]">{r.movie_love}</td>
                <td className="px-3 py-2.5 text-cream/80 text-xs min-w-[160px] max-w-[220px]">{r.movie_hate}</td>
                <td className="px-3 py-2.5 text-cream/80 text-xs min-w-[160px] max-w-[220px]">{r.about_us}</td>
                <td className="px-3 py-2.5 text-cream/80 text-xs min-w-[160px] max-w-[220px]">{r.about}</td>
                <td className="px-3 py-2.5 text-xs">
                  {r.portfolio_link && <a className="text-gold hover:underline" href={r.portfolio_link} target="_blank" rel="noreferrer">Link ↗</a>}
                </td>
                <td className="px-3 py-2.5"><span className="chip border-edge text-muted capitalize text-[10px]">{r.status}</span></td>
                <td className="px-3 py-2.5 text-muted text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={15} className="px-3 py-10 text-center text-muted italic">No registrations yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

export default function Page() {
  return <Guard admin><RegistrationsInner /></Guard>;
}
