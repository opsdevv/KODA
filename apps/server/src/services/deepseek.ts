import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

export interface StreamCallbacks {
  onDelta: (delta: string) => void;
  onToolCall?: (toolCall: { id: string; name: string; arguments: string }) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

export class DeepSeekService {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = config.deepseek.apiKey;
      if (!apiKey) {
        throw new Error("DEEPSEEK_API_KEY is not configured. Add it to your .env file.");
      }
      this.client = new OpenAI({
        apiKey,
        baseURL: config.deepseek.baseUrl,
      });
    }
    return this.client;
  }

  async streamChat(
    messages: ChatCompletionMessageParam[],
    options: {
      tools?: ChatCompletionTool[];
      systemPrompt?: string;
      onDelta: (delta: string) => void;
      signal?: AbortSignal;
    }
  ): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }> {
    const client = this.getClient();
    const fullMessages: ChatCompletionMessageParam[] = options.systemPrompt
      ? [{ role: "system", content: options.systemPrompt }, ...messages]
      : messages;

    let fullContent = "";
    const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();

    const stream = await client.chat.completions.create(
      {
        model: config.deepseek.model,
        messages: fullMessages,
        tools: options.tools,
        stream: true,
      },
      { signal: options.signal }
    );

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;
      if (delta.content) {
        fullContent += delta.content;
        options.onDelta(delta.content);
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCallsMap.has(idx)) {
            toolCallsMap.set(idx, {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              arguments: tc.function?.arguments ?? "",
            });
          } else {
            const existing = toolCallsMap.get(idx)!;
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          }
        }
      }
    }

    const toolCalls = [...toolCallsMap.values()].map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.arguments || "{}") as Record<string, unknown>;
      } catch {
        logger.warn({ arguments: tc.arguments }, "Failed to parse tool arguments");
      }
      return { id: tc.id, name: tc.name, arguments: args };
    });

    return { content: fullContent, toolCalls };
  }

  async complete(messages: ChatCompletionMessageParam[], systemPrompt?: string): Promise<string> {
    const result = await this.streamChat(messages, {
      systemPrompt,
      onDelta: () => {},
    });
    return result.content;
  }

  isConfigured(): boolean {
    return Boolean(config.deepseek.apiKey);
  }
}

export const deepseek = new DeepSeekService();
