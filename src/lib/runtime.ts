import path from "node:path"
import fs from "node:fs"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

/** Raíz del repo (local o despliegue Vercel). */
export function getProjectRoot(): string {
  if (process.env.PROJECT_ROOT) return path.resolve(process.env.PROJECT_ROOT)
  // En Vercel el cwd del lambda es la raíz del proyecto desplegado.
  if (process.env.VERCEL) return process.cwd()
  // src/lib -> ../..
  return path.resolve(here, "..", "..")
}

export function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
}

/**
 * Carpeta escribible para out/ y sesiones.
 * En Vercel el FS del proyecto es de solo lectura → usamos /tmp.
 */
export function getWritableRoot(): string {
  if (process.env.OUT_ROOT) return path.resolve(process.env.OUT_ROOT)
  if (isServerless()) {
    const dir = path.join("/tmp", "reto-01-registro-proveedor")
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }
  return getProjectRoot()
}

export function getOutRoot(): string {
  return path.join(getWritableRoot(), "out")
}
