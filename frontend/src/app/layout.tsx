import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "EditorWatch — T&F Peer Review Tracker",
  description: "Track peer review delays for Taylor & Francis submissions",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "var(--linen)" }}>
        {children}
      </body>
    </html>
  )
}