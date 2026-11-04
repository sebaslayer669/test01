export type ChatRole = "system" | "user" | "assistant" | "tool"

export type ToolParameterSchema = {
  type: "object"
  properties: Record<string, unknown>
  required?: string[]
}

export type LlmToolDefinition = {
  name: string
  description: string
  parameters: ToolParameterSchema
}

export type ChatMessage = {
  role: ChatRole
  content: string | null
  tool_call_id?: string
  name?: string
  tool_calls?: Array<{
    id: string
    type: "function"
    function: { name: string; arguments: string }
  }>
}

export type LlmResponse = {
  content: string | null
  toolCalls: Array<{
    id: string
    name: string
    arguments: string
  }>
  usage?: { promptTokens: number; completionTokens: number }
}

export interface LlmAdapter {
  readonly provider: string
  readonly model: string
  enviar(mensajes: ChatMessage[], herramientas: LlmToolDefinition[]): Promise<LlmResponse>
}
