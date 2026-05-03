import { RiskLevel } from "./types"

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  })
}

export function today(): string {
  return new Date().toISOString().split("T")[0]
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    "Submitted to Journal":       "#7A766E",
    "With Editor":                "#854F0B",
    "Under Review":               "#1A2744",
    "Required Reviews Complete":  "#3B3B8C",
    "Decision in Process":        "#5B2D8E",
    "Minor Revision":             "#7A3B00",
    "Major Revision":             "#922B21",
    "Revision Submitted":         "#0F6E56",
    "Accepted":                   "#3B6D11",
    "Rejected":                   "#922B21",
    "Withdrawn":                  "#7A766E",
  }
  return map[status] ?? "#4A4740"
}

export function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {
    const el = document.createElement("textarea")
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand("copy")
    document.body.removeChild(el)
  })
}

export const RISK_ORDER: Record<RiskLevel, number> = {
  severe: 0, high: 1, medium: 2, low: 3,
}