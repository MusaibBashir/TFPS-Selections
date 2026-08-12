import Link from "next/link";

const SOCIALS = [
  {
    href: "https://www.instagram.com/tfps.iitkgp/",
    label: "Instagram",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-6 h-6">
        <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    )
  },
  {
    href: "https://www.facebook.com/tfps.iitkgp/",
    label: "Facebook",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h3l1-3h-4v-2c0-.6.4-1 1-1z" />
      </svg>
    )
  },
  {
    href: "https://www.youtube.com/@TFPSIITKgp",
    label: "YouTube",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-6 h-6">
        <rect x="2" y="5" width="20" height="14" rx="4" />
        <path d="M10.5 9.2l5 2.8-5 2.8V9.2z" fill="currentColor" stroke="none" />
      </svg>
    )
  },
  {
    href: "mailto:tfps.iitkgp@gmail.com",
    label: "Email us",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-6 h-6">
        <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
        <path d="M3.5 7l8.5 6 8.5-6" />
      </svg>
    )
  }
];

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <p className="fade-up tracking-[0.4em] text-gold text-xs sm:text-sm uppercase mb-6">
          Technology Filmmaking and Photography Society
        </p>
        <h1 className="fade-up font-display text-5xl sm:text-7xl md:text-8xl leading-[1.05] max-w-4xl" style={{ animationDelay: "0.1s" }}>
          Every frame<br />
          <span className="italic text-gold">tells a story.</span>
        </h1>
        <p className="fade-up text-muted max-w-xl mt-6 text-base sm:text-lg" style={{ animationDelay: "0.2s" }}>
          Selections 2026 are open. Join the crew behind the lens — photography,
          cinema, editing, design and more.
        </p>

        <div className="fade-up flex flex-col sm:flex-row gap-4 mt-10" style={{ animationDelay: "0.3s" }}>
          <Link href="/register" className="btn-gold text-lg px-8">Register for Selections</Link>
          <Link href="/submit" className="btn-ghost text-lg px-8">Submit Your Task</Link>
        </div>

        <a href="https://docs.google.com/document/d/1aBK18nj4wxiTqk6z8hFYViVuymifKj2hbtXnY6O7GBw/edit?usp=sharing"
          target="_blank" rel="noopener noreferrer"
          className="fade-up btn-ghost mt-4 text-base border-gold/40 text-gold hover:bg-gold/10"
          style={{ animationDelay: "0.35s" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-5 h-5">
            <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
            <path d="M14 3v5h5M9 13h6M9 17h6" />
          </svg>
          Task Resources
        </a>

        <p className="fade-up text-sm sm:text-base mt-6 text-cream/90" style={{ animationDelay: "0.4s" }}>
          Task submission deadline: <span className="text-gold font-semibold">18th August</span>
        </p>

        <div className="fade-up flex items-center gap-4 mt-12" style={{ animationDelay: "0.45s" }}>
          {SOCIALS.map((s) => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" title={s.label} aria-label={s.label}
              className="w-12 h-12 rounded-full border border-edge text-muted flex items-center justify-center transition-all hover:border-gold hover:text-gold hover:bg-gold/10 hover:-translate-y-0.5">
              {s.icon}
            </a>
          ))}
        </div>
        <a href="mailto:tfps.iitkgp@gmail.com" className="fade-up text-muted text-sm mt-3 hover:text-gold transition-colors" style={{ animationDelay: "0.5s" }}>
          tfps.iitkgp@gmail.com
        </a>
      </div>

      <footer className="py-6 text-center text-muted text-xs">
        <Link href="/login" className="hover:text-gold transition-colors">Crew Login</Link>
        <span className="mx-2">·</span> TFPS, IIT Kharagpur
      </footer>
    </main>
  );
}
