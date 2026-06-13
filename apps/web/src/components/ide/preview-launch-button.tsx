"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { getPreviewPublicHost } from "@/lib/api-base";
import { useIdeStore } from "@/stores/ide-store";
import { Button } from "@/components/ui/button";

export function PreviewLaunchButton() {
  const { projectId, projectName } = useIdeStore();
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  if (!projectId) return null;

  const launch = async () => {
    setLoading(true);
    try {
      const result = await api.startProjectPreview(projectId, {
        openBrowser: true,
        publicHost: getPreviewPublicHost(),
      });
      setPreviewUrl(result.url ?? result.localUrl ?? null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (previewUrl) {
    return (
      <a
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-cider-accent hover:underline"
        title={previewUrl}
      >
        Preview
      </a>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => void launch()}
      disabled={loading}
      title={projectName ? `Launch ${projectName} in browser` : "Launch site in browser"}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <ExternalLink className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">Launch</span>
    </Button>
  );
}
