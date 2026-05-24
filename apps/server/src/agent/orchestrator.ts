import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { v4 as uuid } from "uuid";
import type { AiMode, AgentLoopEvent, PlanStep } from "@cider/shared";
import { deepseek } from "../services/deepseek.js";
import { contextIndex } from "../services/context-index.js";
import { memory } from "../services/memory.js";
import { toOpenAiTools, toolRequiresApproval } from "./tools.js";
import { toolExecutor, type ToolContext } from "./tool-executor.js";
import { logger } from "../lib/logger.js";

const MAX_AGENT_ITERATIONS = 25;

const MODE_PROMPTS: Record<AiMode, string> = {
  ask: `You are Cider AI in Ask Mode. Answer coding questions clearly. You may suggest code but do not claim to have modified files unless tools were used. Be concise and accurate.`,
  plan: `You are Cider AI in Plan Mode. Analyze the codebase and produce a structured implementation plan as JSON in a fenced code block:
\`\`\`json
{"steps":[{"title":"...","description":"..."}]}
\`\`\`
Do NOT execute changes. Wait for user approval before implementation.`,
  agent: `You are Cider AI in Agent Mode. You autonomously complete coding tasks using tools.
Follow ReAct: think briefly, act with tools, observe results, self-correct.
Prefer small incremental edits. Run tests when relevant. Summarize when done.`,
};

export interface AgentRunOptions {
  projectId: string;
  rootPath: string;
  mode: AiMode;
  goal: string;
  conversationHistory: ChatCompletionMessageParam[];
  emit: (event: AgentLoopEvent) => void;
  signal?: AbortSignal;
  onToolApproval?: (toolCallId: string, name: string, args: Record<string, unknown>) => Promise<boolean>;
}

export class AgentOrchestrator {
  async run(options: AgentRunOptions): Promise<string> {
    const taskId = uuid();
    const { emit, mode, goal, rootPath, projectId, signal } = options;

    emit({ type: "status", taskId, payload: { status: "running", mode } });
    emit({ type: "checkpoint", taskId, payload: { label: "Task started", goal } });

    const memoryCtx = await memory.buildContextPrompt(projectId);
    const relevant = await contextIndex.search(projectId, goal, 6);
    const contextBlock = relevant.length
      ? `\n## Relevant Files\n${relevant.map((r) => `- ${r.path}: ${r.preview.slice(0, 120)}`).join("\n")}`
      : "";

    const systemPrompt = `${MODE_PROMPTS[mode]}${memoryCtx}${contextBlock}\nProject root: ${rootPath}`;

    const messages: ChatCompletionMessageParam[] = [
      ...options.conversationHistory,
      { role: "user", content: goal },
    ];

    const tools = mode === "ask" ? undefined : toOpenAiTools();
    const toolCtx: ToolContext = {
      projectId,
      rootPath,
      onApprovalRequired: options.onToolApproval,
      onFileChanges: (changes) => {
        emit({ type: "file_changes", taskId, payload: { changes } });
      },
    };

    let finalResponse = "";
    let iterations = 0;

    while (iterations < MAX_AGENT_ITERATIONS) {
      if (signal?.aborted) break;
      iterations++;

      emit({ type: "thinking", taskId, payload: { iteration: iterations } });

      let iterationContent = "";
      const { content, toolCalls } = await deepseek.streamChat(messages, {
        systemPrompt,
        tools,
        signal,
        onDelta: (delta) => {
          iterationContent += delta;
          emit({ type: "message_delta", taskId, payload: { delta } });
        },
      });

      finalResponse += content;

      if (!toolCalls.length || mode === "plan") {
        if (mode === "plan") {
          const plan = parsePlan(content);
          if (plan.length) {
            emit({ type: "plan", taskId, payload: { steps: plan } });
            emit({ type: "status", taskId, payload: { status: "awaiting_approval" } });
          }
        }
        emit({ type: "message_done", taskId, payload: { content: finalResponse } });
        emit({ type: "status", taskId, payload: { status: "completed" } });
        return finalResponse;
      }

      messages.push({
        role: "assistant",
        content: content || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });

      for (const tc of toolCalls) {
        emit({ type: "tool_call", taskId, payload: { id: tc.id, name: tc.name, arguments: tc.arguments } });

        let result: string;
        try {
          if (toolRequiresApproval(tc.name) && options.onToolApproval) {
            const approved = await options.onToolApproval(tc.id, tc.name, tc.arguments);
            if (!approved) {
              result = "User rejected this action";
            } else {
              result = await toolExecutor.execute(tc.name, tc.arguments, toolCtx, tc.id);
            }
          } else {
            result = await toolExecutor.execute(tc.name, tc.arguments, toolCtx, tc.id);
          }
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
          logger.error({ err, tool: tc.name }, "Tool execution failed");
        }

        emit({ type: "tool_result", taskId, payload: { id: tc.id, result: result.slice(0, 2000) } });

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }

      emit({ type: "checkpoint", taskId, payload: { label: `Iteration ${iterations} complete` } });
    }

    emit({ type: "status", taskId, payload: { status: "completed" } });
    emit({ type: "message_done", taskId, payload: { content: finalResponse } });
    return finalResponse;
  }
}

function parsePlan(content: string): PlanStep[] {
  const match = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as { steps?: Array<{ title: string; description: string }> };
    return (parsed.steps ?? []).map((s, i) => ({
      id: uuid(),
      title: s.title,
      description: s.description,
      status: "pending" as const,
      order: i,
    }));
  } catch {
    return [];
  }
}

export const agentOrchestrator = new AgentOrchestrator();
