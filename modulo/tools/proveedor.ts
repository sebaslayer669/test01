/**
 * Módulo reutilizable: mismas herramientas que usa la aplicación.
 * Importable sin el servidor HTTP.
 */
export {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
  proveedorTools,
} from "../../src/tools/proveedor.js"

export type {
  ToolContext,
  ToolResult,
  MapeoResultado,
  FormatoSalida,
} from "../../src/tools/types.js"
