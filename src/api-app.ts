import { loadEnv, getConfig } from "./lib/env.js"
import { getProjectRoot } from "./lib/runtime.js"
import { getOrCreateSession, getSession, saveSession } from "./sessions.js"

const ROOT = getProjectRoot()
loadEnv(ROOT)

export function healthPayload() {
  const config = getConfig()
  return {
    ok: true,
    provider: config.provider,
    model: config.provider === "interno" ? "agente-interno" : config.model,
    hasKey: config.provider === "interno" ? true : Boolean(config.apiKey),
    runtime: process.env.VERCEL ? "vercel" : "local",
  }
}

export function sessionPayload(id: string) {
  const session = getSession(id)
  if (!session) {
    return { status: 404 as const, body: { ok: false, error: "Sesión no encontrada" } }
  }
  return {
    status: 200 as const,
    body: {
      id: session.id,
      turns: session.turns,
      tokenUsage: session.tokenUsage,
      awaitingConfirmation: session.awaitingConfirmation,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
  }
}

export async function chatPayload(input: {
  sessionId?: string
  message?: string
}) {
  const config = getConfig()
  if (config.provider === "openai" && !config.apiKey) {
    return {
      status: 503 as const,
      body: {
        ok: false,
        error:
          "Falta OPENAI_API_KEY (o usa LLM_PROVIDER=interno para chat sin tokens).",
      },
    }
  }

  const sessionId = (input.sessionId ?? "").trim() || crypto.randomUUID()
  const message = (input.message ?? "").trim()
  if (!message) {
    return {
      status: 400 as const,
      body: { ok: false, error: "message es obligatorio" },
    }
  }

  const session = getOrCreateSession(sessionId)

  // Lazy imports: evita que /api/health cargue exceljs/pdfkit/openai y tumbe el cold start.
  let result
  if (config.provider === "interno") {
    const { runInternoTurn } = await import("./agent-interno.js")
    result = await runInternoTurn({ directory: ROOT, session, message })
  } else {
    const { runAgentTurn } = await import("./agent-loop.js")
    const { OpenAiAdapter } = await import("./llm/openai.js")
    result = await runAgentTurn({
      directory: ROOT,
      session,
      message,
      adapter: new OpenAiAdapter(config.apiKey, config.model),
      maxIterations: config.maxToolIterations,
      maxTokensPerSession: config.maxTokensPerSession,
    })
  }

  saveSession(session)

  return {
    status: 200 as const,
    body: {
      sessionId,
      reply: result.reply,
      toolCalls: result.toolCalls,
      needsConfirmation: result.needsConfirmation,
    },
  }
}
