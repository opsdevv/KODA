import { simpleGit, type SimpleGit } from "simple-git";
import type { GitStatus, GitFileChange } from "@cider/shared";
import { config } from "../config.js";

export class GitService {
  private git(rootPath: string): SimpleGit {
    return simpleGit(rootPath);
  }

  async status(rootPath: string): Promise<GitStatus> {
    const git = this.git(rootPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return { branch: "", ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [], isRepo: false };
    }

    const status = await git.status();
    const branch = status.current ?? "HEAD";

    const mapStatus = (files: typeof status.modified, type: GitFileChange["status"]): GitFileChange[] =>
      files.map((path) => ({ path, status: type }));

    return {
      branch,
      ahead: status.ahead,
      behind: status.behind,
      staged: [
        ...mapStatus(status.staged, "added"),
      ],
      unstaged: [
        ...mapStatus(status.modified, "modified"),
        ...mapStatus(status.deleted, "deleted"),
      ],
      untracked: status.not_added,
      isRepo: true,
    };
  }

  async init(rootPath: string): Promise<void> {
    await this.git(rootPath).init();
  }

  async commit(rootPath: string, message: string, paths?: string[]): Promise<void> {
    const git = this.git(rootPath);
    if (paths?.length) {
      await git.add(paths);
    } else {
      await git.add(".");
    }
    await git.commit(message);
  }

  async push(rootPath: string): Promise<void> {
    await this.git(rootPath).push();
  }

  async pull(rootPath: string): Promise<void> {
    await this.git(rootPath).pull();
  }

  async diff(rootPath: string, path?: string): Promise<string> {
    return this.git(rootPath).diff([path ?? ""]);
  }

  async generateCommitMessage(rootPath: string): Promise<string> {
    const diff = await this.diff(rootPath);
    if (!diff) return "chore: update files";
    const summary = diff.split("\n").slice(0, 40).join("\n");
    return `feat: update project\n\n${summary.slice(0, 500)}`;
  }

  async setRemote(rootPath: string, url: string): Promise<void> {
    const git = this.git(rootPath);
    const remotes = await git.getRemotes();
    if (remotes.find((r) => r.name === "origin")) {
      await git.remote(["set-url", "origin", url]);
    } else {
      await git.addRemote("origin", url);
    }
  }

  getGithubAuthHint(): string {
    return config.githubToken ? "configured" : "not_configured";
  }
}

export const gitService = new GitService();
