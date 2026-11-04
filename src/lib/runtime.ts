import path from "node:path"
import fs from "node:fs"

function hasFixtures(dir: string): boolean {
  return fs.existsSync(path.join(dir, "fixtures", "reto-01", "casos"))
}

function walkUpForFixtures(start: string): string | null {
  let dir = path.resolve(start)
  for (let i = 0; i < 8; i++) {
    if (hasFixtures(dir)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** Raíz del repo (local o despliegue Vercel). Sin import.meta (rompe en CJS de Vercel). */
export function getProjectRoot(): string {
  if (process.env.PROJECT_ROOT) {
    const forced = path.resolve(process.env.PROJECT_ROOT)
    if (hasFixtures(forced)) return forced
  }

  const candidates = [process.cwd(), path.join(process.cwd(), ".."), "/var/task"]
  for (const c of candidates) {
    const found = walkUpForFixtures(c)
    if (found) return found
  }
  return process.cwd()
}

export function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
}

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
