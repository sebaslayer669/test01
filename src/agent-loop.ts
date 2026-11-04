import fs from "node:fs"
import path from "node:path"
import type { LlmAdapter, ChatMessage } from "./llm/adapter.js"
import {
  executeToolByName,
  listLlmTools,
  looksLikeConfirmation,
} from "./tools/registry.js"
import type { Session, VisibleToolCall } from "./sessions.js"
import { stripFrontmatter } from "./lib/markdown.js"

function readFirstExisting(paths: string[]): string {
  for (const p of paths) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8")
  }
  throw new Error(`No se encontró ninguno de: ${paths.join(", ")}`)
}

function loadSystemPrompt(directory: string): string {
  // Fuente canónica: modulo/ (bonus). Fallback a agent/ y src/knowledge/.
  const promptRaw = readFirstExisting([
    path.join(directory, "modulo", "agent.md"),
    path.join(directory, "agent", "prompt.md"),
  ])
  const knowledgeRaw = readFirstExisting([
    path.join(directory, "modulo", "skill", "registro-proveedor", "SKILL.md"),
    path.join(directory, "src", "knowledge", "registro-proveedor.md"),
  ])
  const prompt = stripFrontmatter(promptRaw).trim()
  const knowledge = stripFrontmatter(knowledgeRaw).trim()
  return `${prompt}\n\n---\n\n## Conocimiento del proceso\n\n${knowledge}`
}

function summarizeToolResult(raw: string): { ok: boolean; summary: string } {
  try {
    const parsed = JSON.parse(raw) as { ok: boolean; error?: string; data?: unknown }
    if (!parsed.ok) {
      return { ok: false, summary: parsed.error ?? "error" }
    }
    const data = parsed.data
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>
      const bits: string[] = []
      if (d.formato !== undefined) bits.push(`formato=${String(d.formato)}`)
      if (d.ruta !== undefined) bits.push(`ruta=${String(d.ruta)}`)
      if (d.listo_para_firma !== undefined) {
        bits.push(`listo_para_firma=${String(d.listo_para_firma)}`)
      }
      if (Array.isArray(d.llenos)) bits.push(`llenos=${d.llenos.length}`)
      if (Array.isArray(d.faltantes)) bits.push(`faltantes=${d.faltantes.length}`)
      if (Array.isArray(d.campos)) bits.push(`campos=${d.campos.length}`)
      return { ok: true, summary: bits.join(" ") || "ok" }
    }
    return { ok: true, summary: "ok" }
  } catch {
    return { ok: false, summary: raw.slice(0, 200) }
  }
}

function replyNeedsConfirmation(text: string): boolean {
  const t = text.toLowerCase()
  return (
    t.includes("¿confirm") ||
    t.includes("confirmas") ||
    t.includes("deseas que simule") ||
    t.includes("¿quieres que") ||
    t.includes("antes de enviar") ||
    (t.includes("sí/no") && t.includes("envi"))
  )
}

export type AgentLoopResult = {
  reply: string
  toolCalls: VisibleToolCall[]
  needsConfirmation: boolean
}

export async function runAgentTurn(opts: {
  directory: string
  session: Session
  message: string
  adapter: LlmAdapter
  maxIterations: number
  maxTokensPerSession: number
}): Promise<AgentLoopResult> {
  const { directory, session, message, adapter, maxIterations, maxTokensPerSession } =
    opts

  if (session.tokenUsage >= maxTokensPerSession) {
    const reply =
      "Se alcanzó el tope de tokens de esta sesión. Abre una sesión nueva para continuar."
    session.turns.push({
      role: "assistant",
      content: reply,
      at: new Date().toISOString(),
    })
    return { reply, toolCalls: [], needsConfirmation: false }
  }

  const system = loadSystemPrompt(directory)
  const userNote =
    session.awaitingConfirmation && looksLikeConfirmation(message)
      ? `${message}\n\n[Sistema: el usuario confirma. Si corresponde simular envío, llama proveedor_simular_envio con confirmado=true.]`
      : message

  session.messages.push({ role: "user", content: userNote })
  session.turns.push({
    role: "user",
    content: message,
    at: new Date().toISOString(),
  })

  const llmMessages: ChatMessage[] = [
    { role: "system", content: system },
    ...session.messages,
  ]

  const tools = listLlmTools()
  const collected: VisibleToolCall[] = []
  let finalReply = ""
  let needsConfirmation = false

  for (let i = 0; i < maxIterations; i++) {
    let response
    try {
      response = await adapter.enviar(llmMessages, tools)
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Error desconocido al llamar al proveedor LLM"
      finalReply = `No pude contactar al modelo: ${msg}. La sesión sigue activa; intenta de nuevo.`
      break
    }

    if (response.usage) {
      session.tokenUsage +=
        response.usage.promptTokens + response.usage.completionTokens
    }

    if (response.toolCalls.length === 0) {
      finalReply = response.content?.trim() || "(Sin respuesta del modelo)"
      needsConfirmation = replyNeedsConfirmation(finalReply)
      session.messages.push({ role: "assistant", content: finalReply })
      break
    }

    const assistantToolMsg: ChatMessage = {
      role: "assistant",
      content: response.content,
      tool_calls: response.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      })),
    }
    llmMessages.push(assistantToolMsg)
    session.messages.push(assistantToolMsg)

    for (const tc of response.toolCalls) {
      let args: unknown = {}
      try {
        args = JSON.parse(tc.arguments || "{}")
      } catch {
        args = {}
      }

      // Guardrail: no permitir envío confirmado sin señal del usuario
      if (
        tc.name === "proveedor_simular_envio" &&
        typeof args === "object" &&
        args !== null
      ) {
        const a = args as { confirmado?: boolean; caso?: string }
        if (a.confirmado === true && !looksLikeConfirmation(message)) {
          a.confirmado = false
          args = a
        }
      }

      const raw = await executeToolByName(tc.name, args, {
        directory,
        sessionId: session.id,
      })
      const { ok, summary } = summarizeToolResult(raw)
      collected.push({
        name: tc.name,
        arguments: args,
        resultSummary: summary,
        ok,
      })

      const toolMsg: ChatMessage = {
        role: "tool",
        tool_call_id: tc.id,
        name: tc.name,
        content: raw,
      }
      llmMessages.push(toolMsg)
      session.messages.push(toolMsg)
    }

    if (i === maxIterations - 1) {
      finalReply =
        "Alcancé el tope de iteraciones de herramientas en este turno. Esto es lo procesado hasta ahora; revisa las llamadas a herramientas y dime cómo continuar."
      session.messages.push({ role: "assistant", content: finalReply })
    }
  }

  session.awaitingConfirmation = needsConfirmation
  session.updatedAt = new Date().toISOString()
  session.turns.push({
    role: "assistant",
    content: finalReply,
    toolCalls: collected,
    needsConfirmation,
    at: session.updatedAt,
  })

  return { reply: finalReply, toolCalls: collected, needsConfirmation }
}
