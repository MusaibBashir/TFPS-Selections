"use client";
import { useState } from "react";

// Quick 15-min slot picker: 7 date chips + tap-a-time grid. No calendar, no clock.
const TIMES = [];
for (let t = 18 * 60 + 30; t <= 22 * 60; t += 15) TIMES.push([Math.floor(t / 60), t % 60]);

export default function SlotPicker({ value, onChange, compact = false }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(null);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const label = value
    ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    : "—";

  function pick(h, m) {
    const d = new Date(day);
    d.setHours(h, m, 0, 0);
    onChange(d.toISOString());
    setOpen(false); setDay(null);
  }

  return (
    <div className="relative inline-block">
      <button type="button"
        className={`chip ${value ? "border-gold/50 text-gold" : "border-edge text-muted"} hover:border-gold ${compact ? "text-[11px]" : ""}`}
        onClick={() => { setOpen(!open); setDay(null); }}>
        {label}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 right-0 card p-3 w-[300px] shadow-xl fade-up">
          {!day ? (
            <>
              <p className="text-muted text-xs mb-2">Pick a day</p>
              <div className="grid grid-cols-2 gap-1.5">
                {days.map((d) => (
                  <button key={d.toISOString()} type="button" className="btn-ghost !py-1.5 text-xs"
                    onClick={() => setDay(d)}>
                    {d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                  </button>
                ))}
              </div>
              {value && (
                <button type="button" className="text-red text-xs mt-2 hover:underline w-full"
                  onClick={() => { onChange(null); setOpen(false); }}>
                  Clear slot
                </button>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <button type="button" className="text-muted text-xs hover:text-gold" onClick={() => setDay(null)}>&larr; day</button>
                <p className="text-xs text-gold">{day.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</p>
              </div>
              <div className="grid grid-cols-4 gap-1 max-h-56 overflow-y-auto">
                {TIMES.map(([h, m]) => (
                  <button key={`${h}${m}`} type="button"
                    className="border border-edge rounded-md py-1 text-[11px] text-cream hover:border-gold hover:text-gold"
                    onClick={() => pick(h, m)}>
                    {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
