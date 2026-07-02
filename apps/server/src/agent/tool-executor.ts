import { filesystem } from "../services/filesystem.js";
import { contextIndex } from "../services/context-index.js";
import { memory } from "../services/memory.js";
import { gitService } from "../services/git.js";
import { terminalService } from "../services/terminal.js";
import { logger } from "../lib/logger.js";
import type { FileChange } from "@koda/shared";

export interface ToolContext {
  projectId: string;
  rootPath: string;
  onApprovalRequired?: (toolCallId: string, name: string, args: Record<string, unknown>) => Promise<boolean>;
  onFileChanges?: (changes: FileChange[]) => void;
}

export class ToolExecutor {
  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
    toolCallId?: string
  ): Promise<string> {
    logger.info({ name, args }, "Executing tool");

    switch (name) {
      case "read_file": {
        const file = await filesystem.readFile(ctx.rootPath, String(args.path));
        return file.content;
      }
      case "write_file": {
        await filesystem.writeFile(ctx.rootPath, String(args.path), String(args.content));
        ctx.onFileChanges?.([{ path: String(args.path), action: "write" }]);
        return `Wrote ${args.path}`;
      }
      case "edit_file": {
        const file = await filesystem.readFile(ctx.rootPath, String(args.path));
        const oldStr = String(args.old_string);
        if (!file.content.includes(oldStr)) {
          return `Error: old_string not found in ${args.path}`;
        }
        const updated = file.content.replace(oldStr, String(args.new_string));
        await filesystem.writeFile(ctx.rootPath, String(args.path), updated);
        ctx.onFileChanges?.([{ path: String(args.path), action: "edit" }]);
        return `Edited ${args.path}`;
      }
      case "search_codebase": {
        const semantic = await contextIndex.search(ctx.projectId, String(args.query));
        const text = await filesystem.searchFiles(ctx.rootPath, String(args.query));
        const combined = [
          ...semantic.map((s) => `[semantic] ${s.path}: ${s.preview.slice(0, 100)}`),
          ...text.map((t) => `[text] ${t.path}:${t.line} ${t.preview}`),
        ];
        return combined.slice(0, 20).join("\n") || "No results";
      }
      case "list_directory": {
        const tree = await filesystem.listTree(ctx.rootPath, String(args.path ?? "."));
        return JSON.stringify(tree, null, 2);
      }
      case "run_command": {
        if (ctx.onApprovalRequired && toolCallId) {
          const approved = await ctx.onApprovalRequired(toolCallId, name, args);
          if (!approved) return "Command execution rejected by user";
        }
        const result = await terminalService.runCommand(ctx.rootPath, String(args.command));
        return `exit=${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
      }
      case "delete_file": {
        if (ctx.onApprovalRequired && toolCallId) {
          const approved = await ctx.onApprovalRequired(toolCallId, name, args);
          if (!approved) return "Delete rejected by user";
        }
        await filesystem.deletePath(ctx.rootPath, String(args.path));
        ctx.onFileChanges?.([{ path: String(args.path), action: "delete" }]);
        return `Deleted ${args.path}`;
      }
      case "git_status": {
        const status = await gitService.status(ctx.rootPath);
        return JSON.stringify(status, null, 2);
      }
      case "git_commit": {
        if (ctx.onApprovalRequired && toolCallId) {
          const approved = await ctx.onApprovalRequired(toolCallId, name, args);
          if (!approved) return "Commit rejected by user";
        }
        await gitService.commit(ctx.rootPath, String(args.message));
        return `Committed: ${args.message}`;
      }
      case "remember": {
        await memory.add(ctx.projectId, String(args.category), String(args.content));
        return "Stored in project memory";
      }
      default:
        return `Unknown tool: ${name}`;
    }
  }
}

export const toolExecutor = new ToolExecutor();
