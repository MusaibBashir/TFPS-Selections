import Link from "next/link";

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
      </div>
      <footer className="py-6 text-center text-muted text-xs">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 mb-2">
          <a href="https://www.youtube.com/@TFPSIITKgp" target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">YouTube</a>
          <span>·</span>
          <a href="https://www.instagram.com/tfps.iitkgp/" target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">Instagram</a>
          <span>·</span>
          <a href="https://www.facebook.com/tfps.iitkgp/" target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">Facebook</a>
          <span>·</span>
          <a href="mailto:tfps.iitkgp@gmail.com" className="hover:text-gold transition-colors">tfps.iitkgp@gmail.com</a>
        </div>
        <Link href="/login" className="hover:text-gold transition-colors">Crew Login</Link>
        <span className="mx-2">·</span> TFPS, IIT Kharagpur
      </footer>
    </main>
  );
}
