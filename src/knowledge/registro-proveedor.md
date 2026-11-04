<!-- Fuente canónica: modulo/skill/registro-proveedor/SKILL.md (la app carga ese archivo). -->

# Conocimiento del proceso — Registro como proveedor

## Qué es
Proceso administrativo para registrar a Periferia IT Group como proveedor ante un cliente. La analista recibe la solicitud (correo + plantilla), completa el formulario con datos del repositorio maestro, adjunta soportes y deja el paquete listo para la firma del representante legal.

## Actores
- **Recepción**: deja la solicitud en la carpeta del caso (fixtures).
- **Analista administrativa**: conversa con este agente; revisa faltantes y aprueba.
- **Representante legal**: firma; no usa el agente.
- **Cliente**: fuera del sistema.

## Entradas por caso (`fixtures/reto-01/casos/<caso>/`)
- `solicitud.json` — correo normalizado (país, cliente, formato).
- `plantilla-celdas.json` — Excel.
- `plantilla-campos.json` — PDF o portal.
- `soportes-exigidos.json` — tipos de soporte pedidos.

## Repositorio maestro
- `fixtures/reto-01/repositorio/maestro.json` — datos corporativos.
- `fixtures/reto-01/repositorio/soportes/` — archivos + `index.json` con vigencias.
- `fixtures/reto-01/glosario-campos.json` — sinónimos de etiquetas → claves del maestro.

## Salidas (`out/<caso>/`)
- `formulario.xlsx` | `formulario.pdf` | `valores-portal.md`
- `paquete/` — formulario, soportes, `checklist.md`, `borrador-correo.md`
- `ENVIO-SIMULADO.md` — solo tras confirmación humana
- `log.jsonl` — bitácora de herramientas

## Límites
Sin integración real a correo, firma electrónica ni portales. Sin base de datos. Sin autenticación obligatoria.
