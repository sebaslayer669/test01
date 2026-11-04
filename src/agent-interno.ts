import fs from "node:fs"
import path from "node:path"
import {
  executeToolByName,
  looksLikeConfirmation,
} from "./tools/registry.js"
import type { Session, VisibleToolCall } from "./sessions.js"
import type { AgentLoopResult } from "./agent-loop.js"
import type { MapeoResultado } from "./tools/types.js"

const CASOS_CONOCIDOS = [
  "co-industrias-delta",
  "ec-corp-andina",
  "hn-agroexport-sula",
  "pa-logistica-istmo",
] as const

function listarCasos(directory: string): string[] {
  const dir = path.join(directory, "fixtures", "reto-01", "casos")
  if (!fs.existsSync(dir)) return [...CASOS_CONOCIDOS]
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
}

function detectarCaso(message: string, casos: string[]): string | null {
  const lower = message.toLowerCase()
  for (const caso of casos) {
    if (lower.includes(caso.toLowerCase())) return caso
  }
  // alias cortos útiles en demo
  const aliases: Record<string, string> = {
    delta: "co-industrias-delta",
    andina: "ec-corp-andina",
    sula: "hn-agroexport-sula",
    istmo: "pa-logistica-istmo",
  }
  for (const [alias, caso] of Object.entries(aliases)) {
    if (lower.includes(alias) && casos.includes(caso)) return caso
  }
  return null
}

function parseTool(raw: string): { ok: boolean; data?: unknown; error?: string } {
  try {
    return JSON.parse(raw) as { ok: boolean; data?: unknown; error?: string }
  } catch {
    return { ok: false, error: raw.slice(0, 200) }
  }
}

function summarize(raw: string): { ok: boolean; summary: string } {
  const parsed = parseTool(raw)
  if (!parsed.ok) return { ok: false, summary: parsed.error ?? "error" }
  const d = (parsed.data ?? {}) as Record<string, unknown>
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

async function callTool(
  name: string,
  args: unknown,
  ctx: { directory: string; sessionId: string },
  collected: VisibleToolCall[],
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const raw = await executeToolByName(name, args, ctx)
  const { ok, summary } = summarize(raw)
  collected.push({ name, arguments: args, resultSummary: summary, ok })
  return parseTool(raw)
}

const NOMBRE_FORMATO: Record<string, string> = {
  xlsx: "Excel",
  pdf: "PDF",
  portal: "portal web (valores para copiar)",
}

const NOMBRE_SOPORTE: Record<string, string> = {
  camara_comercio: "Cámara de Comercio",
  rut: "RUT / registro tributario",
  certificacion_bancaria: "Certificación bancaria",
  estados_financieros: "Estados financieros",
  parafiscales: "Parafiscales",
  certificado_cumplimiento_tributario: "Certificado de cumplimiento tributario",
}

function etiquetaSoporte(tipo: string): string {
  return NOMBRE_SOPORTE[tipo] ?? tipo.replaceAll("_", " ")
}

function etiquetaEstadoSoporte(estado: string): string {
  switch (estado) {
    case "presente":
      return "listo"
    case "vencido":
      return "vencido — hay que actualizarlo"
    case "ausente":
      return "no lo tenemos en el archivo"
    default:
      return estado
  }
}

function ayuda(casos: string[]): string {
  return [
    "¡Hola! Puedo ayudarte a preparar el registro como proveedor.",
    "",
    "Elige uno de estos casos (también puedes usar los botones de arriba):",
    ...casos.map((c) => `• ${c}`),
    "",
    "Ejemplo de mensaje:",
    'Procesa el caso "ec-corp-andina". No envíes nada todavía.',
    "",
    "Cuando el paquete esté listo, te preguntaré si quieres simular el envío. Responde «sí» o «envía».",
  ].join("\n")
}

function construirResumenAmigable(opts: {
  caso: string
  cliente: string
  pais: string
  formato: string
  mapeo: MapeoResultado
  formOk: boolean
  formError?: string
  formRuta?: string
  formFormato?: string
  paqueteOk: boolean
  paqueteError?: string
  paqueteRuta?: string
  listoParaFirma?: boolean
  soportes?: Array<{ tipo: string; estado: string }>
  noEnviar: boolean
}): { reply: string; needsConfirmation: boolean } {
  const formatoLegible = NOMBRE_FORMATO[opts.formato] ?? opts.formato
  const lines: string[] = [
    `Listo. Ya revisé la solicitud de ${opts.cliente} (${opts.pais}).`,
    `Formato pedido: ${formatoLegible}.`,
    "",
  ]

  const llenos = opts.mapeo.llenos.length
  const faltantes = opts.mapeo.faltantes
  const conf = opts.mapeo.requiere_confirmacion

  lines.push("Datos del formulario")
  lines.push(
    `Completé ${llenos} campo${llenos === 1 ? "" : "s"} con la información que ya tenemos en el archivo interno.`,
  )

  if (faltantes.length > 0) {
    lines.push("")
    lines.push("Estos campos no los pude completar (no están en nuestro archivo):")
    for (const f of faltantes) {
      lines.push(`• ${f.etiqueta}`)
    }
    lines.push("No inventé ningún valor: quedan marcados para que los revises.")
  }

  if (conf.length > 0) {
    lines.push("")
    lines.push("Estos datos conviene que los confirmes antes de firmar:")
    for (const c of conf) {
      const detalle =
        c.nota === "identificador extranjero"
          ? "usamos el NIT colombiano como identificador en ese país"
          : c.nota
      lines.push(`• ${c.etiqueta}${c.valor ? `: ${c.valor}` : ""} (${detalle})`)
    }
  }

  lines.push("")
  if (opts.formOk && opts.formRuta) {
    lines.push(`Formulario generado: ${opts.formRuta}`)
  } else if (opts.formError) {
    if (/formato no soportado/i.test(opts.formError)) {
      lines.push(
        "Este cliente pide un portal web: no lo lleno automáticamente. Te dejé una hoja con los valores listos para copiar y pegar.",
      )
      const match = opts.formError.match(/out\/[^\s]+/)
      if (match) lines.push(`La encuentras en: ${match[0]}`)
    } else {
      lines.push(`No pude generar el formulario: ${opts.formError}`)
    }
  }

  if (opts.paqueteOk) {
    lines.push("")
    lines.push("Paquete para la firma")
    if (opts.paqueteRuta) {
      lines.push(`Armé la carpeta con el formulario, los soportes y un borrador de correo en:`)
      lines.push(opts.paqueteRuta)
    }

    const soportes = opts.soportes ?? []
    if (soportes.length > 0) {
      lines.push("")
      lines.push("Documentos de soporte:")
      for (const s of soportes) {
        lines.push(`• ${etiquetaSoporte(s.tipo)}: ${etiquetaEstadoSoporte(s.estado)}`)
      }
    }

    lines.push("")
    if (opts.listoParaFirma) {
      lines.push(
        "Buenas noticias: con lo que hay hoy, el paquete puede pasar a la firma del representante legal.",
      )
    } else {
      lines.push(
        "Aún no está listo para firma: falta actualizar o conseguir algún soporte (mira los marcados arriba).",
      )
      lines.push(
        "Igual puedes revisar el formulario y el borrador de correo; los campos faltantes no bloquean la firma, los soportes sí.",
      )
    }
  } else if (opts.paqueteError) {
    lines.push(`No pude armar el paquete: ${opts.paqueteError}`)
  }

  lines.push("")
  let needsConfirmation = true
  if (opts.noEnviar) {
    lines.push("Por ahora no envié nada, como pediste.")
  }
  lines.push(
    "¿Quieres que simule el envío del paquete? Responde «sí» o «envía». Si prefieres no hacerlo, responde «no».",
  )

  return { reply: lines.join("\n"), needsConfirmation }
}

export async function runInternoTurn(opts: {
  directory: string
  session: Session
  message: string
}): Promise<AgentLoopResult> {
  const { directory, session, message } = opts
  const casos = listarCasos(directory)
  const ctx = { directory, sessionId: session.id }
  const collected: VisibleToolCall[] = []
  const now = new Date().toISOString()

  session.turns.push({ role: "user", content: message, at: now })
  session.messages.push({ role: "user", content: message })

  // Confirmación de envío del último caso pendiente
  if (session.awaitingConfirmation && looksLikeConfirmation(message)) {
    const ultimoCaso =
      session.lastCaso ??
      detectarCaso(
        session.turns
          .filter((t) => t.role === "user")
          .map((t) => t.content)
          .join(" "),
        casos,
      )

    if (!ultimoCaso) {
      const reply =
        "Recibí la confirmación, pero no tengo claro el caso. Indica el nombre (ej. ec-corp-andina)."
      session.awaitingConfirmation = false
      session.turns.push({
        role: "assistant",
        content: reply,
        at: new Date().toISOString(),
      })
      return { reply, toolCalls: [], needsConfirmation: false }
    }

    const envio = await callTool(
      "proveedor_simular_envio",
      { caso: ultimoCaso, confirmado: true },
      ctx,
      collected,
    )

    const ruta =
      String(
        (envio.data as { ruta?: string })?.ruta ??
          `out/${ultimoCaso}/ENVIO-SIMULADO.md`,
      )
    const reply = envio.ok
      ? [
          "Perfecto. Dejé registrada la simulación del envío.",
          "No salió ningún correo real: solo quedó la constancia en el sistema para la demo.",
          `Referencia: ${ruta}`,
          "",
          "Si necesitas otro cliente, elige otro caso con los botones de arriba.",
        ].join("\n")
      : `No pude registrar el envío simulado. Detalle: ${envio.error}`

    session.awaitingConfirmation = false
    session.updatedAt = new Date().toISOString()
    session.turns.push({
      role: "assistant",
      content: reply,
      toolCalls: collected,
      needsConfirmation: false,
      at: session.updatedAt,
    })
    session.messages.push({ role: "assistant", content: reply })
    return { reply, toolCalls: collected, needsConfirmation: false }
  }

  // Usuario cancela el envío
  if (session.awaitingConfirmation && /^no\b/i.test(message.trim())) {
    const reply = [
      "Entendido: no simulo el envío.",
      "El formulario y el paquete siguen disponibles en la carpeta del caso para que los revises o los envíes después.",
      "Cuando quieras, elige otro caso o escribe «sí» si cambias de opinión sobre el envío simulado.",
    ].join("\n")
    session.awaitingConfirmation = true
    session.updatedAt = new Date().toISOString()
    session.turns.push({
      role: "assistant",
      content: reply,
      needsConfirmation: true,
      at: session.updatedAt,
    })
    session.messages.push({ role: "assistant", content: reply })
    return { reply, toolCalls: [], needsConfirmation: true }
  }

  const caso = detectarCaso(message, casos)
  if (!caso) {
    const reply = ayuda(casos)
    session.awaitingConfirmation = false
    session.updatedAt = new Date().toISOString()
    session.turns.push({
      role: "assistant",
      content: reply,
      at: session.updatedAt,
    })
    session.messages.push({ role: "assistant", content: reply })
    return { reply, toolCalls: [], needsConfirmation: false }
  }

  session.lastCaso = caso

  const lectura = await callTool(
    "proveedor_leer_solicitud",
    { caso },
    ctx,
    collected,
  )
  if (!lectura.ok || !lectura.data) {
    const reply = [
      "No pude abrir esa solicitud.",
      `Detalle: ${lectura.error}`,
      "Revisa que el nombre del caso esté bien escrito o usa uno de los botones de arriba.",
    ].join("\n")
    session.turns.push({
      role: "assistant",
      content: reply,
      toolCalls: collected,
      at: new Date().toISOString(),
    })
    return { reply, toolCalls: collected, needsConfirmation: false }
  }

  const dataLectura = lectura.data as {
    pais: string
    cliente: string
    formato: string
    campos: Array<{ etiqueta: string }>
    soportes: string[]
  }

  const mapeoRes = await callTool(
    "proveedor_mapear_campos",
    {
      caso,
      campos: dataLectura.campos.map((c) => ({ etiqueta: c.etiqueta })),
    },
    ctx,
    collected,
  )
  if (!mapeoRes.ok || !mapeoRes.data) {
    const reply = [
      `Encontré la solicitud de ${dataLectura.cliente}, pero no pude cruzar los datos con nuestro archivo interno.`,
      `Detalle: ${mapeoRes.error}`,
    ].join("\n")
    session.turns.push({
      role: "assistant",
      content: reply,
      toolCalls: collected,
      at: new Date().toISOString(),
    })
    return { reply, toolCalls: collected, needsConfirmation: false }
  }

  const mapeo = mapeoRes.data as MapeoResultado

  const form = await callTool(
    "proveedor_generar_formulario",
    { caso, mapeo },
    ctx,
    collected,
  )

  const paquete = await callTool(
    "proveedor_armar_paquete",
    { caso },
    ctx,
    collected,
  )

  const paqueteData = (paquete.data ?? {}) as {
    ruta?: string
    listo_para_firma?: boolean
    checklist?: { soportes?: Array<{ tipo: string; estado: string }> }
  }
  const formData = (form.data ?? {}) as { ruta?: string; formato?: string }

  const noEnviar =
    /\bno\s+env/i.test(message) ||
    /no\s+env[ií]es/i.test(message) ||
    /todav[ií]a/i.test(message)

  if (looksLikeConfirmation(message) && !noEnviar) {
    const envio = await callTool(
      "proveedor_simular_envio",
      { caso, confirmado: true },
      ctx,
      collected,
    )
    const amigable = construirResumenAmigable({
      caso,
      cliente: dataLectura.cliente,
      pais: dataLectura.pais,
      formato: dataLectura.formato,
      mapeo,
      formOk: form.ok,
      formError: form.error,
      formRuta: formData.ruta,
      formFormato: formData.formato,
      paqueteOk: paquete.ok,
      paqueteError: paquete.error,
      paqueteRuta: paqueteData.ruta,
      listoParaFirma: paqueteData.listo_para_firma,
      soportes: paqueteData.checklist?.soportes,
      noEnviar: false,
    })
    const extra = envio.ok
      ? `\n\nAdemás, ya registré la simulación del envío en ${String((envio.data as { ruta?: string })?.ruta)}.`
      : `\n\nNo pude simular el envío: ${envio.error}`
    const reply = amigable.reply.replace(
      /\n¿Quieres que simule el envío[\s\S]*$/,
      "",
    ) + extra
    session.awaitingConfirmation = false
    session.updatedAt = new Date().toISOString()
    session.turns.push({
      role: "assistant",
      content: reply,
      toolCalls: collected,
      needsConfirmation: false,
      at: session.updatedAt,
    })
    session.messages.push({ role: "assistant", content: reply })
    return { reply, toolCalls: collected, needsConfirmation: false }
  }

  const { reply, needsConfirmation } = construirResumenAmigable({
    caso,
    cliente: dataLectura.cliente,
    pais: dataLectura.pais,
    formato: dataLectura.formato,
    mapeo,
    formOk: form.ok,
    formError: form.error,
    formRuta: formData.ruta,
    formFormato: formData.formato,
    paqueteOk: paquete.ok,
    paqueteError: paquete.error,
    paqueteRuta: paqueteData.ruta,
    listoParaFirma: paqueteData.listo_para_firma,
    soportes: paqueteData.checklist?.soportes,
    noEnviar,
  })

  session.awaitingConfirmation = needsConfirmation
  session.updatedAt = new Date().toISOString()
  session.turns.push({
    role: "assistant",
    content: reply,
    toolCalls: collected,
    needsConfirmation,
    at: session.updatedAt,
  })
  session.messages.push({ role: "assistant", content: reply })

  return { reply, toolCalls: collected, needsConfirmation }
}
