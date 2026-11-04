import type { VercelRequest, VercelResponse } from "@vercel/node"

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" })
    return
  }
  try {
    const { sessionPayload } = await import("../../src/api-app.js")
    const id = String(req.query.id ?? "")
    const result = sessionPayload(id)
    res.status(result.status).json(result.body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ ok: false, error: message })
  }
}
