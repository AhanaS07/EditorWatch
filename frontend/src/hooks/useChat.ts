"use client"
import { useState } from "react"
import { chat, generateNudge } from "@/lib/api"

export function useChat() {
  const [response, setResponse] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const ask = async (message: string, context?: object) => {
    setLoading(true); setError(""); setResponse("")
    try {
      const res = await chat(message, context)
      setResponse(res.response)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const nudge = async (tone: string, context: object) => {
    setLoading(true); setError(""); setResponse("")
    try {
      const res = await generateNudge(tone, context)
      setResponse(res.response)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return { response, loading, error, ask, nudge, setResponse }
}