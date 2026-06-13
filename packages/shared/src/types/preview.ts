export interface ProjectPreviewStatus {
  running: boolean;
  url?: string;
  localUrl?: string;
  port?: number;
  command?: string;
  cwd?: string;
  startedAt?: number;
  error?: string;
}

export interface ProjectPreviewStartResult extends ProjectPreviewStatus {
  openedBrowser: boolean;
}
