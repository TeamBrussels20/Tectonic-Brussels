import { Link } from "@tanstack/react-router"

export function EmployeeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" lang="en">
      <header className="bg-brand text-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link to="/advisor" className="flex items-center gap-3">
            <img src="/kbc.svg" alt="" className="h-7 rounded bg-white p-0.5" />
            <span className="font-semibold">Advisor Workspace</span>
          </Link>
          <span className="hidden rounded bg-white/15 px-2 py-0.5 text-xs sm:inline">AI financial advisor</span>
          <span className="ml-auto hidden text-sm text-white/70 sm:inline">Employee view · demo data</span>
          <Link to="/" className="ml-auto rounded bg-white/15 px-2.5 py-1 text-sm hover:bg-white/25 sm:ml-0">
            Customer app
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode
  tone?: "neutral" | "brand" | "accent"
}) {
  const tones = {
    neutral: "bg-page text-ink-2 border-line",
    brand: "bg-brand-light text-brand border-transparent",
    accent: "bg-accent/10 text-brand border-accent/30",
  }
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function HealthScore({ score, size = "sm" }: { score: number | null; size?: "sm" | "lg" }) {
  if (score == null) return <span className="text-sm text-ink-3">Not assessed</span>
  const [label, color, icon] =
    score >= 70
      ? ["Healthy", "var(--color-good)", "●"]
      : score >= 45
        ? ["Needs attention", "var(--color-warning)", "▲"]
        : ["At risk", "var(--color-critical)", "■"]
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={size === "lg" ? "text-5xl font-semibold" : "font-semibold"}>{score}</span>
      <span className="text-sm text-ink-2">
        <span style={{ color }}>{icon}</span> {label}
      </span>
    </span>
  )
}
