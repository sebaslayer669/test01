import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  if (req.method !== "GET") {
    res.statusCode = 405
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.end(JSON.stringify({ ok: false, error: "Method not allowed" }))
    return
  }
  try {
    const { sessionPayload } = require("../../dist/api-app.js")
    const id = String((req.query && req.query.id) || "")
    const result = sessionPayload(id)
    res.statusCode = result.status
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.end(JSON.stringify(result.body))
  } catch (err) {
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
