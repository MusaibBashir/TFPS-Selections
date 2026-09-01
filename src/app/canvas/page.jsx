"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import Guard from "@/components/Guard";
import { supabase, tagColor, DOMAINS } from "@/lib/supabase";

const DOT = { green: "#4ade80", yellow: "#facc15", red: "#f87171" };

function num(n, d = 1) {
  return n == null || Number.isNaN(n) ? "—" : Number(n).toFixed(d);
}
function csvCell(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}
function download(name, head, lines) {
  const blob = new Blob([head.map(csvCell).join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

// Defined at module scope on purpose: nesting this inside CanvasInner would make
// React see a new component type every render and remount all ~500 rows, which
// breaks double-click detection mid-gesture and drags badly.
function Person({ r, compact, selected, onToggle, onOpen, onDragStart, final, avg, adm, domains, overridden }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, r.roll_no)}
      onClick={() => onToggle(r.roll_no)}
      onDoubleClick={(e) => { e.preventDefault(); onOpen(r.roll_no); }}
      title="Click to select · double-click for full details · drag to a set"
      className={`group rounded-xl border px-3 py-2 cursor-pointer transition-colors select-none ${
        selected ? "border-gold bg-gold/15" : "border-edge bg-panel hover:border-gold/40"}`}>
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: DOT[r.final_tag] || "#2b2721" }} />
        <span className="font-medium text-sm truncate flex-1">{r.name}</span>
        <button onClick={(e) => { e.stopPropagation(); onOpen(r.roll_no); }}
          className="text-muted hover:text-gold text-xs opacity-60 hover:opacity-100 shrink-0"
          title="Full details">ⓘ</button>
      </div>
      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted">
        <span className="truncate">{r.roll_no}</span>
        <span className="flex-1" />
        <span className="text-gold/90 shrink-0" title="Final rating">{num(final)}</span>
        <span className="shrink-0" title="Overall avg / admin avg">({num(avg)}/{num(adm)})</span>
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-1 mt-1">
          {domains.slice(0, 3).map((d) => (
            <span key={d} className={`chip text-[9px] !px-1.5 !py-0 ${
              overridden ? "border-gold/40 text-gold/90" : "border-edge text-muted"}`}>{d}</span>
          ))}
          {domains.length > 3 && <span className="text-[9px] text-muted">+{domains.length - 3}</span>}
        </div>
      )}
    </div>
  );
}

function CanvasInner() {
  const [cands, setCands] = useState([]);
  const [sets, setSets] = useState([]);
  const [adminNames, setAdminNames] = useState(new Set());

  const [sel, setSel] = useState(new Set());     // highlighted roll_nos
  const [open, setOpen] = useState(null);        // roll_no shown in the modal
  const [infoSet, setInfoSet] = useState(null);  // set id whose breakdown is expanded
  const [dragOver, setDragOver] = useState(null);
  const [exportKind, setExportKind] = useState(null); // null | 'partial' | 'full'
  const [setDomFilter, setSetDomFilter] = useState({}); // { [setId]: [domain, ...] }

  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterDomain, setFilterDomain] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(true);
  const [sortBy, setSortBy] = useState("name");   // name | avg | admin | final | colour
  const [sortDir, setSortDir] = useState("asc");

  const load = useCallback(async () => {
    const [c, ev, iv, fb, ts, mem, st] = await Promise.all([
      supabase.from("candidates").select("*").order("name"),
      supabase.from("evaluations").select("*"),
      supabase.from("interviews").select("*"),
      supabase.from("interview_feedback").select("*"),
      supabase.from("task_submissions").select("*"),
      supabase.from("members").select("name,is_admin"),
      supabase.from("canvas_sets").select("*").order("position").order("created_at")
    ]);
    setAdminNames(new Set((mem.data || []).filter((m) => m.is_admin).map((m) => m.name)));
    setSets(st.data || []);
    const evs = ev.data || [], ivs = iv.data || [], fbs = fb.data || [], tss = ts.data || [];
    setCands((c.data || []).map((r) => ({
      ...r,
      evals: evs.filter((x) => x.roll_no === r.roll_no),
      interviews: ivs.filter((x) => x.roll_no === r.roll_no),
      ivNotes: fbs.filter((x) => x.roll_no === r.roll_no),
      tasks: tss.filter((x) => x.roll_no === r.roll_no)
    })));
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("canvas-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "candidates" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "canvas_sets" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "evaluations" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  // ---- derived values -------------------------------------------------
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  // Some reviews carry deliberate out-of-range sentinel scores (e.g. 10000 as a
  // "come back to this" bookmark). Averaging those destroys the ranking, so they
  // are excluded from the maths but still shown in the review list.
  const scored = (r) => r.evals.filter((e) => e.score != null && e.score >= 0 && e.score <= 10);
  const outOfRange = (r) => r.evals.filter((e) => e.score != null && (e.score < 0 || e.score > 10));
  const avgAll = useCallback((r) => mean(scored(r).map((e) => Number(e.score))), []);
  const avgAdmin = useCallback((r) =>
    mean(scored(r).filter((e) => adminNames.has(e.evaluator)).map((e) => Number(e.score))), [adminNames]);
  const effDomains = (r) => (r.assigned_domains?.length ? r.assigned_domains : r.domains) || [];
  const finalOf = useCallback((r) => {
    const src = r.final_score_src || "avg";
    if (src === "custom") return r.final_score != null ? Number(r.final_score) : null;
    if (src === "admin") return avgAdmin(r);
    return avgAll(r);
  }, [avgAll, avgAdmin]);

  const bySet = useMemo(() => {
    const m = { __none: [] };
    sets.forEach((s) => { m[s.id] = []; });
    cands.forEach((r) => {
      const k = r.set_id && m[r.set_id] ? r.set_id : "__none";
      m[k].push(r);
    });
    return m;
  }, [cands, sets]);

  const masterList = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = cands.filter((r) => {
      // Built in, not optional: Canvas only deals with people whose task has
      // actually been reviewed by someone.
      if (r.evals.length === 0) return false;
      if (unassignedOnly && r.set_id) return false;
      if (filterTag && r.final_tag !== filterTag) return false;
      if (filterDomain && !effDomains(r).includes(filterDomain)) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.roll_no.toLowerCase().includes(q)) return false;
      return true;
    });

    const dir = sortDir === "desc" ? 1 : -1;
    // Unscored people sink to the bottom either way — flipping direction should
    // reorder the people who have scores, not surface the ones who have none.
    const byNum = (av, bv) => {
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (bv - av) * dir;
    };
    const ord = { green: 0, yellow: 1, red: 2 };

    return [...list].sort((a, b) => {
      if (sortBy === "avg") return byNum(avgAll(a), avgAll(b)) || a.name.localeCompare(b.name);
      if (sortBy === "admin") return byNum(avgAdmin(a), avgAdmin(b)) || a.name.localeCompare(b.name);
      if (sortBy === "final") return byNum(finalOf(a), finalOf(b)) || a.name.localeCompare(b.name);
      if (sortBy === "colour") {
        const ta = ord[a.final_tag] ?? 3, tb = ord[b.final_tag] ?? 3;
        return ((ta - tb) * -dir) || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name) * (sortDir === "asc" ? 1 : -1);
    });
  }, [cands, search, filterTag, filterDomain, unassignedOnly, sortBy, sortDir, avgAll, avgAdmin, finalOf]);

  // highest-first makes sense for scores, A→Z for names
  function changeSort(next) {
    setSortBy(next);
    setSortDir(next === "name" ? "asc" : "desc");
  }

  // ---- mutations ------------------------------------------------------
  async function addSet() {
    const name = window.prompt("Name this set", `Set ${sets.length + 1}`);
    if (!name || !name.trim()) return;
    await supabase.from("canvas_sets").insert({ name: name.trim(), position: sets.length });
    load();
  }
  async function renameSet(s) {
    const name = window.prompt("Rename set", s.name);
    if (!name || !name.trim()) return;
    await supabase.from("canvas_sets").update({ name: name.trim() }).eq("id", s.id);
    load();
  }
  async function removeSet(s) {
    const n = (bySet[s.id] || []).length;
    if (!window.confirm(`Delete "${s.name}"? ${n} ${n === 1 ? "person goes" : "people go"} back to the master list.`)) return;
    await supabase.from("canvas_sets").delete().eq("id", s.id);
    load();
  }
  async function moveTo(rolls, setId) {
    if (!rolls.length) return;
    await supabase.from("candidates").update({ set_id: setId }).in("roll_no", rolls);
    setSel(new Set());
    load();
  }
  async function patch(roll_no, p) {
    await supabase.from("candidates").update(p).eq("roll_no", roll_no);
    load();
  }

  function toggleSel(roll) {
    setSel((s) => {
      const n = new Set(s);
      n.has(roll) ? n.delete(roll) : n.add(roll);
      return n;
    });
  }
  function onDragStart(e, roll) {
    const payload = sel.has(roll) ? [...sel] : [roll];
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  }
  function onDrop(e, setId) {
    e.preventDefault();
    setDragOver(null);
    try {
      const rolls = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (Array.isArray(rolls) && rolls.length) moveTo(rolls, setId);
    } catch { /* ignore malformed drags */ }
  }

  // ---- set breakdown --------------------------------------------------
  function breakdown(list) {
    const dom = {}, col = { green: 0, yellow: 0, red: 0, untagged: 0 };
    list.forEach((r) => {
      // someone tagged photography AND writing counts under both
      effDomains(r).forEach((d) => { dom[d] = (dom[d] || 0) + 1; });
      col[r.final_tag || "untagged"] += 1;
    });
    return { dom, col };
  }

  // ---- export ---------------------------------------------------------
  const setName = (id) => sets.find((s) => s.id === id)?.name || "";

  function exportPartial(list, file) {
    const head = ["Set", "Roll No", "Name", "Phone", "Domain", "Interview Score", "Interview Colour",
      "Task Reviews", "Avg Score", "Admin Avg", "Task Score", "Task Link", "Final Colour"];
    const lines = list.map((r) => {
      const iv = r.interviews[0] || {};
      const links = r.tasks.flatMap((t) => (t.links || []).map((l) => l.url)).join(" | ");
      return [setName(r.set_id), r.roll_no, r.name, r.phone, effDomains(r).join("; "),
        iv.score ?? "", iv.tag || "", r.evals.length, num(avgAll(r)), num(avgAdmin(r)),
        num(finalOf(r)), links, r.final_tag || ""].map(csvCell).join(",");
    });
    download(file, head, lines);
  }

  function exportFull(list, file) {
    const head = ["Set", "Roll No", "Name", "Email", "Phone", "Hall", "Department",
      "Registered Domains", "Assigned Domains", "Hobbies", "Movie Loved", "Movie Hated",
      "On TFPS", "About", "Portfolio", "Registered At", "Status",
      "Panel", "Panelists", "Interview Score", "Interview Colour", "Interview Feedback",
      "Panelist Notes", "Tasks Assigned", "Task Links", "Task Notes",
      "Task Reviews", "Review Detail", "Avg Score", "Admin Avg", "Final Score", "Final Score Source", "Final Colour"];
    const lines = list.map((r) => {
      const iv = r.interviews[0] || {};
      const notes = r.ivNotes.map((n) => `${n.panelist}${n.score != null ? ` (${n.score}/10)` : ""}: ${n.feedback || ""}`).join(" | ");
      const links = r.tasks.flatMap((t) => (t.links || []).map((l) => l.url)).join(" | ");
      const tnotes = r.tasks.map((t) => t.notes).filter(Boolean).join(" | ");
      const revs = r.evals.map((e) =>
        `${e.evaluator}${adminNames.has(e.evaluator) ? " [admin]" : ""}${e.score != null ? ` (${e.score}/10)` : ""}: ${e.feedback || ""}`).join(" | ");
      return [setName(r.set_id), r.roll_no, r.name, r.email, r.phone, r.hall, r.department,
        (r.domains || []).join("; "), (r.assigned_domains || []).join("; "), r.hobbies, r.movie_love, r.movie_hate,
        r.about_us, r.about, r.portfolio_link, r.created_at, r.status,
        iv.panel_name || "", (iv.panelist_names || []).join("; "), iv.score ?? "", iv.tag || "", iv.feedback || "",
        notes, iv.tasks_assigned || "", links, tnotes,
        r.evals.length, revs, num(avgAll(r)), num(avgAdmin(r)), num(finalOf(r)),
        r.final_score_src || "avg", r.final_tag || ""].map(csvCell).join(",");
    });
    download(file, head, lines);
  }

  // shared props for every person chip, so the two lists stay in sync
  const chip = (r) => ({
    r,
    selected: sel.has(r.roll_no),
    onToggle: toggleSel,
    onOpen: setOpen,
    onDragStart,
    final: finalOf(r),
    avg: avgAll(r),
    adm: avgAdmin(r),
    domains: effDomains(r),
    overridden: !!r.assigned_domains?.length
  });

  // people not in any set, matching what the master list actually shows
  const unassignedReviewed = useMemo(
    () => cands.filter((r) => !r.set_id && r.evals.length > 0),
    [cands]
  );

  function runExport(list, label) {
    const slug = label.replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase();
    if (exportKind === "partial") exportPartial(list, `tfps-${slug}-partial.csv`);
    else exportFull(list, `tfps-${slug}-full.csv`);
    setExportKind(null);
  }

  // how many of the highlighted people are currently sitting inside a set
  const selectedInSets = useMemo(
    () => cands.filter((r) => sel.has(r.roll_no) && r.set_id).length,
    [cands, sel]
  );

  const openRow = cands.find((r) => r.roll_no === open);

  return (
    <main className="px-4 sm:px-6 py-8 max-w-[110rem] mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <h1 className="font-display text-3xl sm:text-4xl">Canvas</h1>
        <span className="text-muted text-sm">{cands.length} candidates · {sets.length} sets</span>
        <span className="flex-1" />
        {sel.size > 0 && (
          <>
            <span className="chip border-gold bg-gold/15 text-gold">{sel.size} selected</span>
            <button className="text-muted hover:text-cream text-sm" onClick={() => setSel(new Set())}>clear</button>
          </>
        )}
        <button className="btn-ghost text-xs" onClick={() => setExportKind("partial")}>Export partial</button>
        <button className="btn-ghost text-xs" onClick={() => setExportKind("full")}>Export full</button>
        <button className="btn-gold text-xs" onClick={addSet}>+ New set</button>
      </div>

      <div className="grid lg:grid-cols-[22rem_1fr] gap-4 items-start">
        {/* ---------------- master list ---------------- */}
        <div className="card p-4"
          onDragOver={(e) => { e.preventDefault(); setDragOver("__none"); }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => onDrop(e, null)}>
          <div className="flex items-baseline gap-2 mb-1">
            <h2 className="font-display text-xl flex-1">Master list</h2>
            <span className="text-muted text-xs">{masterList.length}</span>
          </div>
          <p className="text-muted text-[11px] mb-3">Reviewed candidates only.</p>
          {/* selection may include people sitting in sets — this pulls them back out */}
          {selectedInSets > 0 && (
            <button className="btn-gold w-full text-xs !py-1.5 mb-2"
              onClick={() => moveTo([...sel], null)}>
              ← Send {selectedInSets} back to master
            </button>
          )}
          <input className="input !py-2 text-sm mb-2" placeholder="Search name / roll…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex flex-wrap gap-1.5 mb-2">
            {["green", "yellow", "red"].map((t) => (
              <button key={t} onClick={() => setFilterTag(filterTag === t ? "" : t)}
                className={`chip capitalize text-[11px] ${filterTag === t ? tagColor(t) + " ring-1 ring-current" : "border-edge text-muted"}`}>{t}</button>
            ))}
            <button onClick={() => setUnassignedOnly((v) => !v)}
              className={`chip text-[11px] ${unassignedOnly ? "border-gold bg-gold/15 text-gold" : "border-edge text-muted"}`}>
              Unassigned only
            </button>
          </div>
          <select className="input !py-2 text-sm mb-2" value={filterDomain} onChange={(e) => setFilterDomain(e.target.value)}>
            <option value="">All domains</option>
            {DOMAINS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <div className="flex gap-2 mb-3">
            <select className="input !py-2 text-sm flex-1" value={sortBy} onChange={(e) => changeSort(e.target.value)}>
              <option value="name">Sort: Name</option>
              <option value="avg">Sort: Avg score</option>
              <option value="admin">Sort: Admin score</option>
              <option value="final">Sort: Final rating</option>
              <option value="colour">Sort: Final colour</option>
            </select>
            <button className="btn-ghost !px-3 !py-2 text-sm shrink-0" title="Flip sort direction"
              onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}>
              {sortDir === "desc" ? "↓" : "↑"}
            </button>
          </div>

          <div className={`space-y-1.5 max-h-[64vh] overflow-y-auto pr-1 rounded-lg ${
            dragOver === "__none" ? "ring-1 ring-gold/60" : ""}`}>
            {masterList.map((r) => <Person key={r.roll_no} {...chip(r)} />)}
            {masterList.length === 0 && (
              <p className="text-muted text-sm italic py-6 text-center">Nobody matches these filters.</p>
            )}
          </div>
        </div>

        {/* ---------------- sets ---------------- */}
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {sets.map((s) => {
            const list = bySet[s.id] || [];
            const b = breakdown(list);
            // clicking domains in the breakdown narrows the set to those domains
            const domSel = setDomFilter[s.id] || [];
            const shown = domSel.length
              ? list.filter((r) => effDomains(r).some((d) => domSel.includes(d)))
              : list;
            const toggleDom = (d) => setSetDomFilter((f) => {
              const cur = f[s.id] || [];
              return { ...f, [s.id]: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d] };
            });
            return (
              <div key={s.id}
                onDragOver={(e) => { e.preventDefault(); setDragOver(s.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => onDrop(e, s.id)}
                className={`card p-4 transition-colors ${dragOver === s.id ? "border-gold" : ""}`}>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg flex-1 truncate">{s.name}</h3>
                  <span className={`chip text-[10px] ${domSel.length ? "border-gold/40 text-gold" : "border-edge text-muted"}`}>
                    {domSel.length ? `${shown.length}/${list.length}` : list.length}
                  </span>
                  <button className="text-muted hover:text-gold text-xs"
                    onClick={() => setInfoSet(infoSet === s.id ? null : s.id)} title="Breakdown">ⓘ</button>
                  <button className="text-muted hover:text-gold text-xs" onClick={() => renameSet(s)} title="Rename">✎</button>
                  <button className="text-muted hover:text-red text-xs" onClick={() => removeSet(s)} title="Delete set">✕</button>
                </div>

                {sel.size > 0 && (
                  <button className="btn-gold w-full text-xs !py-1.5 mt-2"
                    onClick={() => moveTo([...sel], s.id)}>
                    → Move {sel.size} here
                  </button>
                )}

                {infoSet === s.id && (
                  <div className="mt-3 rounded-xl bg-panel p-3 text-xs space-y-2">
                    <div>
                      <p className="text-muted mb-1">Final colours</p>
                      <div className="flex flex-wrap gap-1.5">
                        {["green", "yellow", "red"].map((t) => (
                          <span key={t} className={`chip text-[10px] capitalize ${tagColor(t)}`}>{t} {b.col[t]}</span>
                        ))}
                        <span className="chip text-[10px] border-edge text-muted">untagged {b.col.untagged}</span>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2 mb-1">
                        <p className="text-muted flex-1">
                          Domains <span className="opacity-70">(counted in each · click to filter)</span>
                        </p>
                        {domSel.length > 0 && (
                          <button className="text-muted hover:text-cream"
                            onClick={() => setSetDomFilter((f) => ({ ...f, [s.id]: [] }))}>clear</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(b.dom).sort((x, y) => y[1] - x[1]).map(([d, n]) => {
                          const on = domSel.includes(d);
                          return (
                            <button key={d} onClick={() => toggleDom(d)}
                              className={`chip text-[10px] transition-colors ${on
                                ? "border-gold bg-gold/20 text-gold"
                                : "border-gold/30 text-gold/90 hover:border-gold/60"}`}>
                              {d} {n}
                            </button>
                          );
                        })}
                        {Object.keys(b.dom).length === 0 && <span className="text-muted italic">none</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button className="text-gold/80 hover:text-gold"
                        onClick={() => exportPartial(shown, `tfps-${s.name.replace(/\W+/g, "-").toLowerCase()}-partial.csv`)}>
                        export partial{domSel.length ? ` (${shown.length})` : ""}
                      </button>
                      <button className="text-gold/80 hover:text-gold"
                        onClick={() => exportFull(shown, `tfps-${s.name.replace(/\W+/g, "-").toLowerCase()}-full.csv`)}>
                        export full{domSel.length ? ` (${shown.length})` : ""}
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 mt-3 min-h-[80px] max-h-[52vh] overflow-y-auto pr-1">
                  {shown.map((r) => <Person key={r.roll_no} {...chip(r)} compact />)}
                  {list.length === 0 && (
                    <p className="text-muted text-xs italic py-6 text-center">
                      Drag people here, or select and press Move.
                    </p>
                  )}
                  {list.length > 0 && shown.length === 0 && (
                    <p className="text-muted text-xs italic py-6 text-center">
                      Nobody in this set matches {domSel.join(" or ")}.
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {sets.length === 0 && (
            <div className="card p-10 text-center sm:col-span-2 xl:col-span-3">
              <p className="text-muted">No sets yet. Create one to start sorting the final list.</p>
              <button className="btn-gold text-sm mt-4" onClick={addSet}>+ New set</button>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- export scope picker ---------------- */}
      {exportKind && (
        <div className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setExportKind(null)}>
          <div className="card p-6 max-w-md w-full fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="font-display text-2xl capitalize">Export {exportKind} CSV</h2>
              <button className="text-muted hover:text-cream text-xl" onClick={() => setExportKind(null)}>✕</button>
            </div>
            <p className="text-muted text-sm mb-4">Which set do you want?</p>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {sets.map((s) => {
                const n = (bySet[s.id] || []).length;
                return (
                  <button key={s.id} disabled={n === 0}
                    onClick={() => runExport(bySet[s.id] || [], s.name)}
                    className="w-full flex items-center gap-3 rounded-xl border border-edge bg-panel px-4 py-3 text-left
                               hover:border-gold/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <span className="flex-1 font-medium truncate">{s.name}</span>
                    <span className="chip border-edge text-muted text-[10px]">{n}</span>
                  </button>
                );
              })}
              {sets.length === 0 && (
                <p className="text-muted text-sm italic py-2">No sets yet — create one to export it separately.</p>
              )}

              <div className="pt-2 mt-2 border-t border-edge space-y-2">
                <button onClick={() => runExport(unassignedReviewed, "master-list")}
                  className="w-full flex items-center gap-3 rounded-xl border border-edge bg-panel px-4 py-3 text-left
                             hover:border-gold/60 transition-colors">
                  <span className="flex-1">Master list <span className="text-muted text-xs">· not in any set</span></span>
                  <span className="chip border-edge text-muted text-[10px]">{unassignedReviewed.length}</span>
                </button>
                <button onClick={() => runExport(cands, "everyone")}
                  className="w-full flex items-center gap-3 rounded-xl border border-edge bg-panel px-4 py-3 text-left
                             hover:border-gold/60 transition-colors">
                  <span className="flex-1">Everyone <span className="text-muted text-xs">· all candidates, reviewed or not</span></span>
                  <span className="chip border-edge text-muted text-[10px]">{cands.length}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- person modal ---------------- */}
      {openRow && (
        <div className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8"
          onClick={() => setOpen(null)}>
          <div className="card p-6 sm:p-8 max-w-2xl w-full my-8 fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl">{openRow.name}</h2>
                <p className="text-muted">{openRow.roll_no} · {openRow.hall || "—"} {openRow.department ? `· ${openRow.department}` : ""}</p>
                <p className="text-muted text-sm">{openRow.email} {openRow.phone ? `· ${openRow.phone}` : ""}</p>
              </div>
              <button className="text-muted hover:text-cream text-xl" onClick={() => setOpen(null)}>✕</button>
            </div>

            {/* scores */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              {[["Overall avg", avgAll(openRow)], ["Admin avg", avgAdmin(openRow)], ["Final", finalOf(openRow)]].map(([label, v], i) => (
                <div key={label} className={`rounded-xl p-3 text-center ${i === 2 ? "bg-gold/10 border border-gold/40" : "bg-panel"}`}>
                  <p className="text-muted text-[11px]">{label}</p>
                  <p className={`font-display text-2xl ${i === 2 ? "text-gold" : ""}`}>{num(v)}</p>
                </div>
              ))}
            </div>

            {/* final rating source */}
            <h3 className="font-display text-lg mt-5 mb-2">Final rating</h3>
            <div className="flex flex-wrap items-center gap-2">
              {[["avg", "Use overall avg"], ["admin", "Use admin avg"], ["custom", "Custom"]].map(([src, label]) => (
                <button key={src}
                  onClick={() => patch(openRow.roll_no, { final_score_src: src })}
                  className={`chip ${(openRow.final_score_src || "avg") === src
                    ? "border-gold bg-gold/15 text-gold" : "border-edge text-muted hover:text-cream"}`}>
                  {label}
                </button>
              ))}
              {(openRow.final_score_src || "avg") === "custom" && (
                <input className="input !w-28 !py-1.5 text-sm" type="number" step="0.5" min="0" max="10"
                  placeholder="/10" defaultValue={openRow.final_score ?? ""}
                  onBlur={(e) => patch(openRow.roll_no, {
                    final_score: e.target.value === "" ? null : Number(e.target.value)
                  })} />
              )}
            </div>

            {/* final colour */}
            <div className="flex items-center gap-2 mt-4">
              <span className="text-muted text-sm mr-1">Final colour:</span>
              {["green", "yellow", "red"].map((t) => (
                <button key={t}
                  onClick={() => patch(openRow.roll_no, { final_tag: openRow.final_tag === t ? null : t })}
                  className={`chip capitalize ${openRow.final_tag === t ? tagColor(t) + " ring-1 ring-current" : "border-edge text-muted hover:text-cream"}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* assigned domains */}
            <h3 className="font-display text-lg mt-5 mb-1">Domains</h3>
            <p className="text-muted text-xs mb-2">
              Registered: {(openRow.domains || []).join(", ") || "none"}. Pick below to override with the domain
              they actually did the task for — leave empty to keep what they registered with.
            </p>
            <div className="flex flex-wrap gap-2">
              {DOMAINS.map((d) => {
                const on = (openRow.assigned_domains || []).includes(d);
                return (
                  <button key={d}
                    onClick={() => patch(openRow.roll_no, {
                      assigned_domains: on
                        ? openRow.assigned_domains.filter((x) => x !== d)
                        : [...(openRow.assigned_domains || []), d]
                    })}
                    className={`chip ${on ? "border-gold bg-gold/15 text-gold" : "border-edge text-muted"}`}>
                    {d}
                  </button>
                );
              })}
            </div>

            {/* set */}
            <h3 className="font-display text-lg mt-5 mb-2">Set</h3>
            <select className="input !py-2 text-sm" value={openRow.set_id || ""}
              onChange={(e) => patch(openRow.roll_no, { set_id: e.target.value || null })}>
              <option value="">— master list —</option>
              {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            {/* registration */}
            <h3 className="font-display text-lg mt-6 mb-2">Registration</h3>
            {openRow.hobbies && <p className="text-sm text-cream/80"><span className="text-muted">Hobbies:</span> {openRow.hobbies}</p>}
            {openRow.movie_love && <p className="text-sm mt-1 text-cream/80"><span className="text-muted">Loves:</span> {openRow.movie_love}</p>}
            {openRow.movie_hate && <p className="text-sm mt-1 text-cream/80"><span className="text-muted">Hates:</span> {openRow.movie_hate}</p>}
            {openRow.about_us && <p className="text-sm mt-1 text-cream/80"><span className="text-muted">On TFPS:</span> {openRow.about_us}</p>}
            {openRow.about && <p className="text-sm mt-1 text-cream/80"><span className="text-muted">About:</span> {openRow.about}</p>}
            {openRow.portfolio_link && (
              <a className="text-gold text-sm hover:underline" href={openRow.portfolio_link} target="_blank" rel="noreferrer">Portfolio ↗</a>
            )}

            {/* interview */}
            <h3 className="font-display text-lg mt-6 mb-2">Interview</h3>
            {openRow.interviews.length === 0 && <p className="text-muted text-sm italic">Not interviewed.</p>}
            {openRow.interviews.map((iv) => (
              <div key={iv.id} className="bg-panel rounded-xl p-4 text-sm space-y-1 mb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted">{iv.panel_name || "Panel"}</span>
                  <span className="text-muted text-xs">· {(iv.panelist_names || []).join(", ")}</span>
                  <span className="flex-1" />
                  {iv.score != null && <span className="chip border-edge">{iv.score}/10</span>}
                  {iv.tag && <span className={`chip capitalize ${tagColor(iv.tag)}`}>{iv.tag}</span>}
                </div>
                {iv.feedback && <p className="text-cream/80">{iv.feedback}</p>}
                {iv.tasks_assigned && <p className="text-muted">Task assigned: <span className="text-cream/80">{iv.tasks_assigned}</span></p>}
              </div>
            ))}
            {openRow.ivNotes.map((n) => (
              <div key={n.id} className="flex items-start gap-3 bg-panel rounded-xl p-3 text-sm mb-2">
                <span className="chip border-edge text-muted shrink-0">{n.panelist}</span>
                {n.score != null && <span className="chip border-gold/40 text-gold shrink-0">{n.score}/10</span>}
                <p className="text-cream/80 flex-1">{n.feedback}</p>
              </div>
            ))}

            {/* task */}
            <h3 className="font-display text-lg mt-6 mb-2">Task submission</h3>
            {openRow.tasks.length === 0 && <p className="text-muted text-sm italic">Nothing submitted.</p>}
            {openRow.tasks.map((t) => (
              <div key={t.id} className="bg-panel rounded-xl p-4 text-sm space-y-1 mb-2">
                {(t.links || []).map((l, i) => (
                  <a key={i} className="block text-gold hover:underline truncate" href={l.url} target="_blank" rel="noreferrer">
                    {l.label || l.url} ↗
                  </a>
                ))}
                {t.notes && <p className="text-muted">{t.notes}</p>}
              </div>
            ))}

            {/* reviews */}
            <h3 className="font-display text-lg mt-6 mb-2">Task reviews ({openRow.evals.length})</h3>
            {outOfRange(openRow).length > 0 && (
              <p className="text-yellow text-xs mb-2">
                ⚠ {outOfRange(openRow).length} review{outOfRange(openRow).length > 1 ? "s are" : " is"} outside 0–10
                ({outOfRange(openRow).map((e) => e.score).join(", ")}) and {outOfRange(openRow).length > 1 ? "are" : "is"} excluded
                from the averages above.
              </p>
            )}
            {openRow.evals.length === 0 && <p className="text-muted text-sm italic">Nobody has reviewed this yet.</p>}
            {openRow.evals.map((e) => (
              <div key={e.id} className="flex items-start gap-3 bg-panel rounded-xl p-3 text-sm mb-2">
                <span className={`chip shrink-0 ${adminNames.has(e.evaluator) ? "border-gold/40 text-gold" : "border-edge text-muted"}`}>
                  {e.evaluator}{adminNames.has(e.evaluator) ? " ★" : ""}
                </span>
                {e.score != null && (
                  <span className={`chip shrink-0 ${e.score < 0 || e.score > 10
                    ? "border-yellow/40 text-yellow" : "border-gold/40 text-gold"}`}>{e.score}/10</span>
                )}
                <p className="text-cream/80 flex-1">{e.feedback}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

export default function Page() {
  return <Guard admin><CanvasInner /></Guard>;
}
