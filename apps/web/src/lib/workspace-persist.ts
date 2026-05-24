const STORAGE_KEY = "cider.workspace";

export interface PersistedWorkspace {
  projectId: string;
  projectPath: string;
  projectName: string;
}

export function loadWorkspace(): PersistedWorkspace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedWorkspace;
  } catch {
    return null;
  }
}

export function saveWorkspace(workspace: PersistedWorkspace): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

export function clearWorkspace(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
