export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  isRepo: boolean;
}

export interface GitFileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
}

export interface GitCommitRequest {
  message: string;
  paths?: string[];
}

export interface GitDiffResult {
  path: string;
  diff: string;
}
