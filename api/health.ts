import type { VercelRequest, VercelResponse } from "@vercel/node"
import fs from "node:fs"
import path from "node:path"
import { loadEnv, getConfig } from "../src/lib/env.js"
import { getProjectRoot, getOutRoot, isServerless } from "../src/lib/runtime.js"

export const config = {
  includeFiles: ["fixtures/**"],
}

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  try {
    const root = getProjectRoot()
    loadEnv(root)
    const cfg = getConfig()
    const fixtures = path.join(root, "fixtures", "reto-01", "casos")
    const casos = fs.existsSync(fixtures)
      ? fs
          .readdirSync(fixtures)
          .filter((n) => fs.statSync(path.join(fixtures, n)).isDirectory())
      : []

    res.status(200).json({
      ok: true,
      provider: cfg.provider,
      model: cfg.provider === "interno" ? "agente-interno" : cfg.model,
      hasKey: cfg.provider === "interno" ? true : Boolean(cfg.apiKey),
      runtime: process.env.VERCEL ? "vercel" : "local",
      diagnostics: {
        cwd: process.cwd(),
        projectRoot: root,
        outRoot: getOutRoot(),
        serverless: isServerless(),
        fixturesExists: fs.existsSync(fixtures),
        casos,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[api/health]", message)
    res.status(500).json({ ok: false, error: message })
  }
}
