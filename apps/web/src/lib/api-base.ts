/** Direct backend URL (bypasses Next.js for uploads and health checks). */
export function getApiOrigin(): string {
  if (typeof window === "undefined") return "http://127.0.0.1:3847";
  const host = window.location.hostname;
  return `http://${host}:3847`;
}

export function getApiBase(): string {
  return `${getApiOrigin()}/api`;
}

/** Hostname for preview URLs when the IDE is opened via LAN or port-forwarding. */
export function getPreviewPublicHost(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") return undefined;
  return hostname;
}
