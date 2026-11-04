import path from "node:path"
import fs from "node:fs"
import { ensureDir, outCasoDir } from "./paths.js"

export type LogEntry = {
  ts: string
  herramienta: string
  ok: boolean
  resumen: string
  sessionId?: string
}

export function appendCasoLog(
  directory: string,
  caso: string,
  entry: Omit<LogEntry, "ts"> & { ts?: string },
): void {
  const dir = outCasoDir(directory, caso)
  ensureDir(dir)
  const line = JSON.stringify({
    ts: entry.ts ?? new Date().toISOString(),
    herramienta: entry.herramienta,
    ok: entry.ok,
    resumen: entry.resumen,
    ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
  })
  fs.appendFileSync(path.join(dir, "log.jsonl"), line + "\n", "utf8")
}
