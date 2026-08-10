"use client";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Searchable single-select combobox.
 *
 * Typing narrows the list progressively: "A" -> "Al" -> "Alo" ...
 * Matches are ranked so the most literal ones surface first:
 *   0. label starts with the query        ("Al" -> "Alok Kr. Gupta")
 *   1. any word in the label starts with it ("Gu" -> "Alok Kr. Gupta")
 *   2. label contains it anywhere
 *   3. only the hint matches              (roll number / domains)
 *
 * props:
 *   options     [{ value, label, hint }]
 *   onSelect    (value) => void
 *   placeholder string
 *   emptyText   string shown when nothing matches
 *   maxVisible  cap on rendered rows (default 50)
 */
export default function Combobox({
  options = [],
  onSelect,
  placeholder = "Search…",
  emptyText = "No matches",
  maxVisible = 50
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;

    const scored = [];
    for (const opt of options) {
      const label = (opt.label || "").toLowerCase();
      const hint = (opt.hint || "").toLowerCase();

      let score = -1;
      if (label.startsWith(q)) score = 0;
      else if (label.split(/[\s.\-_]+/).some((w) => w.startsWith(q))) score = 1;
      else if (label.includes(q)) score = 2;
      else if (hint.includes(q)) score = 3;

      if (score >= 0) scored.push({ opt, score });
    }

    scored.sort(
      (a, b) => a.score - b.score || a.opt.label.localeCompare(b.opt.label)
    );
    return scored.map((s) => s.opt);
  }, [options, query]);

  const visible = matches.slice(0, maxVisible);
  const hiddenCount = matches.length - visible.length;

  // reset highlight whenever the result set changes
  useEffect(() => setActive(0), [query]);

  // close on outside click
  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // keep the highlighted row in view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${active}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function close() {
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  function choose(opt) {
    if (!opt) return;
    onSelect?.(opt.value);
    close();
    inputRef.current?.blur();
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown" || (e.key === "Tab" && open && visible.length)) {
      if (e.key === "Tab") return close();
      e.preventDefault();
      if (!open) return setOpen(true);
      setActive((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open) choose(visible[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        className="input !py-2 text-sm"
        role="combobox"
        aria-expanded={open}
        aria-controls="combobox-list"
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {open && (
        <div
          id="combobox-list"
          ref={listRef}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-edge bg-panel shadow-xl shadow-black/50"
        >
          {visible.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              data-idx={i}
              role="option"
              aria-selected={i === active}
              className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm transition-colors ${
                i === active ? "bg-gold/15 text-gold" : "text-cream hover:bg-edge/60"
              }`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(opt)}
            >
              <span className="truncate">{opt.label}</span>
              {opt.hint && (
                <span className="ml-auto shrink-0 text-[11px] text-muted">{opt.hint}</span>
              )}
            </button>
          ))}

          {visible.length === 0 && (
            <p className="px-3 py-3 text-sm italic text-muted">{emptyText}</p>
          )}

          {hiddenCount > 0 && (
            <p className="border-t border-edge px-3 py-1.5 text-[11px] text-muted">
              +{hiddenCount} more — keep typing to narrow
            </p>
          )}
        </div>
      )}
    </div>
  );
}
