import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.statusCode = 204
    res.end()
    return
  }
  if (req.method !== "POST") {
    res.statusCode = 405
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.end(JSON.stringify({ ok: false, error: "Method not allowed" }))
    return
  }

  try {
    const { chatPayload } = require("../dist/api-app.js")
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}
    const result = await chatPayload(body)
    res.statusCode = result.status
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.end(JSON.stringify(result.body))
  } catch (err) {
    console.error("[api/chat]", err)
    res.statusCode = 500
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.end(
      JSON.stringify({
        ok: false,
        error: String(err && err.message ? err.message : err),
      }),
    )
  }
}
