import type { VercelRequest, VercelResponse } from "@vercel/node"
import { healthPayload } from "../src/api-app.js"
import { getProjectRoot, getOutRoot, isServerless } from "../src/lib/runtime.js"
import fs from "node:fs"
import path from "node:path"

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  try {
    const root = getProjectRoot()
    const fixtures = path.join(root, "fixtures", "reto-01", "casos")
    res.status(200).json({
      ...healthPayload(),
      diagnostics: {
        cwd: process.cwd(),
        projectRoot: root,
        outRoot: getOutRoot(),
        serverless: isServerless(),
        fixturesExists: fs.existsSync(fixtures),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ ok: false, error: message })
  }
}
