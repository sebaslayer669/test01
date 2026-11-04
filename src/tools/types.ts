import type { z } from "zod"

export type ToolContext = {
  directory: string
  sessionId: string
}

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export type ToolDefinition<TArgs extends z.ZodRawShape, TData> = {
  description: string
  args: TArgs
  execute: (
    args: z.infer<z.ZodObject<TArgs>>,
    ctx: ToolContext,
  ) => Promise<string>
}

export type FormatoSalida = "xlsx" | "pdf" | "portal"

export type CampoSolicitado = {
  etiqueta: string
  obligatorio?: boolean
  hoja?: string
  celda_etiqueta?: string
  celda_valor?: string
  requiere_confirmacion?: boolean
  propuesta_pais?: string
  nota?: string
}

export type CampoLleno = {
  etiqueta: string
  clave_maestro: string
  valor: string
  ruta: string
  confianza: number
}

export type CampoFaltante = {
  etiqueta: string
  motivo: string
}

export type CampoConfirmacion = {
  etiqueta: string
  clave_maestro?: string
  valor?: string
  confianza: number
  nota: string
  propuesta_pais?: string
}

export type MapeoResultado = {
  llenos: CampoLleno[]
  faltantes: CampoFaltante[]
  requiere_confirmacion: CampoConfirmacion[]
}
