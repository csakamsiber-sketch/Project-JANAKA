type StatCardProps = {
  label: string;
  value: string;
  delta?: string;
  accent: string;
};

export function StatCard({ label, value, delta, accent }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-slate-950/20">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
        <span>{label}</span>
        {delta ? <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${accent}`}>{delta}</span> : null}
      </div>
      <div className="mt-5 text-3xl font-semibold text-white">{value}</div>
    </div>
  );
}
