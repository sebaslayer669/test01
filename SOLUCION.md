# SOLUCION.md — Reto 01 Registro como Proveedor

## 1. Problema en una frase

La analista administrativa pierde tiempo transcribiendo a mano datos que ya existen en un repositorio interno hacia formularios Excel/PDF de clientes; el agente prepara el paquete listo para firma humana, sin inventar datos ni enviar solo.

## 2. Arquitectura

### 2.1 Diagrama lógico

```
┌────────────────────────────┐     HTTP      ┌──────────────────────────────────────────────┐
│  web/ (chat)               │ ────────────▶ │  src/server.ts                               │
│  - historial               │ ◀──────────── │  - POST /api/chat                            │
│  - chips por caso (id)     │               │  - GET  /api/sessions/:id                    │
│  - tool calls visibles     │               │  - GET  /api/health                          │
│  - banner confirmación     │               │  - estáticos web/                            │
└────────────────────────────┘               │  - sesiones en memoria (src/sessions.ts)     │
                                             │                                              │
                                             │  LLM_PROVIDER=interno │ openai               │
                                             │         │                    │               │
                                             │         ▼                    ▼               │
                                             │  agent-interno.ts     agent-loop.ts          │
                                             │  (reglas / $0)        + llm/openai.ts        │
                                             │         │                    │               │
                                             │         └────────┬───────────┘               │
                                             │                  ▼                           │
                                             │     tools/registry.ts → proveedor.ts (Zod)   │
                                             └──────────────┬───────────────────┬───────────┘
                                                            │                   │
                                                     fixtures/ (RO)          out/ (RW)
                                                     maestro, glosario,      formularios,
                                                     casos, soportes         paquete, log
```

### 2.2 Separación evaluada por el PRD

| Capa | Ubicación canónica | Rol |
|---|---|---|
| Comportamiento | `modulo/agent.md` (fallback `agent/prompt.md`) | System prompt; reglas de no inventar / confirmación humana |
| Conocimiento | `modulo/skill/registro-proveedor/SKILL.md` (fallback `src/knowledge/…`) | Proceso de negocio que el agente consulta |
| Ejecución | `src/tools/proveedor.ts` + `src/lib/*` | Única fuente de valores; tipada con Zod |
| Orquestación interna | `src/agent-interno.ts` | Flujo determinista por caso (sin tokens) |
| Orquestación LLM | `src/agent-loop.ts` + `src/llm/*` | Bucle prompt → modelo → tools (opcional) |
| UI | `web/{index.html,app.js,styles.css}` | Chat para usuaria final + atajos por caso |
| Verificación | `demo.ts` | Misma pipeline de tools **sin** modelo |

Un cambio de reglas de tono/negocio toca `modulo/agent.md` o el resumen amigable en `agent-interno.ts`. Un cambio de fuente de datos toca las tools, no el servidor HTTP.

### 2.3 Piezas de runtime

| Archivo | Responsabilidad |
|---|---|
| `src/server.ts` | API HTTP, routing proveedor, estáticos |
| `src/lib/env.ts` | `.env`; `LLM_PROVIDER` (`interno` \| `openai`) |
| `src/tools/registry.ts` | Nombres `proveedor_*`, validación Zod, `looksLikeConfirmation` |
| `src/lib/formularios.ts` | Excel (`exceljs`) / PDF (`pdfkit`) / `valores-portal.md` |
| `src/lib/vigencia.ts` | Soportes presente / ausente / vencido |
| `demo.ts` | Limpia `out/`, corre los 4 casos, imprime resumen |

## 3. Ciclo del agente

Hay **dos modos** seleccionables por `LLM_PROVIDER`. Ambos usan las **mismas tools** y el mismo contrato `{ ok, data \| error }`.

### 3.1 Modo `interno` (default en local — sin tokens)

Diseñado para la analista final y para demos estables:

1. El front envía `{ sessionId, message }` a `POST /api/chat`.
2. `runInternoTurn` detecta el **id del caso** en el mensaje (`co-industrias-delta`, `ec-corp-andina`, `hn-agroexport-sula`, `pa-logistica-istmo`) o alias cortos (`delta`, `andina`, `sula`, `istmo`).
3. Ejecuta en orden fijo:
   1. `proveedor_leer_solicitud`
   2. `proveedor_mapear_campos`
   3. `proveedor_generar_formulario`
   4. `proveedor_armar_paquete`
4. Redacta un **resumen amigable** (cliente, campos completados/faltantes, soportes en lenguaje claro, si está listo para firma) y pregunta confirmación de envío.
5. Si el turno anterior pedía confirmación y el usuario responde `sí` / `envía` → `proveedor_simular_envio({ confirmado: true })`. Si responde `no` → no envía y mantiene el paquete.
6. Cada tool call queda visible en el chat (nombre, args, resumen) y en `out/<caso>/log.jsonl`.

No hay llamadas a OpenAI: costo de tokens = **$0**.

### 3.2 Modo `openai` (opcional)

1. `runAgentTurn` carga prompt + conocimiento desde `modulo/` (sin frontmatter).
2. Bucle (tope `MAX_TOOL_ITERATIONS`, default 25):
   - `OpenAiAdapter.enviar(mensajes, herramientas)` con function calling.
   - Valida args con Zod → ejecuta `proveedor_*` → append al historial.
   - Sin tool calls → texto final al usuario.
3. Guardrail: si el mensaje no parece confirmación explícita, `proveedor_simular_envio` no puede ir con `confirmado: true`.
4. Tope `MAX_TOKENS_PER_SESSION` corta el gasto por sesión.
5. El front resalta `needsConfirmation` igual que en modo interno.

### 3.3 Confirmación humana (ambos modos)

- El agente **nunca** firma ni envía de verdad.
- “Enviar” solo escribe `out/<caso>/ENVIO-SIMULADO.md`.
- UI: banner ámbar + burbuja resaltada cuando `needsConfirmation === true`.

## 4. Elección del modelo y análisis de costos

### 4.1 Estrategia dual

| Modo | Cuándo usarlo | Costo por caso |
|---|---|---|
| **`interno`** (default) | Local, defensa estable, 4 casos conocidos del fixture | **US$ 0** |
| **`openai` / `gpt-4o-mini`** | Lenguaje libre, preguntas fuera del flujo fijo | ~**US$ 0.01–0.05** |

Se eligió `gpt-4o-mini` como modelo cloud por buen tool calling, latencia baja y precio contenido. La interfaz `LlmAdapter` (`enviar(mensajes, herramientas)`) permite cambiar de proveedor sin tocar el ciclo.

### 4.2 Desglose estimado (modo OpenAI, un caso típico)

Supuestos: ~1 system prompt + historial corto, 4–5 tool rounds, respuesta final.

| Concepto | Orden de magnitud |
|---|---|
| Tokens de entrada (prompt + tools + resultados) | 3 000–8 000 |
| Tokens de salida (tool args + resumen) | 500–2 000 |
| Llamadas al API | 5–8 |
| Costo gpt-4o-mini (precios públicos orientativos 2026) | **≈ US$ 0.01–0.05 / caso** |
| 8–12 solicitudes/mes (volumen del PRD) | **≈ US$ 0.10–0.60 / mes** solo de modelo |

### 4.3 Comparativa con el resto del sistema

| Componente | Costo de modelo |
|---|---|
| `demo.ts` | $0 (sin LLM) |
| Chat `LLM_PROVIDER=interno` | $0 |
| Chat `LLM_PROVIDER=openai` | ver tabla 4.2 |
| Generación Excel/PDF local | $0 (CPU local) |

**Conclusión de costo:** para el volumen real del proceso (pocas solicitudes al mes), el gasto de modelo es despreciable frente al tiempo de la analista. Aun así, el modo **interno** elimina dependencia de clave y de facturación en demos y ambientes restringidos.

## 5. Diseño del portal web (PRD §7.4)

El formato `portal` **no se automatiza**: la tool responde `formato no soportado` y escribe `out/<caso>/valores-portal.md`.

| Tema | Propuesta para una fase posterior |
|---|---|
| Estrategia | RPA/Playwright o extensión **con humano en el loop** |
| Límites | CAPTCHA, MFA, cambios de layout, ToS del cliente |
| Credenciales | Vault; ingreso humano; nunca en repo, prompt ni logs |
| Agente | Prepara valores, vigencias, checklist |
| Humano | Login, MFA, revisión, clic en «Enviar» |

## 6. Decisiones de diseño y trade-offs

1. **Tools deterministas vs. LLM que “rellena” el Excel**  
   - Elegido: valores solo desde tools + maestro/glosario.  
   - Descartado: que el modelo invente el JSON del formulario (riesgo NIT/cuenta).

2. **Agente interno por defecto vs. OpenAI siempre**  
   - Elegido: `LLM_PROVIDER=interno` para chat usable sin tokens, alineado a los 4 casos.  
   - Descartado: obligar API key para toda interacción. OpenAI queda como interruptor explícito.

3. **Node 20+ / `tsx` vs. Bun exclusivo**  
   - Elegido: Node (disponible en el entorno); scripts compatibles con Bun.  
   - Descartado: bloquear la entrega a Bun.

4. **PDFKit vs. AcroForm**  
   - Elegido: PDF generado con etiqueta/valor (aceptado por el PRD).  
   - Descartado: AcroForm (fixtures no traen PDF editables reales).

5. **Front HTML vanilla vs. React**  
   - Elegido: un comando (`npm run dev` / `start`), sin bundler.  
   - UX: chips con **id exacto del caso**, empty state con plantilla de prompt, tono de respuestas para usuaria final.

6. **Resúmenes amigables vs. dump técnico**  
   - Elegido: lenguaje de analista (“vencido — hay que actualizarlo”, “listo para firma”).  
   - Las tool calls siguen visibles debajo para trazabilidad en la evaluación.

7. **Túnel Cloudflare vs. PaaS inmediato**  
   - Elegido: túnel rápido (`cloudflared`) + `Dockerfile`/`render.yaml` listos.  
   - Trade-off: la URL del túnel cambia si se reinicia; para defensa estable conviene Render/Fly con el Docker.

8. **Bonus `modulo/` como fuente canónica**  
   - Elegido: app lee primero `modulo/agent.md` y `SKILL.md`; tools reexportadas.  
   - Evita copias divergentes entre app y empaquetado reutilizable.

## 7. Supuestos

- Los fixtures cubren la variabilidad pedida (xlsx / pdf / portal; CO, EC, HN, PA).
- El maestro está actualizado; no hay dueño de dato en este alcance.
- La fecha del sistema define vigencias; con fecha ~2026-11-03, `camara_comercio` y `parafiscales` están vencidos → `listo_para_firma = false` cuando aplican (RN3 correcto).
- “Enviar” solo escribe `ENVIO-SIMULADO.md`.
- Sesiones en memoria de un solo proceso (sin Redis / sticky sessions).
- El modo interno asume que el usuario nombra un caso conocido (asistido por chips en el front).

## 8. Cobertura de historias de usuario

| HU | Estado | Notas / falta para producción |
|---|---|---|
| HU-1 Leer solicitud | Hecho | Errores tipados si plantilla/caso inválido |
| HU-2 Mapear campos | Hecho | Glosario + ID extranjero con confirmación |
| HU-3 Generar formulario | Hecho (P0/P1/P2) | Portal → `valores-portal.md` |
| HU-4 Paquete para firma | Hecho | Checklist, borrador sin datos bancarios, confirmación |
| HU-5 Errores | Hecho | Tools no lanzan; mensajes claros al usuario |

## 9. Uso de IA (construcción del reto)

| Asistente | Para qué | Qué se descartó / ajustó |
|---|---|---|
| Cursor (Composer) | Scaffold, tools, ciclos interno/OpenAI, front, docs, túnel | Se descartó inventar valores; se reforzó Zod, guardrail de envío y modo interno $0 |
| OpenAI (runtime opcional) | Solo si `LLM_PROVIDER=openai` | No es necesario para demo ni para el flujo de los 4 casos |

Las tools son la fuente de verdad; el orquestador (interno o LLM) solo decide cuándo llamarlas y cómo explicar el resultado.

## 10. Consideraciones y riesgos de producción

### 10.1 Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| El modelo completa un faltante con un valor plausible | Solo tools afirman valores; UI muestra tool calls; modo interno no “alucina” datos |
| Soportes vencidos pasan desapercibidos | Bloqueo de `listo_para_firma` + checklist en lenguaje claro |
| Filtración de API key | Solo backend/`.env`; nunca front, repo ni `/api/health` |
| Portales con MFA/CAPTCHA | Humano opera el portal; agente prepara valores copiables |
| Costo descontrolado | Default sin tokens; topes de iteraciones/tokens en modo openai |
| Plantillas reales peores que fixtures | Ampliar glosario + cola `requiere_confirmacion` + revisión humana |
| Túnel inestable en defensa | Preferir despliegue Docker (Render/Fly/Railway) con env vars |
| Sesiones en un solo nodo | Para HA: store externo (Redis) o sticky sessions |

### 10.2 Camino a producción (recomendado)

1. **Datos:** dueño del maestro y proceso de actualización de soportes/vigencias.
2. **Secretos:** vault / secret manager; rotación de claves; sin keys en chat ni commits.
3. **Observabilidad:** centralizar `log.jsonl` (o OpenTelemetry); alertas si `listo_para_firma` falla por vencidos.
4. **Integraciones posteriores:** correo, firma electrónica, SharePoint — siempre con confirmación humana en el paso irreversible.
5. **Despliegue:** usar `Dockerfile` + `render.yaml` (o equivalente); healthcheck en `/api/health`.
6. **UX:** mantener tono de analista; chips/casos pueden evolucionar a bandeja de solicitudes reales.
7. **Modo híbrido:** interno/reglas para el happy path; LLM solo para desambiguar etiquetas nuevas o redactar borradores.

### 10.3 Volumen y costo operativo

Con 8–12 registros/mes, el cuello de botella no es el modelo sino la vigencia de soportes y la confirmación humana. El diseño actual ya separa “preparar” (agente) de “firmar/enviar” (humano), que es el punto de mayor riesgo legal/operativo.

## Bonus — módulo reutilizable

```
modulo/
├── agent.md                         # prompt + frontmatter (mode: primary; edit/bash deny)
├── tools/proveedor.ts               # reexporta src/tools/proveedor.ts
└── skill/registro-proveedor/SKILL.md
```

La aplicación **consume estas mismas piezas** (lectura preferente desde `modulo/`), de modo que el empaquetado no diverge del runtime.

## Dependencias justificadas

| Paquete | Motivo |
|---|---|
| `zod` | Contrato obligatorio de argumentos de tools |
| `exceljs` | Escritura de `.xlsx` celda a celda |
| `pdfkit` | PDF generado etiqueta/valor |
| `openai` | Cliente del proveedor cloud (modo opcional) |
| `tsx` / `typescript` | Ejecución y typecheck sin build complejo |

## Cómo operar la solución entregada

```bash
npm install
cp .env.example .env   # LLM_PROVIDER=interno por defecto
npm run demo           # verificación sin modelo
npm run start          # chat local http://localhost:3000
```

- Chat OpenAI: `LLM_PROVIDER=openai` + `OPENAI_API_KEY`.
- **Vercel:** la API vive en `api/*.ts` (serverless); el front en `public/` (sync desde `web/` con `npm run sync:public`). Escritura de `out/` y sesiones en `/tmp`. Ver `README.md` → “Despliegue en Vercel”.
- Alternativa pública: túnel Cloudflare o Docker (`Dockerfile` / `render.yaml`).
