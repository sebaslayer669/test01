const SESSION_KEY = "reto01.sessionId"

/** Palabras clave exactas que el agente interno reconoce (id de carpeta del caso). */
const CASOS = [
  {
    id: "co-industrias-delta",
    pais: "CO",
    formato: "xlsx",
    cliente: "Industrias Delta",
    keywords: ["co-industrias-delta", "delta"],
  },
  {
    id: "ec-corp-andina",
    pais: "EC",
    formato: "pdf",
    cliente: "Corp. Andina",
    keywords: ["ec-corp-andina", "andina"],
  },
  {
    id: "hn-agroexport-sula",
    pais: "HN",
    formato: "xlsx",
    cliente: "Agroexport Sula",
    keywords: ["hn-agroexport-sula", "sula"],
  },
  {
    id: "pa-logistica-istmo",
    pais: "PA",
    formato: "portal",
    cliente: "Logística Istmo",
    keywords: ["pa-logistica-istmo", "istmo"],
  },
]

function promptParaCaso(casoId) {
  return `Procesa el caso "${casoId}". No envíes nada todavía.`
}

const el = {
  log: document.getElementById("log"),
  form: document.getElementById("composer"),
  message: document.getElementById("message"),
  send: document.getElementById("btn-send"),
  thinking: document.getElementById("thinking"),
  health: document.getElementById("health-pill"),
  banner: document.getElementById("confirm-banner"),
  newSession: document.getElementById("btn-new"),
  chips: document.getElementById("case-chips"),
}

function sessionId() {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

function resetSession() {
  localStorage.setItem(SESSION_KEY, crypto.randomUUID())
  el.log.innerHTML = ""
  setNeedsConfirmation(false)
  renderEmpty()
  el.message.focus()
}

function setThinking(on) {
  el.thinking.classList.toggle("hidden", !on)
  el.send.disabled = on
  el.message.disabled = on
  el.chips?.querySelectorAll("button").forEach((b) => {
    b.disabled = on
  })
}

function setNeedsConfirmation(on) {
  el.banner.classList.toggle("hidden", !on)
}

function renderCaseChips() {
  el.chips.innerHTML = ""
  for (const caso of CASOS) {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "case-chip"
    btn.title = `Palabras clave: ${caso.keywords.join(", ")}`
    btn.innerHTML = `
      <span class="case-id">${caso.id}</span>
      <span class="case-meta">${caso.pais} · ${caso.formato} · ${caso.cliente}</span>
    `
    btn.addEventListener("click", () => {
      const text = promptParaCaso(caso.id)
      el.message.value = text
      void sendMessage(text)
      el.message.value = ""
    })
    el.chips.appendChild(btn)
  }
}

function renderEmpty() {
  if (el.log.children.length > 0) return
  const div = document.createElement("div")
  div.className = "empty"
  div.id = "empty-state"

  const title = document.createElement("p")
  title.className = "empty-title"
  title.textContent = "Elige un caso con su palabra clave (id exacto)"

  const list = document.createElement("ul")
  list.className = "empty-list"
  for (const caso of CASOS) {
    const li = document.createElement("li")
    li.innerHTML = `<code>${caso.id}</code> — ${caso.cliente} (${caso.pais}, ${caso.formato})`
    list.appendChild(li)
  }

  const tip = document.createElement("p")
  tip.className = "empty-tip"
  tip.innerHTML =
    'Plantilla: <code>Procesa el caso "<em>id-del-caso</em>". No envíes nada todavía.</code>'

  div.append(title, list, tip)
  el.log.appendChild(div)
}

function clearEmpty() {
  document.getElementById("empty-state")?.remove()
}

function appendUser(text) {
  clearEmpty()
  const bubble = document.createElement("article")
  bubble.className = "bubble user"
  bubble.innerHTML = `<div class="role">Tú</div><div class="content"></div>`
  bubble.querySelector(".content").textContent = text
  el.log.appendChild(bubble)
  el.log.scrollTop = el.log.scrollHeight
}

function appendAssistant({ reply, toolCalls, needsConfirmation }) {
  clearEmpty()
  const bubble = document.createElement("article")
  bubble.className = "bubble assistant" + (needsConfirmation ? " needs-confirm" : "")

  const role = document.createElement("div")
  role.className = "role"
  role.textContent = needsConfirmation
    ? "Agente · espera confirmación (sí / envía)"
    : "Agente"
  bubble.appendChild(role)

  const content = document.createElement("div")
  content.className = "content"
  content.textContent = reply
  bubble.appendChild(content)

  if (toolCalls?.length) {
    const tools = document.createElement("div")
    tools.className = "tools"
    for (const tc of toolCalls) {
      const tool = document.createElement("div")
      tool.className = "tool" + (tc.ok === false ? " error" : "")
      const name = document.createElement("div")
      name.className = "name"
      name.textContent = tc.name
      const args = document.createElement("div")
      args.className = "args"
      args.textContent = "args: " + safeJson(tc.arguments)
      const result = document.createElement("div")
      result.className = "result"
      result.textContent = "result: " + (tc.resultSummary ?? "")
      tool.append(name, args, result)
      tools.appendChild(tool)
    }
    bubble.appendChild(tools)
  }

  el.log.appendChild(bubble)
  el.log.scrollTop = el.log.scrollHeight
  setNeedsConfirmation(Boolean(needsConfirmation))
}

function appendError(text) {
  clearEmpty()
  const bubble = document.createElement("article")
  bubble.className = "bubble assistant"
  bubble.innerHTML = `<div class="role">Error</div><div class="content"></div>`
  bubble.querySelector(".content").textContent = text
  el.log.appendChild(bubble)
  el.log.scrollTop = el.log.scrollHeight
}

function safeJson(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

async function refreshHealth() {
  try {
    const res = await fetch("/api/health")
    const data = await res.json()
    if (data.ok && (data.provider === "interno" || data.hasKey)) {
      el.health.textContent = `${data.provider}/${data.model}`
      el.health.className = "pill pill-ok"
    } else if (data.ok) {
      el.health.textContent = "sin OPENAI_API_KEY"
      el.health.className = "pill pill-warn"
    } else {
      el.health.textContent = "health error"
      el.health.className = "pill pill-warn"
    }
  } catch {
    el.health.textContent = "offline"
    el.health.className = "pill pill-warn"
  }
}

async function sendMessage(text) {
  appendUser(text)
  setThinking(true)
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionId(), message: text }),
    })
    const data = await res.json()
    if (!res.ok || data.ok === false) {
      appendError(data.error || `HTTP ${res.status}`)
      return
    }
    if (data.sessionId) {
      localStorage.setItem(SESSION_KEY, data.sessionId)
    }
    appendAssistant({
      reply: data.reply,
      toolCalls: data.toolCalls || [],
      needsConfirmation: data.needsConfirmation,
    })
  } catch (err) {
    appendError(err instanceof Error ? err.message : String(err))
  } finally {
    setThinking(false)
  }
}

el.form.addEventListener("submit", (ev) => {
  ev.preventDefault()
  const text = el.message.value.trim()
  if (!text) return
  el.message.value = ""
  void sendMessage(text)
})

el.message.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey) {
    ev.preventDefault()
    el.form.requestSubmit()
  }
})

el.newSession.addEventListener("click", () => resetSession())

renderCaseChips()
renderEmpty()
void refreshHealth()
setInterval(() => void refreshHealth(), 30_000)
