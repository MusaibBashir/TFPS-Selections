"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase, getSession, clearSession, getMode } from "@/lib/supabase";

const NAV = [
  { href: "/distribute", label: "Distributor" },
  { href: "/panels", label: "Panels", admin: true },
  { href: "/members", label: "Members", admin: true },
  { href: "/registrations", label: "Registrations", admin: true },
  { href: "/review", label: "Review Board" },
  { href: "/canvas", label: "Canvas", admin: true }
];

export default function Guard({ children, admin = false }) {
  const [session, setSessionState] = useState(undefined);
  const [regCount, setRegCount] = useState(null);
  const [todayCount, setTodayCount] = useState(null);
  const [totalCount, setTotalCount] = useState(null);
  const [mode, setMode] = useState("interview"); // interview | task
  const [submittedCount, setSubmittedCount] = useState(null);
  const [reviewedCount, setReviewedCount] = useState(null);
  const [panels, setPanels] = useState([]);
  const [mySeat, setMySeat] = useState(null); // my panelists row
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const s = getSession();
    if (!s) router.replace("/login");
    else if (admin && s.role !== "admin") router.replace("/distribute");
    else setSessionState(s);
  }, [admin, router]);

  const loadSeat = useCallback(async (s) => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const [p, seat, cnt, iv, ivAll, subs, evs, m] = await Promise.all([
      supabase.from("panels").select("*").neq("status", "closed").order("created_at"),
      supabase.from("panelists").select("*").eq("member_roll", s.roll_no).maybeSingle(),
      supabase.from("candidates").select("*", { count: "exact", head: true }),
      supabase.from("interviews").select("*", { count: "exact", head: true }).gte("ended_at", dayStart.toISOString()),
      supabase.from("interviews").select("*", { count: "exact", head: true }).not("ended_at", "is", null),
      supabase.from("task_submissions").select("roll_no"),
      supabase.from("evaluations").select("roll_no"),
      getMode()
    ]);
    setPanels((p.data || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
    setMySeat(seat.data || null);
    setRegCount(cnt.count);
    setTodayCount(iv.count);
    setTotalCount(ivAll.count);
    setMode(m);

    // Count people, not rows — someone can submit or be reviewed more than once.
    // "Reviewed" is measured against submitters so the two numbers are comparable.
    const submitters = new Set((subs.data || []).map((r) => r.roll_no));
    const reviewedSet = new Set((evs.data || []).map((r) => r.roll_no));
    setSubmittedCount(submitters.size);
    setReviewedCount([...submitters].filter((r) => reviewedSet.has(r)).length);
  }, []);

  useEffect(() => {
    if (!session) return;
    loadSeat(session);
    const ch = supabase.channel("guard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "candidates" }, () => loadSeat(session))
      .on("postgres_changes", { event: "*", schema: "public", table: "panelists" }, () => loadSeat(session))
      .on("postgres_changes", { event: "*", schema: "public", table: "panels" }, () => loadSeat(session))
      .on("postgres_changes", { event: "*", schema: "public", table: "interviews" }, () => loadSeat(session))
      .on("postgres_changes", { event: "*", schema: "public", table: "task_submissions" }, () => loadSeat(session))
      .on("postgres_changes", { event: "*", schema: "public", table: "evaluations" }, () => loadSeat(session))
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => loadSeat(session))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [session, loadSeat]);

  async function switchPanel(panelId) {
    if (!session) return;
    if (!panelId) {
      if (mySeat) await supabase.from("panelists").delete().eq("id", mySeat.id);
    } else if (mySeat) {
      await supabase.from("panelists").update({ panel_id: panelId }).eq("id", mySeat.id);
    } else {
      const { data: member } = await supabase.from("members").select("*").eq("roll_no", session.roll_no).maybeSingle();
      await supabase.from("panelists").insert({
        name: session.name,
        domains: member?.domains || [],
        panel_id: panelId,
        member_roll: session.roll_no
      });
    }
    loadSeat(session);
  }

  if (!session) return <main className="min-h-screen flex items-center justify-center text-muted">Loading…</main>;

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-40 bg-ink/90 backdrop-blur border-b border-edge px-4 sm:px-6 py-3 flex items-center gap-1 overflow-x-auto">
        <Link href="/" className="font-display text-gold text-lg mr-3 whitespace-nowrap">TFPS</Link>
        {NAV.filter((n) => !n.admin || session.role === "admin").map((n) => (
          <Link key={n.href} href={n.href}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${pathname.startsWith(n.href) ? "bg-gold/15 text-gold" : "text-muted hover:text-cream"}`}>
            {n.label}
          </Link>
        ))}
        <div className="flex-1" />
        {mode === "task" ? (
          <>
            {submittedCount != null && (
              <span className="chip border-edge text-cream mr-2 whitespace-nowrap" title="Candidates who have submitted their task">
                {submittedCount} submitted
              </span>
            )}
            {reviewedCount != null && (
              <span className="chip border-gold/40 text-gold mr-2 whitespace-nowrap" title="Submitted tasks reviewed by at least one member">
                {reviewedCount} reviewed
              </span>
            )}
          </>
        ) : (
          <>
            {todayCount != null && (
              <span className="chip border-edge text-cream mr-2 whitespace-nowrap" title="Interviews completed today">
                {todayCount} today
              </span>
            )}
            {totalCount != null && session.role === "admin" && (
              <span className="chip border-gold/40 text-gold mr-2 whitespace-nowrap" title="Total interviews completed">
                {totalCount} interviews
              </span>
            )}
          </>
        )}
        {regCount != null && session.role === "admin" && (
          <span className="chip border-gold/40 text-gold mr-2 whitespace-nowrap" title="Total registrations">
            {regCount} registered
          </span>
        )}
        {/* Panels are an interview-phase concern — hidden once we move to task review. */}
        {mode !== "task" && (
          <>
            <select
              className="bg-panel border border-edge rounded-lg text-xs text-cream px-2 py-1.5 mr-2 outline-none cursor-pointer max-w-[130px]"
              value={mySeat?.panel_id || ""}
              onChange={(e) => switchPanel(e.target.value)}
              title="Your panel — switch anytime">
              <option value="">No panel</option>
              {panels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {mySeat && (
              <Link href={`/panel/${mySeat.panel_id}`} className="chip border-gold/40 text-gold mr-2 whitespace-nowrap hover:bg-gold/10">
                My panel →
              </Link>
            )}
          </>
        )}
        <span className="chip border-edge text-muted mr-2 whitespace-nowrap hidden sm:inline-flex">
          {session.name} · {session.role}
        </span>
        <button className="text-muted text-sm hover:text-red" onClick={() => { clearSession(); router.push("/login"); }}>Logout</button>
      </nav>
      {children}
    </div>
  );
}
