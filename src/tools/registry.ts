import { z } from "zod"
import {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
} from "./proveedor.js"
import type { ToolContext } from "./types.js"
import type { LlmToolDefinition } from "../llm/adapter.js"

type AnyTool = {
  description: string
  args: Record<string, z.ZodTypeAny>
  execute: (args: never, ctx: ToolContext) => Promise<string>
}

const toolsByExport: Record<string, AnyTool> = {
  leer_solicitud: leer_solicitud as unknown as AnyTool,
  mapear_campos: mapear_campos as unknown as AnyTool,
  generar_formulario: generar_formulario as unknown as AnyTool,
  armar_paquete: armar_paquete as unknown as AnyTool,
  simular_envio: simular_envio as unknown as AnyTool,
}

/** Nombre que ve el modelo: <archivo>_<export> */
export function toolName(exportName: string): string {
  return `proveedor_${exportName}`
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodString) {
    return { type: "string", description: schema.description }
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean", description: schema.description }
  }
  if (schema instanceof z.ZodNumber) {
    return { type: "number", description: schema.description }
  }
  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      description: schema.description,
      items: zodToJsonSchema(schema.element),
    }
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value)
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) {
        required.push(key)
      }
    }
    return {
      type: "object",
      description: schema.description,
      properties,
      ...(required.length ? { required } : {}),
    }
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap())
  }
  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema.removeDefault())
  }
  if (schema instanceof z.ZodAny) {
    return {}
  }
  return { type: "string", description: schema.description }
}

export function listLlmTools(): LlmToolDefinition[] {
  return Object.entries(toolsByExport).map(([exportName, tool]) => {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [key, schema] of Object.entries(tool.args)) {
      properties[key] = zodToJsonSchema(schema)
      if (!(schema instanceof z.ZodOptional) && !(schema instanceof z.ZodDefault)) {
        required.push(key)
      }
    }
    return {
      name: toolName(exportName),
      description: tool.description,
      parameters: {
        type: "object",
        properties,
        required,
      },
    }
  })
}

export async function executeToolByName(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<string> {
  const exportName = name.startsWith("proveedor_")
    ? name.slice("proveedor_".length)
    : name
  const tool = toolsByExport[exportName]
  if (!tool) {
    return JSON.stringify({ ok: false, error: `Herramienta desconocida: ${name}` })
  }

  const shape = z.object(tool.args)
  const parsed = shape.safeParse(rawArgs)
  if (!parsed.success) {
    return JSON.stringify({
      ok: false,
      error: `Argumentos inválidos: ${parsed.error.message}`,
    })
  }

  return tool.execute(parsed.data as never, ctx)
}

export function looksLikeConfirmation(message: string): boolean {
  const t = message.trim().toLowerCase()
  if (!t) return false
  // "No envíes nada todavía" no es confirmación
  if (/^no\b/.test(t) || /\bno\s+env/.test(t) || /\bnop\b/.test(t)) return false
  if (/^cancel/.test(t) || /^deten/.test(t) || /^espera\b/.test(t)) return false

  const positives = [
    "sí",
    "si",
    "ok",
    "dale",
    "confirmo",
    "confirmado",
    "confirma",
    "envía",
    "envia",
    "enviar",
    "adelante",
    "proceda",
    "procede",
    "yes",
  ]
  return positives.some(
    (p) =>
      t === p ||
      t.startsWith(p + " ") ||
      t.startsWith(p + ",") ||
      t.startsWith(p + "!") ||
      t.startsWith(p + "."),
  )
}
