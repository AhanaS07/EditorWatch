import { RiskLevel } from "@/lib/types"

export default function ProgressBar({ pct, riskLevel, label }: {
  pct: number; riskLevel: RiskLevel; label?: string
}) {
  const clamped = Math.min(Math.round(pct), 100)
  return (
    <div>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between",
          fontSize: 11, color: "var(--ink-muted)", marginBottom: 5 }}>
          <span>{label}</span><span>{clamped}%</span>
        </div>
      )}
      <div className="progress-track">
        <div className={`progress-fill progress-${riskLevel}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}