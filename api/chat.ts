import type { VercelRequest, VercelResponse } from "@vercel/node"
import { chatPayload } from "../src/api-app.js"

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" })
    return
  }

  try {
    const body =
      typeof req.body === "string"
        ? (JSON.parse(req.body) as { sessionId?: string; message?: string })
        : ((req.body ?? {}) as { sessionId?: string; message?: string })
    const result = await chatPayload(body)
    res.status(result.status).json(result.body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ ok: false, error: message })
  }
}
