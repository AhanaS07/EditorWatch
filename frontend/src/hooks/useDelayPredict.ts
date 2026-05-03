"use client"
import { useState, useCallback } from "react"
import { SubmissionPredictResponse, SubmissionRecord } from "@/lib/types"
import { listSubmissions, getSubmission, createSubmission, updateSubmissionStatus, deleteSubmission } from "@/lib/api"
import { CreateSubmissionPayload, UpdateStatusPayload } from "@/lib/types"

export function useDelayPredict() {
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([])
  const [enriched, setEnriched] = useState<SubmissionPredictResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const loadAll = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const subs = await listSubmissions()
      setSubmissions(subs)
      const results = await Promise.allSettled(subs.map(s => getSubmission(s.id)))
      setEnriched(
        results
          .filter((r): r is PromiseFulfilledResult<SubmissionPredictResponse> => r.status === "fulfilled")
          .map(r => r.value)
      )
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const create = useCallback(async (payload: CreateSubmissionPayload) => {
    const result = await createSubmission(payload)
    await loadAll()
    return result
  }, [loadAll])

  const updateStatus = useCallback(async (id: string, payload: UpdateStatusPayload) => {
    const result = await updateSubmissionStatus(id, payload)
    await loadAll()
    return result
  }, [loadAll])

  const remove = useCallback(async (id: string) => {
    await deleteSubmission(id)
    await loadAll()
  }, [loadAll])

  const getOne = useCallback((id: string) => {
    return enriched.find(e => e.submission.id === id) ?? null
  }, [enriched])

  return { submissions, enriched, loading, error, loadAll, create, updateStatus, remove, getOne }
}