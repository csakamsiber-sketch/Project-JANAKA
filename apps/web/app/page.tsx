const featureBlocks = [
  'Application governance',
  'Verification workflows',
  'Threat monitoring',
  'Security reporting',
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-lg font-bold text-cyan-300">J</div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">JAMUS</div>
              <div className="text-sm font-semibold">KALIMASADA</div>
            </div>
          </div>
          <a href="/login" className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20">Login</a>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.18),transparent_25%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-20 text-center lg:py-28">
          <div className="mb-6 inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
            Cyber assurance platform
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Secure operations without the noise.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-slate-300 md:text-lg">
            A focused control plane for application governance, verification coordination, and security reporting.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a href="/login" className="rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400">Enter console</a>
            <a href="#overview" className="rounded-xl border border-slate-700 bg-slate-900/80 px-6 py-3 font-semibold text-white transition hover:border-slate-500">Overview</a>
          </div>
        </div>
      </section>

      <section id="overview" className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featureBlocks.map((item) => (
            <div key={item} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-left shadow-[0_0_35px_rgba(15,23,42,0.5)]">
              <div className="mb-4 h-10 w-10 rounded-xl border border-cyan-500/30 bg-cyan-500/10" />
              <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Module</div>
              <h2 className="mt-3 text-xl font-semibold text-white">{item}</h2>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
