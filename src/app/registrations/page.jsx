"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import Guard from "@/components/Guard";
import { supabase, DOMAINS } from "@/lib/supabase";

function RegistrationsInner() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [filterDomain, setFilterDomain] = useState("");

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

  function exportCSV() {
    const head = ["Roll No", "Name", "Email", "Phone", "Hall", "Dept", "Domains", "Hobbies", "Movie Loved", "Movie Hated", "On TFPS", "About", "Portfolio", "Status", "Registered At"];
    const lines = filtered.map((r) =>
      [r.roll_no, r.name, r.email, r.phone, r.hall, r.department, r.domains.join("; "), r.hobbies, r.movie_love, r.movie_hate, r.about_us, r.about, r.portfolio_link, r.status, new Date(r.created_at).toLocaleString()]
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
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted text-xs uppercase tracking-wider border-b border-edge">
              {["Roll", "Name", "Hall", "Dept", "Contact", "Domains", "Hobbies", "Movie ♥", "Movie ✗", "On TFPS", "About", "Portfolio", "Status", "Registered"].map((h) => (
                <th key={h} className="px-3 py-3 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.roll_no} className="border-b border-edge/50 hover:bg-panel align-top">
                <td className="px-3 py-2.5 text-muted whitespace-nowrap">{r.roll_no}</td>
                <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.name}</td>
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
              <tr><td colSpan={14} className="px-3 py-10 text-center text-muted italic">No registrations yet.</td></tr>
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
