import fs from "node:fs"
import path from "node:path"
import type { ChatMessage } from "./llm/adapter.js"
import { getWritableRoot, isServerless } from "./lib/runtime.js"

export type VisibleToolCall = {
  name: string
  arguments: unknown
  resultSummary: string
  ok: boolean
}

export type SessionTurn = {
  role: "user" | "assistant" | "tool"
  content: string
  toolCalls?: VisibleToolCall[]
  needsConfirmation?: boolean
  at: string
}

export type Session = {
  id: string
  messages: ChatMessage[]
  turns: SessionTurn[]
  tokenUsage: number
  awaitingConfirmation: boolean
  /** Último caso procesado (agente interno). */
  lastCaso?: string
  createdAt: string
  updatedAt: string
}

const sessions = new Map<string, Session>()

function sessionsDir(): string {
  const dir = path.join(getWritableRoot(), "sessions")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function sessionFile(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "_")
  return path.join(sessionsDir(), `${safe}.json`)
}

function loadFromDisk(id: string): Session | undefined {
  if (!isServerless() && process.env.SESSION_STORE !== "fs") return undefined
  try {
    const file = sessionFile(id)
    if (!fs.existsSync(file)) return undefined
    return JSON.parse(fs.readFileSync(file, "utf8")) as Session
  } catch {
    return undefined
  }
}

export function saveSession(session: Session): void {
  sessions.set(session.id, session)
  if (!isServerless() && process.env.SESSION_STORE !== "fs") return
  try {
    fs.writeFileSync(sessionFile(session.id), JSON.stringify(session), "utf8")
  } catch {
    /* en local puro no es crítico */
  }
}

export function getOrCreateSession(id: string): Session {
  const existing = sessions.get(id) ?? loadFromDisk(id)
  if (existing) {
    sessions.set(id, existing)
    return existing
  }
  const now = new Date().toISOString()
  const session: Session = {
    id,
    messages: [],
    turns: [],
    tokenUsage: 0,
    awaitingConfirmation: false,
    createdAt: now,
    updatedAt: now,
  }
  saveSession(session)
  return session
}

export function getSession(id: string): Session | undefined {
  const mem = sessions.get(id)
  if (mem) return mem
  const disk = loadFromDisk(id)
  if (disk) sessions.set(id, disk)
  return disk
}
