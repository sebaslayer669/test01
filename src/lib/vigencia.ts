export type SoporteIndexItem = {
  tipo: string
  archivo: string
  vigencia_hasta: string | null
  pais_emisor: string
  descripcion?: string
}

export type EstadoSoporte = "presente" | "ausente" | "vencido"

export function hoyISO(fecha: Date = new Date()): string {
  return fecha.toISOString().slice(0, 10)
}

export function soporteVencido(
  vigenciaHasta: string | null,
  referencia: Date = new Date(),
): boolean {
  if (!vigenciaHasta) return false
  return vigenciaHasta < hoyISO(referencia)
}

export function evaluarSoporte(
  exigido: string,
  index: SoporteIndexItem[],
  referencia: Date = new Date(),
): {
  tipo: string
  estado: EstadoSoporte
  archivo?: string
  vigencia_hasta?: string | null
  descripcion?: string
} {
  const found = index.find((s) => s.tipo === exigido)
  if (!found) {
    return { tipo: exigido, estado: "ausente" }
  }
  if (soporteVencido(found.vigencia_hasta, referencia)) {
    return {
      tipo: exigido,
      estado: "vencido",
      archivo: found.archivo,
      vigencia_hasta: found.vigencia_hasta,
      descripcion: found.descripcion,
    }
  }
  return {
    tipo: exigido,
    estado: "presente",
    archivo: found.archivo,
    vigencia_hasta: found.vigencia_hasta,
    descripcion: found.descripcion,
  }
}
