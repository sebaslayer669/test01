import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { loadEnv, getConfig } from "./lib/env.js"
import { getProjectRoot } from "./lib/runtime.js"
import { chatPayload, healthPayload, sessionPayload } from "./api-app.js"

const ROOT = getProjectRoot()
loadEnv(ROOT)
const config = getConfig()

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  })
  res.end(payload)
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (c: Buffer) => chunks.push(c))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

function contentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8"
    case ".js":
      return "text/javascript; charset=utf-8"
    case ".css":
      return "text/css; charset=utf-8"
    case ".json":
      return "application/json; charset=utf-8"
    case ".svg":
      return "image/svg+xml"
    default:
      return "application/octet-stream"
  }
}

function serveStatic(res: http.ServerResponse, urlPath: string): void {
  // Preferir public/ (Vercel) y caer a web/ (desarrollo local).
  const roots = [path.join(ROOT, "public"), path.join(ROOT, "web")]
  let rel = urlPath === "/" ? "/index.html" : urlPath
  rel = decodeURIComponent(rel.split("?")[0] ?? rel)

  for (const webRoot of roots) {
    const filePath = path.normalize(path.join(webRoot, rel))
    if (!filePath.startsWith(webRoot)) continue
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) continue
    const data = fs.readFileSync(filePath)
    res.writeHead(200, { "Content-Type": contentType(filePath) })
    res.end(data)
    return
  }

  json(res, 404, { ok: false, error: "Not found" })
}

const server = http.createServer(async (req, res) => {
  const method = req.method ?? "GET"
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    })
    res.end()
    return
  }

  try {
    if (method === "GET" && url.pathname === "/api/health") {
      json(res, 200, healthPayload())
      return
    }

    if (method === "GET" && url.pathname.startsWith("/api/sessions/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/sessions/".length))
      const result = sessionPayload(id)
      json(res, result.status, result.body)
      return
    }

    if (method === "POST" && url.pathname === "/api/chat") {
      const raw = await readBody(req)
      let body: { sessionId?: string; message?: string }
      try {
        body = JSON.parse(raw) as { sessionId?: string; message?: string }
      } catch {
        json(res, 400, { ok: false, error: "JSON inválido" })
        return
      }
      const result = await chatPayload(body)
      json(res, result.status, result.body)
      return
    }

    if (method === "GET") {
      serveStatic(res, url.pathname)
      return
    }

    json(res, 404, { ok: false, error: "Ruta no encontrada" })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    json(res, 500, { ok: false, error: msg })
  }
})

server.listen(config.port, () => {
  console.log(`Servidor en http://localhost:${config.port}`)
  console.log(`Health: http://localhost:${config.port}/api/health`)
  if (config.provider === "interno") {
    console.log("Proveedor: interno (sin tokens / sin OpenAI)")
  } else {
    console.log(
      `Proveedor: openai · modelo ${config.model} · clave: ${Boolean(config.apiKey)}`,
    )
  }
})
