/**
 * Verificación determinista sin modelo de lenguaje.
 * Uso: npm run demo  |  bun run demo.ts
 */
import fs from "node:fs"
import path from "node:path"
import {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
} from "./src/tools/proveedor.js"
import type { MapeoResultado } from "./src/tools/types.js"

const ROOT = process.cwd()
const CASOS_DIR = path.join(ROOT, "fixtures", "reto-01", "casos")
const OUT_DIR = path.join(ROOT, "out")

type JsonResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string }

function parseResult<T>(raw: string): JsonResult<T> {
  return JSON.parse(raw) as JsonResult<T>
}

function limpiarOut(): void {
  if (fs.existsSync(OUT_DIR)) {
    fs.rmSync(OUT_DIR, { recursive: true, force: true })
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
}

function listarCasos(): string[] {
  return fs
    .readdirSync(CASOS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
}

async function procesarCaso(caso: string): Promise<void> {
  const ctx = { directory: ROOT, sessionId: `demo-${caso}` }
  console.log(`\n========== ${caso} ==========`)

  const lectura = parseResult<{
    pais: string
    cliente: string
    formato: string
    campos: Array<{ etiqueta: string }>
    soportes: string[]
  }>(await leer_solicitud.execute({ caso }, ctx))

  if (!lectura.ok) {
    console.log(`  leer_solicitud: ERROR — ${lectura.error}`)
    return
  }

  console.log(`  Cliente:  ${lectura.data.cliente}`)
  console.log(`  País:     ${lectura.data.pais}`)
  console.log(`  Formato:  ${lectura.data.formato}`)
  console.log(`  Campos:   ${lectura.data.campos.length}`)
  console.log(`  Soportes: ${lectura.data.soportes.join(", ")}`)

  const mapeo = parseResult<MapeoResultado>(
    await mapear_campos.execute(
      {
        caso,
        campos: lectura.data.campos.map((c) => ({ etiqueta: c.etiqueta })),
      },
      ctx,
    ),
  )

  if (!mapeo.ok) {
    console.log(`  mapear_campos: ERROR — ${mapeo.error}`)
    return
  }

  console.log(
    `  Mapeo:    llenos=${mapeo.data.llenos.length} faltantes=${mapeo.data.faltantes.length} requiere_confirmacion=${mapeo.data.requiere_confirmacion.length}`,
  )
  for (const f of mapeo.data.faltantes) {
    console.log(`    · faltante: ${f.etiqueta} (${f.motivo})`)
  }
  for (const c of mapeo.data.requiere_confirmacion) {
    console.log(`    · confirmación: ${c.etiqueta} — ${c.nota}`)
  }

  const form = parseResult<{ ruta: string; formato: string }>(
    await generar_formulario.execute({ caso, mapeo: mapeo.data }, ctx),
  )

  if (form.ok) {
    console.log(`  Formulario: ${form.data.ruta} (${form.data.formato})`)
  } else {
    console.log(`  Formulario: ${form.error}`)
  }

  const paquete = parseResult<{
    ruta: string
    listo_para_firma: boolean
    checklist: { soportes: Array<{ tipo: string; estado: string }> }
  }>(await armar_paquete.execute({ caso }, ctx))

  if (!paquete.ok) {
    console.log(`  armar_paquete: ERROR — ${paquete.error}`)
    return
  }

  console.log(`  Paquete:  ${paquete.data.ruta}`)
  console.log(`  listo_para_firma: ${paquete.data.listo_para_firma}`)
  for (const s of paquete.data.checklist.soportes) {
    console.log(`    · soporte [${s.estado}] ${s.tipo}`)
  }

  // Verifica el rechazo sin confirmación; no simula envío real en la demo.
  const envio = parseResult(
    await simular_envio.execute({ caso, confirmado: false }, ctx),
  )
  if (!envio.ok) {
    console.log(`  simular_envio (sin confirmación): ${envio.error}`)
  }
}

async function main(): Promise<void> {
  console.log("demo.ts — verificación sin modelo de lenguaje")
  console.log(`root: ${ROOT}`)
  limpiarOut()
  console.log("out/ limpiado")

  const casos = listarCasos()
  if (casos.length === 0) {
    console.error("No se encontraron casos en fixtures/reto-01/casos/")
    process.exitCode = 1
    return
  }

  for (const caso of casos) {
    await procesarCaso(caso)
  }

  console.log("\n========== RESUMEN ==========")
  console.log(`Casos procesados: ${casos.length}`)
  console.log("Salida en out/<caso>/")
  console.log("Listo.")
}

main().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
