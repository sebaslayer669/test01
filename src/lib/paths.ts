import path from "node:path"
import fs from "node:fs"
import { getOutRoot } from "./runtime.js"

export function resolveFromRoot(directory: string, ...parts: string[]): string {
  return path.resolve(directory, ...parts)
}

export function casosDir(directory: string): string {
  return resolveFromRoot(directory, "fixtures", "reto-01", "casos")
}

export function casoDir(directory: string, caso: string): string {
  return path.join(casosDir(directory), caso)
}

export function repositorioDir(directory: string): string {
  return resolveFromRoot(directory, "fixtures", "reto-01", "repositorio")
}

export function soportesDir(directory: string): string {
  return path.join(repositorioDir(directory), "soportes")
}

export function glosarioPath(directory: string): string {
  return resolveFromRoot(directory, "fixtures", "reto-01", "glosario-campos.json")
}

export function maestroPath(directory: string): string {
  return path.join(repositorioDir(directory), "maestro.json")
}

export function soportesIndexPath(directory: string): string {
  return path.join(soportesDir(directory), "index.json")
}

export function outCasoDir(_directory: string, caso: string): string {
  // En local: <proyecto>/out. En Vercel: /tmp/.../out (FS escribible).
  return path.join(getOutRoot(), caso)
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

export function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8")
  return JSON.parse(raw) as T
}

export function writeTextFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, content, "utf8")
}

export function casoExiste(directory: string, caso: string): boolean {
  return fs.existsSync(casoDir(directory, caso))
}
