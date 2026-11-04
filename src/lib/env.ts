import fs from "node:fs"
import path from "node:path"

/** Carga variables desde `.env` en la raíz sin sobrescribir las ya definidas en el entorno. */
export function loadEnv(directory: string = process.cwd()): void {
  const envPath = path.join(directory, ".env")
  if (!fs.existsSync(envPath)) return
  const text = fs.readFileSync(envPath, "utf8")
  for (const line of text.split(/\r?\n/)) {
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
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

export type LlmProvider = "interno" | "openai"

export function getConfig() {
  const raw = (process.env.LLM_PROVIDER ?? "interno").toLowerCase()
  const provider: LlmProvider = raw === "openai" ? "openai" : "interno"
  return {
    provider,
    apiKey: process.env.OPENAI_API_KEY ?? "",
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    port: Number(process.env.PORT ?? "3000"),
    maxToolIterations: Number(process.env.MAX_TOOL_ITERATIONS ?? "25"),
    maxTokensPerSession: Number(process.env.MAX_TOKENS_PER_SESSION ?? "80000"),
  }
}
