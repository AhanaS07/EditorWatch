import { RiskLevel, RISK_LABELS } from "@/lib/types"

export default function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`risk-${level}`} style={{
      fontSize: 11, padding: "3px 9px", borderRadius: 20,
      letterSpacing: "0.05em", fontWeight: 500, whiteSpace: "nowrap",
    }}>
      {RISK_LABELS[level].toUpperCase()}
    </span>
  )
}