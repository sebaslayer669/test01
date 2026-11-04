import { maestroPath, readJsonFile } from "./paths.js"

export type Maestro = Record<string, unknown>

export function loadMaestro(directory: string): Maestro {
  return readJsonFile<Maestro>(maestroPath(directory))
}

/** Resuelve claves anidadas tipo `contacto_comercial.email`. */
export function getMaestroValue(
  maestro: Maestro,
  clave: string,
): unknown {
  const parts = clave.split(".")
  let current: unknown = maestro
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function valorToString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ")
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    if ("valor" in obj) {
      const moneda = obj.moneda ? ` ${String(obj.moneda)}` : ""
      return `${String(obj.valor)}${moneda}`.trim()
    }
    return JSON.stringify(value)
  }
  return String(value)
}
