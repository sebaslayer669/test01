import OpenAI from "openai"
import type {
  ChatMessage,
  LlmAdapter,
  LlmResponse,
  LlmToolDefinition,
} from "./adapter.js"

export class OpenAiAdapter implements LlmAdapter {
  readonly provider = "openai"
  readonly model: string
  private readonly client: OpenAI

  constructor(apiKey: string, model: string) {
    this.model = model
    this.client = new OpenAI({ apiKey, timeout: 60_000 })
  }

  async enviar(
    mensajes: ChatMessage[],
    herramientas: LlmToolDefinition[],
  ): Promise<LlmResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: mensajes.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool" as const,
            tool_call_id: m.tool_call_id ?? "",
            content: m.content ?? "",
          }
        }
        if (m.role === "assistant" && m.tool_calls?.length) {
          return {
            role: "assistant" as const,
            content: m.content,
            tool_calls: m.tool_calls,
          }
        }
        return {
          role: m.role as "system" | "user" | "assistant",
          content: m.content ?? "",
        }
      }),
      tools: herramientas.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      tool_choice: "auto",
    })

    const choice = response.choices[0]
    if (!choice) {
      throw new Error("El proveedor LLM no devolvió choices")
    }

    const toolCalls =
      choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })) ?? []

    return {
      content: choice.message.content,
      toolCalls,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
          }
        : undefined,
    }
  }
}
