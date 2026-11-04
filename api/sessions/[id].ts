import type { VercelRequest, VercelResponse } from "@vercel/node"
import { sessionPayload } from "../../src/api-app.js"

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" })
    return
  }
  const id = String(req.query.id ?? "")
  const result = sessionPayload(id)
  res.status(result.status).json(result.body)
}
