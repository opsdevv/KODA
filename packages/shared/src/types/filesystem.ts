export interface ProjectInfo {
  id: string;
  name: string;
  rootPath: string;
  openedAt: number;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  size?: number;
  modifiedAt?: number;
}

export interface FileReadResult {
  path: string;
  content: string;
  language?: string;
}

export interface FileWriteRequest {
  path: string;
  content: string;
}

export interface FileSearchResult {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export interface IndexEntry {
  path: string;
  hash: string;
  language: string;
  symbols: string[];
  embeddingId?: string;
}
