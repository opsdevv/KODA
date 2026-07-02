import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { AgentToolDefinition } from "@koda/shared";

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file in the project",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Relative file path" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Create or overwrite a file",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Replace a unique string in a file with new content",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_string: { type: "string" },
        new_string: { type: "string" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "search_codebase",
    description: "Search for text across project files",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "list_directory",
    description: "List files in a directory",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Relative directory path, default root" } },
    },
  },
  {
    name: "run_command",
    description: "Execute a shell command in the project directory",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
    requiresApproval: true,
  },
  {
    name: "delete_file",
    description: "Delete a file or directory",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    requiresApproval: true,
  },
  {
    name: "git_status",
    description: "Get git repository status",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "git_commit",
    description: "Stage and commit changes",
    parameters: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
    requiresApproval: true,
  },
  {
    name: "remember",
    description: "Store an architecture decision or fact in project memory",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string" },
        content: { type: "string" },
      },
      required: ["category", "content"],
    },
  },
];

export function toOpenAiTools(): ChatCompletionTool[] {
  return AGENT_TOOL_DEFINITIONS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function toolRequiresApproval(name: string): boolean {
  return AGENT_TOOL_DEFINITIONS.find((t) => t.name === name)?.requiresApproval ?? false;
}
