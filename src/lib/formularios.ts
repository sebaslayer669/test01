import path from "node:path"
import fs from "node:fs"
import ExcelJS from "exceljs"
import PDFDocument from "pdfkit"
import type { CampoLleno, CampoConfirmacion, CampoFaltante } from "../tools/types.js"
import { ensureDir, writeTextFile } from "./paths.js"

export type CeldaPlantilla = {
  hoja: string
  celda_etiqueta: string
  etiqueta: string
  celda_valor: string
}

export type CampoPlantilla = {
  etiqueta: string
  obligatorio: boolean
}

function valorPorEtiqueta(
  etiqueta: string,
  llenos: CampoLleno[],
  confirmacion: CampoConfirmacion[],
): string {
  const lleno = llenos.find((c) => c.etiqueta === etiqueta)
  if (lleno) return lleno.valor
  const conf = confirmacion.find((c) => c.etiqueta === etiqueta && c.valor)
  if (conf?.valor) return conf.valor
  return ""
}

export async function generarXlsx(opts: {
  plantilla: CeldaPlantilla[]
  llenos: CampoLleno[]
  confirmacion: CampoConfirmacion[]
  salida: string
}): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const hojas = new Map<string, ExcelJS.Worksheet>()

  for (const item of opts.plantilla) {
    let sheet = hojas.get(item.hoja)
    if (!sheet) {
      sheet = wb.addWorksheet(item.hoja)
      hojas.set(item.hoja, sheet)
    }
    sheet.getCell(item.celda_etiqueta).value = item.etiqueta
    const valor = valorPorEtiqueta(item.etiqueta, opts.llenos, opts.confirmacion)
    sheet.getCell(item.celda_valor).value = valor
  }

  ensureDir(path.dirname(opts.salida))
  await wb.xlsx.writeFile(opts.salida)
}

export async function generarPdf(opts: {
  plantilla: CampoPlantilla[]
  llenos: CampoLleno[]
  confirmacion: CampoConfirmacion[]
  faltantes: CampoFaltante[]
  salida: string
  cliente: string
}): Promise<void> {
  ensureDir(path.dirname(opts.salida))
  const doc = new PDFDocument({ margin: 50, size: "LETTER" })
  const stream = fs.createWriteStream(opts.salida)
  doc.pipe(stream)

  doc.fontSize(16).text("Formulario de registro como proveedor", { underline: true })
  doc.moveDown(0.5)
  doc.fontSize(11).text(`Cliente: ${opts.cliente}`)
  doc.moveDown()

  for (const campo of opts.plantilla) {
    const valor = valorPorEtiqueta(campo.etiqueta, opts.llenos, opts.confirmacion)
    const marca = campo.obligatorio ? " *" : ""
    doc.fontSize(10).fillColor("#333333").text(`${campo.etiqueta}${marca}`, { continued: false })
    doc.fontSize(11).fillColor("#000000").text(valor || "(sin valor)", { indent: 12 })
    doc.moveDown(0.4)
  }

  if (opts.faltantes.length > 0) {
    doc.moveDown()
    doc.fontSize(10).fillColor("#666666").text("Campos sin fuente en el maestro:")
    for (const f of opts.faltantes) {
      doc.text(`- ${f.etiqueta}: ${f.motivo}`, { indent: 12 })
    }
  }

  doc.end()
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve())
    stream.on("error", reject)
  })
}

export function generarValoresPortalMd(opts: {
  plantilla: CampoPlantilla[]
  llenos: CampoLleno[]
  confirmacion: CampoConfirmacion[]
  faltantes: CampoFaltante[]
  salida: string
  cliente: string
}): void {
  const lines: string[] = [
    `# Valores para portal — ${opts.cliente}`,
    "",
    "Formato portal no se automatiza. Copia estos valores manualmente.",
    "",
    "| Campo | Valor | Estado |",
    "|---|---|---|",
  ]

  for (const campo of opts.plantilla) {
    const lleno = opts.llenos.find((c) => c.etiqueta === campo.etiqueta)
    const conf = opts.confirmacion.find((c) => c.etiqueta === campo.etiqueta)
    const falt = opts.faltantes.find((c) => c.etiqueta === campo.etiqueta)
    if (lleno) {
      lines.push(`| ${campo.etiqueta} | ${lleno.valor} | lleno |`)
    } else if (conf?.valor) {
      lines.push(`| ${campo.etiqueta} | ${conf.valor} | requiere_confirmacion |`)
    } else if (falt) {
      lines.push(`| ${campo.etiqueta} |  | faltante |`)
    } else {
      lines.push(`| ${campo.etiqueta} |  | pendiente |`)
    }
  }

  writeTextFile(opts.salida, lines.join("\n") + "\n")
}
