import { glosarioPath, readJsonFile } from "./paths.js"

export type Glosario = Record<string, string>

const AMBIGUAS_TRIBUTARIAS = new Set([
  "identificación tributaria",
  "identificacion tributaria",
  "número de identificación fiscal",
  "numero de identificacion fiscal",
])

const ETIQUETAS_TRIBUTARIAS = new Set([
  "nit",
  "ruc",
  "rtn",
  "identificación tributaria",
  "identificacion tributaria",
  "número de identificación fiscal",
  "numero de identificacion fiscal",
])

export const ID_TRIBUTARIO_POR_PAIS: Record<string, string> = {
  CO: "NIT",
  EC: "RUC",
  PE: "RUC",
  PA: "RUC",
  HN: "RTN",
}

export function loadGlosario(directory: string): Glosario {
  return readJsonFile<Glosario>(glosarioPath(directory))
}

export function normalizarEtiqueta(etiqueta: string): string {
  return etiqueta.trim().toLowerCase()
}

export function esEtiquetaTributariaAmbiguo(etiqueta: string): boolean {
  return AMBIGUAS_TRIBUTARIAS.has(normalizarEtiqueta(etiqueta))
}

export function esEtiquetaTributaria(etiqueta: string): boolean {
  return ETIQUETAS_TRIBUTARIAS.has(normalizarEtiqueta(etiqueta))
}

export function propuestaIdPais(pais: string): string {
  return ID_TRIBUTARIO_POR_PAIS[pais.toUpperCase()] ?? "NIT"
}

/**
 * Busca la clave del maestro para una etiqueta.
 * Confianza 1.0 = match exacto (tras normalizar); 0.85 = match case-insensitive en glosario.
 */
export function resolverEtiqueta(
  glosario: Glosario,
  etiqueta: string,
): { clave: string; confianza: number } | null {
  if (Object.prototype.hasOwnProperty.call(glosario, etiqueta)) {
    return { clave: glosario[etiqueta], confianza: 1 }
  }
  const norm = normalizarEtiqueta(etiqueta)
  for (const [k, v] of Object.entries(glosario)) {
    if (normalizarEtiqueta(k) === norm) {
      return { clave: v, confianza: 0.85 }
    }
  }
  return null
}

export function esClaveBancaria(clave: string): boolean {
  return clave.startsWith("banco.")
}
