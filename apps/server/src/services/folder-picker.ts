import { spawnSync } from "node:child_process";
import { platform } from "node:os";

export interface PickFolderResult {
  path: string | null;
  error?: string;
}

/** Opens a native OS folder picker and returns the selected path, or null if cancelled. */
export function pickFolder(): PickFolderResult {
  const os = platform();

  if (os === "win32") {
    const script = [
      "$shell = New-Object -ComObject Shell.Application",
      "$folder = $shell.BrowseForFolder(0, 'Select project folder', 0)",
      "if ($null -ne $folder) { $folder.Self.Path }",
    ].join("; ");

    const result = spawnSync("powershell", ["-NoProfile", "-Command", script], {
      encoding: "utf-8",
      windowsHide: false,
    });

    if (result.error) {
      return { path: null, error: result.error.message };
    }

    const selected = result.stdout?.trim();
    if (!selected && result.stderr?.trim()) {
      return { path: null, error: result.stderr.trim() };
    }
    return { path: selected || null };
  }

  if (os === "darwin") {
    const result = spawnSync(
      "osascript",
      ["-e", 'POSIX path of (choose folder with prompt "Select project folder")'],
      { encoding: "utf-8" }
    );
    if (result.status !== 0) return { path: null };
    const selected = result.stdout?.trim();
    return { path: selected || null };
  }

  for (const [cmd, args] of [
    ["zenity", ["--file-selection", "--directory", "--title=Select project folder"]],
    ["kdialog", ["--getexistingdirectory", ".", "--title", "Select project folder"]],
  ] as const) {
    const result = spawnSync(cmd, args, { encoding: "utf-8" });
    if (result.status === 0) {
      const selected = result.stdout?.trim();
      if (selected) return { path: selected };
    }
  }

  return { path: null, error: "No folder picker available on this system" };
}
