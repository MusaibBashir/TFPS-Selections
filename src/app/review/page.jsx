"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import Guard from "@/components/Guard";
import { supabase, getSession, tagColor, DOMAINS, getLocks } from "@/lib/supabase";

function ReviewInner() {
  const [rows, setRows] = useState([]);
  const [mode, setMode] = useState("cards"); // cards | sheet
  const [filterTag, setFilterTag] = useState("");
  const [filterDomain, setFilterDomain] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null); // roll_no of open profile
  const [evalDraft, setEvalDraft] = useState({ score: "", feedback: "" });
  const [sortBy, setSortBy] = useState("newest"); // newest | color | avg
  const [sortDir, setSortDir] = useState("desc");
  const [onlyTaskSubmitted, setOnlyTaskSubmitted] = useState(false);
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [interviewedByMe, setInterviewedByMe] = useState(false);
  const [reviewedByMe, setReviewedByMe] = useState("");  // "" | "yes" | "no"
  const [taskEditing, setTaskEditing] = useState(true);
  const session = getSession();

  const load = useCallback(async () => {
    const [c, i, t, ev, fb] = await Promise.all([
      supabase.from("candidates").select("*").order("created_at"),
      supabase.from("interviews").select("*"),
      supabase.from("task_submissions").select("*"),
      supabase.from("evaluations").select("*"),
      supabase.from("interview_feedback").select("*")
    ]);
    const interviews = i.data || [], tasks = t.data || [], evals = ev.data || [], fbs = fb.data || [];
    setRows((c.data || []).map((cand) => ({
      ...cand,
      interviews: interviews.filter((x) => x.roll_no === cand.roll_no),
      ivNotes: fbs.filter((x) => x.roll_no === cand.roll_no),
      tasks: tasks.filter((x) => x.roll_no === cand.roll_no),
      evals: evals.filter((x) => x.roll_no === cand.roll_no)
    })));
  }, []);

  useEffect(() => {
    load();
    getLocks().then((l) => setTaskEditing(l.task));
    const st = supabase.channel("settings-review")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => getLocks().then((l) => setTaskEditing(l.task)))
      .subscribe();
    return () => supabase.removeChannel(st);
  }, [load]);

  const avgOf = (r) => {
    const scores = r.evals.filter((e) => e.score != null).map((e) => Number(e.score));
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  };

  const filtered = useMemo(() => rows.filter((r) => {
    if (filterTag && r.final_tag !== filterTag) return false;
    if (filterDomain && !r.domains.includes(filterDomain)) return false;
    if (onlyTaskSubmitted && r.tasks.length === 0) return false;
    // Awaiting review = they submitted something, and nobody has evaluated it yet.
    // (Someone who never submitted has nothing to review, so they stay out.)
    if (onlyUnreviewed && (r.tasks.length === 0 || r.evals.length > 0)) return false;
    // "Interviewed by me" = I was on the panel that sat this interview, which is
    // recorded as a snapshot of panelist names on the interview row itself.
    if (interviewedByMe) {
      const mine = session && r.interviews.some((iv) => (iv.panelist_names || []).includes(session.name));
      if (!mine) return false;
    }
    if (reviewedByMe) {
      const mine = session && r.evals.some((e) => e.evaluator === session.name);
      if (reviewedByMe === "yes" && !mine) return false;
      if (reviewedByMe === "no" && mine) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      if (!r.name.toLowerCase().includes(s) && !r.roll_no.toLowerCase().includes(s)) return false;
    }
    return true;
  }).sort((a, b) => {
    const dir = sortDir === "desc" ? 1 : -1;
    if (sortBy === "color") {
      const ord = { green: 0, yellow: 1, red: 2 };
      const ta = ord[a.final_tag] ?? 3;
      const tb = ord[b.final_tag] ?? 3;
      return (ta - tb) * dir;
    }
    if (sortBy === "ivcolour") {
      const ord = { green: 0, yellow: 1, red: 2 };
      const ta = ord[a.interviews[0]?.tag] ?? 3;
      const tb = ord[b.interviews[0]?.tag] ?? 3;
      return (ta - tb) * dir;
    }
    if (sortBy === "avg") {
      const aa = avgOf(a), ab = avgOf(b);
      if (aa == null && ab == null) return 0;
      if (aa == null) return 1; // unrated always last
      if (ab == null) return -1;
      return (ab - aa) * dir;
    }
    if (sortBy === "newest") {
      return (new Date(b.created_at) - new Date(a.created_at)) * dir;
    }
    return 0;
  }), [rows, filterTag, filterDomain, search, sortBy, sortDir, onlyTaskSubmitted, onlyUnreviewed, interviewedByMe, reviewedByMe, session]);

  async function setFinalTag(roll_no, tag) {
    await supabase.from("candidates").update({ final_tag: tag }).eq("roll_no", roll_no);
    load();
  }

  async function saveEval(roll_no) {
    if (!session) return;
    await supabase.from("evaluations").upsert({
      roll_no,
      evaluator: session.name,
      score: evalDraft.score === "" ? null : Number(evalDraft.score),
      feedback: evalDraft.feedback || null
    }, { onConflict: "roll_no,evaluator" });
    setEvalDraft({ score: "", feedback: "" });
    load();
  }

  function exportCSV(onlyGreen) {
    const list = onlyGreen ? rows.filter((r) => r.final_tag === "green") : filtered;
    const head = ["Roll No", "Name", "Hall", "Dept", "Email", "Phone", "Domains", "Hobbies", "Movie Loved", "Movie Hated", "On TFPS", "About", "Panel", "Panelists", "Interview Score", "Interview Tag", "Panelist Notes", "Tasks Assigned", "Task Links", "Avg Eval Score", "Final Tag"];
    const lines = list.map((r) => {
      const iv = r.interviews[0] || {};
      const links = r.tasks.flatMap((t) => (t.links || []).map((l) => l.url)).join(" | ");
      const avg = r.evals.length ? (r.evals.reduce((s, e) => s + (Number(e.score) || 0), 0) / r.evals.length).toFixed(1) : "";
      const pn = (iv.panelist_names || []).join("; ");
      const ivnotes = r.ivNotes.map((n) => `${n.panelist}${n.score != null ? ` (${n.score}/10)` : ""}: ${n.feedback || ""}`).join(" | ");
      return [r.roll_no, r.name, r.hall, r.department, r.email, r.phone, r.domains.join("; "), r.hobbies, r.movie_love, r.movie_hate, r.about_us, r.about, iv.panel_name || "", pn, iv.score ?? "", iv.tag || "", ivnotes, iv.tasks_assigned || "", links, avg, r.final_tag || ""]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
    });
    const blob = new Blob([head.join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = onlyGreen ? "tfps-shortlist-green.csv" : "tfps-candidates.csv";
    a.click();
  }

  const openRow = rows.find((r) => r.roll_no === open);
  // Board colour reflects the FINAL tag only — an interview tag alone must not
  // colour a card. Interview tags still show inside the profile modal.
  const effTag = (r) => r.final_tag;

  return (
    <main className="px-4 sm:px-6 py-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="font-display text-3xl sm:text-4xl flex-1">Review Board</h1>
        {session?.role === "admin" && (
          <>
            <button className="btn-ghost text-xs" onClick={() => exportCSV(false)}>Export CSV</button>
            <button className="btn-gold text-xs" onClick={() => exportCSV(true)}>Export Green Shortlist</button>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <input className="input !w-56" placeholder="Search name / roll…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input !w-auto" value={filterDomain} onChange={(e) => setFilterDomain(e.target.value)}>
          <option value="">All domains</option>
          {DOMAINS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <button onClick={() => setOnlyTaskSubmitted(!onlyTaskSubmitted)}
          className={`chip ${onlyTaskSubmitted ? "border-gold bg-gold/15 text-gold" : "border-edge text-muted"}`}>
          Task submitted
        </button>
        <button onClick={() => setOnlyUnreviewed(!onlyUnreviewed)}
          title="Submitted a task that nobody has evaluated yet"
          className={`chip ${onlyUnreviewed ? "border-gold bg-gold/15 text-gold" : "border-edge text-muted"}`}>
          Awaiting review
        </button>
        <button onClick={() => setInterviewedByMe(!interviewedByMe)}
          title="Candidates interviewed by a panel I was sitting on"
          className={`chip ${interviewedByMe ? "border-gold bg-gold/15 text-gold" : "border-edge text-muted"}`}>
          Interviewed by me
        </button>
        <select className="input !w-auto" value={reviewedByMe} onChange={(e) => setReviewedByMe(e.target.value)}>
          <option value="">Reviewed by me: any</option>
          <option value="yes">Reviewed by me</option>
          <option value="no">Not reviewed by me</option>
        </select>
        <div className="flex gap-1.5">
          {["green", "yellow", "red"].map((t) => (
            <button key={t} onClick={() => setFilterTag(filterTag === t ? "" : t)}
              className={`chip capitalize ${filterTag === t ? tagColor(t) + " ring-1 ring-current" : "border-edge text-muted"}`}>{t}</button>
          ))}
        </div>
        <span className="flex-1" />
        <select className="input !w-auto" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="newest">Sort: Registered</option>
          <option value="color">Sort: Final colour</option>
          <option value="ivcolour">Sort: Interview colour</option>
          <option value="avg">Sort: Avg score</option>
        </select>
        <button className="btn-ghost !px-3 !py-2.5 text-sm" title="Flip sort direction"
          onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}>
          {sortDir === "desc" ? "↓" : "↑"}
        </button>
        <div className="flex rounded-xl border border-edge overflow-hidden">
          {["cards", "sheet"].map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 py-2 text-sm capitalize ${mode === m ? "bg-gold/15 text-gold" : "text-muted"}`}>{m}</button>
          ))}
        </div>
        <span className="text-muted text-sm">{filtered.length} candidates</span>
      </div>

      {mode === "cards" ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((r) => {
            const iv = r.interviews[0];
            const tag = effTag(r);
            return (
              <button key={r.roll_no} onClick={() => setOpen(r.roll_no)}
                className={`card p-4 text-left fade-up hover:border-gold/50 transition-colors ${tag ? "border-l-4" : ""}`}
                style={tag ? { borderLeftColor: tag === "green" ? "#4ade80" : tag === "yellow" ? "#facc15" : "#f87171" } : {}}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{r.name}</p>
                    <p className="text-muted text-xs">{r.roll_no} · {r.hall || "—"}</p>
                  </div>
                  {tag && <span className={`chip capitalize ${tagColor(tag)}`}>{tag}</span>}
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {r.domains.slice(0, 3).map((d) => <span key={d} className="chip border-edge text-muted text-[10px]">{d}</span>)}
                  {r.domains.length > 3 && <span className="text-muted text-[10px]">+{r.domains.length - 3}</span>}
                </div>
                <div className="flex items-center gap-3 mt-3 text-xs text-muted">
                  <span>{iv ? `IV ${iv.score ?? "—"}/10` : "no interview"}</span>
                  <span className="truncate max-w-[120px]" title={(iv?.panelist_names || []).join(", ")}>{iv?.panel_name || ""}</span>
                  <span className="flex-1" />
                  <span>{r.tasks.length > 0 ? `📎 ${r.tasks.length}` : ""}</span>
                  <span className="text-gold/90">Avg {avgOf(r) != null ? avgOf(r).toFixed(1) : "--"}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs uppercase tracking-wider border-b border-edge">
                {["", "Roll", "Name", "Hall", "Domains", "Panel", "Panelists", "IV Score", "IV Tag", "Tasks", "Evals", "Final"].map((h) => <th key={h} className="px-3 py-3 text-left font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const iv = r.interviews[0];
                const tag = effTag(r);
                return (
                  <tr key={r.roll_no} onClick={() => setOpen(r.roll_no)}
                    className="border-b border-edge/50 hover:bg-panel cursor-pointer"
                    style={tag ? { background: tag === "green" ? "rgba(74,222,128,0.08)" : tag === "yellow" ? "rgba(250,204,21,0.08)" : "rgba(248,113,113,0.08)" } : {}}>
                    <td className="pl-3">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: tag === "green" ? "#4ade80" : tag === "yellow" ? "#facc15" : tag === "red" ? "#f87171" : "#2b2721" }} />
                    </td>
                    <td className="px-3 py-2.5 text-muted">{r.roll_no}</td>
                    <td className="px-3 py-2.5 font-medium">{r.name}</td>
                    <td className="px-3 py-2.5 text-muted">{r.hall || "—"}</td>
                    <td className="px-3 py-2.5 text-muted text-xs max-w-[180px] truncate">{r.domains.join(", ")}</td>
                    <td className="px-3 py-2.5 text-muted">{iv?.panel_name || "—"}</td>
                    <td className="px-3 py-2.5 text-muted text-xs max-w-[160px] truncate">{(iv?.panelist_names || []).join(", ") || "—"}</td>
                    <td className="px-3 py-2.5">{iv?.score ?? "—"}</td>
                    <td className="px-3 py-2.5">{iv?.tag && <span className={`chip capitalize ${tagColor(iv.tag)}`}>{iv.tag}</span>}</td>
                    <td className="px-3 py-2.5">{r.tasks.length || "—"}</td>
                    <td className="px-3 py-2.5">{r.evals.length ? (r.evals.reduce((s, e) => s + (Number(e.score) || 0), 0) / r.evals.length).toFixed(1) : "—"}</td>
                    <td className="px-3 py-2.5">{r.final_tag && <span className={`chip capitalize ${tagColor(r.final_tag)}`}>{r.final_tag}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openRow && (
        <div className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 sm:p-8" onClick={() => setOpen(null)}>
          <div className="card p-6 sm:p-8 max-w-2xl w-full my-8 fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl">{openRow.name}</h2>
                <p className="text-muted">{openRow.roll_no} · {openRow.hall || "—"} {openRow.department ? `· ${openRow.department}` : ""}</p>
                <p className="text-muted text-sm">{openRow.email} {openRow.phone ? `· ${openRow.phone}` : ""}</p>
              </div>
              <button className="text-muted hover:text-cream text-xl" onClick={() => setOpen(null)}>✕</button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {openRow.domains.map((d) => <span key={d} className="chip border-gold/40 text-gold/90">{d}</span>)}
            </div>
            {openRow.hobbies && <p className="text-sm mt-3 text-cream/80"><span className="text-muted">Hobbies:</span> {openRow.hobbies}</p>}
            {openRow.movie_love && <p className="text-sm mt-1 text-cream/80"><span className="text-muted">Loves:</span> {openRow.movie_love}</p>}
            {openRow.movie_hate && <p className="text-sm mt-1 text-cream/80"><span className="text-muted">Hates:</span> {openRow.movie_hate}</p>}
            {openRow.about_us && <p className="text-sm mt-1 text-cream/80"><span className="text-muted">On TFPS:</span> {openRow.about_us}</p>}
            {openRow.about && <p className="text-sm mt-1 text-cream/80"><span className="text-muted">About:</span> {openRow.about}</p>}
            {openRow.portfolio_link && <a className="text-gold text-sm hover:underline" href={openRow.portfolio_link} target="_blank" rel="noreferrer">Portfolio ↗</a>}

            <h3 className="font-display text-xl mt-6 mb-2">Interview</h3>
            {openRow.interviews.length === 0 && <p className="text-muted text-sm italic">Not interviewed yet.</p>}
            {openRow.interviews.map((iv) => (
              <div key={iv.id} className="bg-panel rounded-xl p-4 text-sm space-y-1">
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
            {openRow.ivNotes.length > 0 && (
              <div className="mt-2 space-y-2">
                {openRow.ivNotes.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 bg-panel rounded-xl p-3 text-sm">
                    <span className="chip border-edge text-muted shrink-0">{n.panelist}</span>
                    {n.score != null && <span className="chip border-gold/40 text-gold shrink-0">{n.score}/10</span>}
                    <p className="text-cream/80 flex-1">{n.feedback}</p>
                  </div>
                ))}
              </div>
            )}

            <h3 className="font-display text-xl mt-6 mb-2">Task Submissions</h3>
            {openRow.tasks.length === 0 && <p className="text-muted text-sm italic">Nothing submitted yet.</p>}
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

            <h3 className="font-display text-xl mt-6 mb-2">Evaluations</h3>
            {openRow.evals.map((e) => (
              <div key={e.id} className="flex items-start gap-3 bg-panel rounded-xl p-3 text-sm mb-2">
                <span className="chip border-edge text-muted">{e.evaluator}</span>
                {e.score != null && <span className="chip border-gold/40 text-gold">{e.score}/10</span>}
                <p className="text-cream/80 flex-1">{e.feedback}</p>
              </div>
            ))}
            <div className="bg-panel rounded-xl p-4 mt-2 space-y-3">
              {!taskEditing && <p className="text-yellow text-xs">Task reviews are locked by an admin — read-only.</p>}
              <div className="flex items-center gap-3">
                <span className="chip border-edge text-muted shrink-0">Reviewing as {session?.name}</span>
                <input className="input !w-28" type="number" step="0.5" min="0" max="10" placeholder="/10" disabled={!taskEditing} value={evalDraft.score} onChange={(e) => setEvalDraft({ ...evalDraft, score: e.target.value })} />
              </div>
              <textarea className="input min-h-[70px]" placeholder="Your feedback…" disabled={!taskEditing} value={evalDraft.feedback} onChange={(e) => setEvalDraft({ ...evalDraft, feedback: e.target.value })} />
              <button className="btn-ghost text-sm" disabled={!taskEditing} onClick={() => saveEval(openRow.roll_no)}>Save evaluation</button>
            </div>

            <div className="flex items-center gap-2 mt-6 pt-4 border-t border-edge">
              <span className="text-muted text-sm mr-2">Final status:</span>
              {["green", "yellow", "red"].map((t) => (
                <button key={t} disabled={!taskEditing} onClick={() => setFinalTag(openRow.roll_no, openRow.final_tag === t ? null : t)}
                  className={`chip capitalize ${openRow.final_tag === t ? tagColor(t) + " ring-1 ring-current" : "border-edge text-muted hover:text-cream"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function Page() {
  return <Guard><ReviewInner /></Guard>;
}
