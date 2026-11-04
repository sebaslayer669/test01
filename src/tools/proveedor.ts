import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import { appendCasoLog } from "../lib/log.js"
import {
  casoDir,
  casoExiste,
  ensureDir,
  outCasoDir,
  readJsonFile,
  soportesDir,
  soportesIndexPath,
  writeTextFile,
} from "../lib/paths.js"
import {
  esEtiquetaTributaria,
  esEtiquetaTributariaAmbiguo,
  esClaveBancaria,
  loadGlosario,
  propuestaIdPais,
  resolverEtiqueta,
} from "../lib/glosario.js"
import {
  getMaestroValue,
  loadMaestro,
  valorToString,
} from "../lib/maestro.js"
import { evaluarSoporte, type SoporteIndexItem } from "../lib/vigencia.js"
import {
  generarPdf,
  generarValoresPortalMd,
  generarXlsx,
  type CampoPlantilla,
  type CeldaPlantilla,
} from "../lib/formularios.js"
import type {
  CampoConfirmacion,
  CampoFaltante,
  CampoLleno,
  CampoSolicitado,
  FormatoSalida,
  MapeoResultado,
  ToolContext,
  ToolResult,
} from "./types.js"

type Solicitud = {
  id: string
  pais: string
  cliente: string
  formato: FormatoSalida
  asunto?: string
  de?: string
}

function ok<T>(data: T): string {
  return JSON.stringify({ ok: true, data } satisfies ToolResult<T>)
}

function fail(error: string): string {
  return JSON.stringify({ ok: false, error } satisfies ToolResult<never>)
}

function safeExecute(
  herramienta: string,
  ctx: ToolContext,
  caso: string | undefined,
  fn: () => Promise<string> | string,
): Promise<string> {
  return Promise.resolve()
    .then(() => fn())
    .then((result) => {
      try {
        const parsed = JSON.parse(result) as { ok: boolean; error?: string; data?: unknown }
        if (caso) {
          appendCasoLog(ctx.directory, caso, {
            herramienta,
            ok: parsed.ok,
            resumen: parsed.ok
              ? resumirData(herramienta, parsed.data)
              : parsed.error ?? "error",
            sessionId: ctx.sessionId,
          })
        }
      } catch {
        /* ignore log parse errors */
      }
      return result
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      if (caso) {
        appendCasoLog(ctx.directory, caso, {
          herramienta,
          ok: false,
          resumen: message,
          sessionId: ctx.sessionId,
        })
      }
      return fail(message)
    })
}

function resumirData(herramienta: string, data: unknown): string {
  if (!data || typeof data !== "object") return "ok"
  const d = data as Record<string, unknown>
  switch (herramienta) {
    case "proveedor_leer_solicitud":
      return `formato=${String(d.formato)} campos=${Array.isArray(d.campos) ? d.campos.length : 0}`
    case "proveedor_mapear_campos":
      return `llenos=${Array.isArray(d.llenos) ? d.llenos.length : 0} faltantes=${Array.isArray(d.faltantes) ? d.faltantes.length : 0} conf=${Array.isArray(d.requiere_confirmacion) ? d.requiere_confirmacion.length : 0}`
    case "proveedor_generar_formulario":
      return `ruta=${String(d.ruta ?? "")} formato=${String(d.formato ?? "")}`
    case "proveedor_armar_paquete":
      return `listo=${String(d.listo_para_firma)} ruta=${String(d.ruta ?? "")}`
    case "proveedor_simular_envio":
      return `ruta=${String(d.ruta ?? "")}`
    default:
      return "ok"
  }
}

function leerCamposPlantilla(
  directory: string,
  caso: string,
  formato: FormatoSalida,
  pais: string,
): CampoSolicitado[] {
  const base = casoDir(directory, caso)
  if (formato === "xlsx") {
    const plantilla = readJsonFile<CeldaPlantilla[]>(
      path.join(base, "plantilla-celdas.json"),
    )
    return plantilla.map((p) => enriquecerCampo({
      etiqueta: p.etiqueta,
      hoja: p.hoja,
      celda_etiqueta: p.celda_etiqueta,
      celda_valor: p.celda_valor,
      obligatorio: true,
    }, pais))
  }

  if (formato === "pdf" || formato === "portal") {
    const plantilla = readJsonFile<CampoPlantilla[]>(
      path.join(base, "plantilla-campos.json"),
    )
    return plantilla.map((p) => enriquecerCampo({
      etiqueta: p.etiqueta,
      obligatorio: p.obligatorio,
    }, pais))
  }

  throw new Error(`Formato de plantilla no reconocido: ${String(formato)}`)
}

function enriquecerCampo(campo: CampoSolicitado, pais: string): CampoSolicitado {
  if (esEtiquetaTributariaAmbiguo(campo.etiqueta)) {
    return {
      ...campo,
      requiere_confirmacion: true,
      propuesta_pais: propuestaIdPais(pais),
      nota: `Etiqueta ambigua; equivalente en ${pais}: ${propuestaIdPais(pais)}`,
    }
  }
  return campo
}

function mapearCamposInterno(
  directory: string,
  caso: string,
  campos: Array<{ etiqueta: string }>,
): MapeoResultado & { pais: string } {
  const solicitud = readJsonFile<Solicitud>(
    path.join(casoDir(directory, caso), "solicitud.json"),
  )
  const maestro = loadMaestro(directory)
  const glosario = loadGlosario(directory)
  const pais = solicitud.pais.toUpperCase()

  const llenos: CampoLleno[] = []
  const faltantes: CampoFaltante[] = []
  const requiere_confirmacion: CampoConfirmacion[] = []

  for (const campo of campos) {
    const etiqueta = campo.etiqueta
    const resolved = resolverEtiqueta(glosario, etiqueta)

    if (!resolved) {
      faltantes.push({
        etiqueta,
        motivo: "Sin coincidencia en glosario ni fuente en el maestro",
      })
      continue
    }

    const { clave, confianza } = resolved
    const raw = getMaestroValue(maestro, clave)
    const valor = valorToString(raw)

    if (valor === undefined) {
      faltantes.push({
        etiqueta,
        motivo: `Clave ${clave} sin valor en el maestro`,
      })
      continue
    }

    const tributario =
      esEtiquetaTributaria(etiqueta) || clave === "nit"
    const extranjero = tributario && pais !== "CO"

    if (confianza < 0.8 || extranjero || esEtiquetaTributariaAmbiguo(etiqueta)) {
      requiere_confirmacion.push({
        etiqueta,
        clave_maestro: clave,
        valor,
        confianza: extranjero ? Math.min(confianza, 0.75) : confianza,
        nota: extranjero
          ? "identificador extranjero"
          : confianza < 0.8
            ? "mapeo con confianza baja"
            : "etiqueta tributaria ambigua",
        propuesta_pais: tributario ? propuestaIdPais(pais) : undefined,
      })
      continue
    }

    llenos.push({
      etiqueta,
      clave_maestro: clave,
      valor,
      ruta: `fixtures/reto-01/repositorio/maestro.json#${clave}`,
      confianza,
    })
  }

  return { llenos, faltantes, requiere_confirmacion, pais }
}

function parseMapeo(mapeo: unknown): MapeoResultado {
  const obj = mapeo as MapeoResultado
  return {
    llenos: Array.isArray(obj.llenos) ? obj.llenos : [],
    faltantes: Array.isArray(obj.faltantes) ? obj.faltantes : [],
    requiere_confirmacion: Array.isArray(obj.requiere_confirmacion)
      ? obj.requiere_confirmacion
      : [],
  }
}

export const leer_solicitud = {
  description:
    "Lee la solicitud de un caso y su plantilla; devuelve país, cliente, formato, campos y soportes exigidos.",
  args: {
    caso: z
      .string()
      .describe("Nombre de la carpeta del caso en fixtures/reto-01/casos/"),
  },
  async execute(args: { caso: string }, ctx: ToolContext): Promise<string> {
    return safeExecute("proveedor_leer_solicitud", ctx, args.caso, () => {
      if (!casoExiste(ctx.directory, args.caso)) {
        return fail(`Caso inexistente: ${args.caso}`)
      }
      const base = casoDir(ctx.directory, args.caso)
      let solicitud: Solicitud
      try {
        solicitud = readJsonFile<Solicitud>(path.join(base, "solicitud.json"))
      } catch {
        return fail("Plantilla o solicitud corrupta: no se pudo leer solicitud.json")
      }

      let campos: CampoSolicitado[]
      try {
        campos = leerCamposPlantilla(
          ctx.directory,
          args.caso,
          solicitud.formato,
          solicitud.pais,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return fail(`Plantilla corrupta o ilegible: ${msg}`)
      }

      const soportes = readJsonFile<string[]>(
        path.join(base, "soportes-exigidos.json"),
      )

      return ok({
        pais: solicitud.pais,
        cliente: solicitud.cliente,
        formato: solicitud.formato,
        campos,
        soportes,
      })
    })
  },
}

export const mapear_campos = {
  description:
    "Cruza los campos solicitados con el repositorio maestro y el glosario; nunca inventa valores.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso"),
    campos: z
      .array(
        z.object({
          etiqueta: z.string().describe("Etiqueta del campo solicitado"),
        }),
      )
      .describe("Lista de campos a mapear"),
  },
  async execute(
    args: { caso: string; campos: Array<{ etiqueta: string }> },
    ctx: ToolContext,
  ): Promise<string> {
    return safeExecute("proveedor_mapear_campos", ctx, args.caso, () => {
      if (!casoExiste(ctx.directory, args.caso)) {
        return fail(`Caso inexistente: ${args.caso}`)
      }
      const { pais: _pais, ...mapeo } = mapearCamposInterno(
        ctx.directory,
        args.caso,
        args.campos,
      )
      return ok(mapeo)
    })
  },
}

export const generar_formulario = {
  description:
    "Genera el formulario en el formato del caso (xlsx, pdf) o valores-portal.md si es portal.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso"),
    mapeo: z
      .object({
        llenos: z.array(z.any()).optional(),
        faltantes: z.array(z.any()).optional(),
        requiere_confirmacion: z.array(z.any()).optional(),
      })
      .describe("Resultado de proveedor_mapear_campos"),
  },
  async execute(
    args: { caso: string; mapeo: MapeoResultado },
    ctx: ToolContext,
  ): Promise<string> {
    return safeExecute("proveedor_generar_formulario", ctx, args.caso, async () => {
      if (!casoExiste(ctx.directory, args.caso)) {
        return fail(`Caso inexistente: ${args.caso}`)
      }

      const base = casoDir(ctx.directory, args.caso)
      const solicitud = readJsonFile<Solicitud>(path.join(base, "solicitud.json"))
      const mapeo = parseMapeo(args.mapeo)
      const outDir = outCasoDir(ctx.directory, args.caso)
      ensureDir(outDir)

      if (solicitud.formato === "portal") {
        const plantilla = readJsonFile<CampoPlantilla[]>(
          path.join(base, "plantilla-campos.json"),
        )
        const ruta = path.join(outDir, "valores-portal.md")
        generarValoresPortalMd({
          plantilla,
          llenos: mapeo.llenos,
          confirmacion: mapeo.requiere_confirmacion,
          faltantes: mapeo.faltantes,
          salida: ruta,
          cliente: solicitud.cliente,
        })
        return fail(
          `formato no soportado: portal. Valores listos en ${path.relative(ctx.directory, ruta).replace(/\\/g, "/")}`,
        )
      }

      if (solicitud.formato === "xlsx") {
        const plantilla = readJsonFile<CeldaPlantilla[]>(
          path.join(base, "plantilla-celdas.json"),
        )
        const ruta = path.join(outDir, "formulario.xlsx")
        await generarXlsx({
          plantilla,
          llenos: mapeo.llenos,
          confirmacion: mapeo.requiere_confirmacion,
          salida: ruta,
        })
        return ok({
          ruta: path.relative(ctx.directory, ruta).replace(/\\/g, "/"),
          formato: "xlsx",
        })
      }

      if (solicitud.formato === "pdf") {
        const plantilla = readJsonFile<CampoPlantilla[]>(
          path.join(base, "plantilla-campos.json"),
        )
        const ruta = path.join(outDir, "formulario.pdf")
        await generarPdf({
          plantilla,
          llenos: mapeo.llenos,
          confirmacion: mapeo.requiere_confirmacion,
          faltantes: mapeo.faltantes,
          salida: ruta,
          cliente: solicitud.cliente,
        })
        return ok({
          ruta: path.relative(ctx.directory, ruta).replace(/\\/g, "/"),
          formato: "pdf",
        })
      }

      return fail(`Formato no soportado: ${String(solicitud.formato)}`)
    })
  },
}

export const armar_paquete = {
  description:
    "Arma el paquete para firma con formulario, soportes, checklist y borrador de correo.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso"),
  },
  async execute(args: { caso: string }, ctx: ToolContext): Promise<string> {
    return safeExecute("proveedor_armar_paquete", ctx, args.caso, () => {
      if (!casoExiste(ctx.directory, args.caso)) {
        return fail(`Caso inexistente: ${args.caso}`)
      }

      const base = casoDir(ctx.directory, args.caso)
      const solicitud = readJsonFile<Solicitud>(path.join(base, "solicitud.json"))
      const exigidos = readJsonFile<string[]>(
        path.join(base, "soportes-exigidos.json"),
      )
      const index = readJsonFile<SoporteIndexItem[]>(soportesIndexPath(ctx.directory))
      const outDir = outCasoDir(ctx.directory, args.caso)
      const paqueteDir = path.join(outDir, "paquete")
      ensureDir(paqueteDir)

      // Copiar formulario o valores-portal si existen
      const candidatos = [
        "formulario.xlsx",
        "formulario.pdf",
        "valores-portal.md",
      ]
      for (const nombre of candidatos) {
        const origen = path.join(outDir, nombre)
        if (fs.existsSync(origen)) {
          fs.copyFileSync(origen, path.join(paqueteDir, nombre))
        }
      }

      const checklistItems = exigidos.map((tipo) => evaluarSoporte(tipo, index))
      const soportesDirAbs = soportesDir(ctx.directory)
      for (const item of checklistItems) {
        if (item.estado === "presente" || item.estado === "vencido") {
          if (item.archivo) {
            const origen = path.join(soportesDirAbs, item.archivo)
            if (fs.existsSync(origen)) {
              fs.copyFileSync(origen, path.join(paqueteDir, item.archivo))
            }
          }
        }
      }

      const bloqueantes = checklistItems.filter(
        (i) => i.estado === "ausente" || i.estado === "vencido",
      )
      const listo_para_firma = bloqueantes.length === 0

      // Re-mapear para listar faltantes de campos en checklist (no bloquean)
      let camposFaltantes: CampoFaltante[] = []
      try {
        const campos = leerCamposPlantilla(
          ctx.directory,
          args.caso,
          solicitud.formato,
          solicitud.pais,
        )
        const mapeo = mapearCamposInterno(
          ctx.directory,
          args.caso,
          campos.map((c) => ({ etiqueta: c.etiqueta })),
        )
        camposFaltantes = mapeo.faltantes
      } catch {
        /* si la plantilla falla, el checklist de soportes igual se emite */
      }

      const checklistLines = [
        `# Checklist — ${args.caso}`,
        "",
        `Cliente: ${solicitud.cliente}`,
        `País: ${solicitud.pais}`,
        `listo_para_firma: ${listo_para_firma}`,
        "",
        "## Soportes",
        "",
        ...checklistItems.map((i) => {
          const vig = i.vigencia_hasta ? ` (vigencia_hasta: ${i.vigencia_hasta})` : ""
          return `- [${i.estado}] ${i.tipo}${vig}`
        }),
        "",
        "## Campos faltantes (no bloquean firma)",
        "",
        camposFaltantes.length === 0
          ? "- Ninguno"
          : camposFaltantes.map((f) => `- ${f.etiqueta}: ${f.motivo}`).join("\n"),
        "",
      ]
      writeTextFile(path.join(paqueteDir, "checklist.md"), checklistLines.join("\n"))

      const maestro = loadMaestro(ctx.directory)
      const glosario = loadGlosario(ctx.directory)
      const campos = (() => {
        try {
          return leerCamposPlantilla(
            ctx.directory,
            args.caso,
            solicitud.formato,
            solicitud.pais,
          )
        } catch {
          return [] as CampoSolicitado[]
        }
      })()

      const datosCorreo: string[] = []
      for (const campo of campos) {
        const resolved = resolverEtiqueta(glosario, campo.etiqueta)
        if (!resolved || esClaveBancaria(resolved.clave)) continue
        const valor = valorToString(getMaestroValue(maestro, resolved.clave))
        if (valor !== undefined) {
          datosCorreo.push(`- ${campo.etiqueta}: ${valor}`)
        }
      }

      const borrador = [
        `# Borrador de correo — ${solicitud.cliente}`,
        "",
        `Para: ${solicitud.de ?? "cliente"}`,
        `Asunto: Re: ${solicitud.asunto ?? "Registro como proveedor"}`,
        "",
        "Estimados,",
        "",
        "Adjuntamos el formulario diligenciado y los soportes solicitados para el registro como proveedor de Periferia IT Group S.A.S.",
        "",
        "Resumen de datos incluidos (sin información bancaria):",
        ...datosCorreo,
        "",
        listo_para_firma
          ? "El paquete está listo para la firma del representante legal."
          : "Atención: hay soportes ausentes o vencidos. Ver checklist.md antes de firmar.",
        "",
        "Saludos cordiales,",
        "Analista administrativa",
        "",
      ]
      writeTextFile(path.join(paqueteDir, "borrador-correo.md"), borrador.join("\n"))

      const checklist = {
        soportes: checklistItems,
        campos_faltantes: camposFaltantes,
        listo_para_firma,
      }

      return ok({
        ruta: path.relative(ctx.directory, paqueteDir).replace(/\\/g, "/"),
        listo_para_firma,
        checklist,
      })
    })
  },
}

export const simular_envio = {
  description:
    "Simula el envío del paquete solo si el usuario confirmó explícitamente en el turno anterior.",
  args: {
    caso: z.string().describe("Nombre de la carpeta del caso"),
    confirmado: z
      .boolean()
      .describe("Debe ser true solo tras confirmación explícita del usuario"),
  },
  async execute(
    args: { caso: string; confirmado: boolean },
    ctx: ToolContext,
  ): Promise<string> {
    return safeExecute("proveedor_simular_envio", ctx, args.caso, () => {
      if (!args.confirmado) {
        return fail("requiere confirmación explícita")
      }
      if (!casoExiste(ctx.directory, args.caso)) {
        return fail(`Caso inexistente: ${args.caso}`)
      }
      const outDir = outCasoDir(ctx.directory, args.caso)
      ensureDir(outDir)
      const ruta = path.join(outDir, "ENVIO-SIMULADO.md")
      writeTextFile(
        ruta,
        [
          `# Envío simulado — ${args.caso}`,
          "",
          `Fecha: ${new Date().toISOString()}`,
          "Estado: simulado (no se envió correo real)",
          "Confirmación humana: recibida",
          "",
        ].join("\n"),
      )
      return ok({
        ruta: path.relative(ctx.directory, ruta).replace(/\\/g, "/"),
      })
    })
  },
}

/** Registro de herramientas para el agente y demo.ts */
export const proveedorTools = {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
} as const
