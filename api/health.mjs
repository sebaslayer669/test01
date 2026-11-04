import fs from "node:fs"
import path from "node:path"

function getProjectRoot() {
  const candidates = [process.cwd(), path.join(process.cwd(), ".."), "/var/task"]
  for (const start of candidates) {
    let dir = path.resolve(start)
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, "fixtures", "reto-01", "casos"))) return dir
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return process.cwd()
}

function loadEnv(root) {
  const envPath = path.join(root, ".env")
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

export default function handler(_req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  try {
    const root = getProjectRoot()
    loadEnv(root)
    const provider =
      (process.env.LLM_PROVIDER || "interno").toLowerCase() === "openai"
        ? "openai"
        : "interno"
    const fixtures = path.join(root, "fixtures", "reto-01", "casos")
    const casos = fs.existsSync(fixtures)
      ? fs
          .readdirSync(fixtures)
          .filter((n) => fs.statSync(path.join(fixtures, n)).isDirectory())
      : []

    res.statusCode = 200
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.end(
      JSON.stringify({
        ok: true,
        provider,
        model:
          provider === "interno"
            ? "agente-interno"
            : process.env.OPENAI_MODEL || "gpt-4o-mini",
        hasKey:
          provider === "interno" ? true : Boolean(process.env.OPENAI_API_KEY),
        runtime: process.env.VERCEL ? "vercel" : "local",
        diagnostics: {
          cwd: process.cwd(),
          projectRoot: root,
          fixturesExists: fs.existsSync(fixtures),
          casos,
        },
      }),
    )
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
