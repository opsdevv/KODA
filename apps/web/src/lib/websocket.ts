import type { WsClientMessage, WsServerMessage } from "@cider/shared";
import { getApiOrigin } from "./api-base";

export type WsHandler = (msg: WsServerMessage) => void;

export class CiderWebSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<WsHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private disposed = false;

  private get wsUrl(): string {
    const origin = getApiOrigin() || "http://127.0.0.1:3847";
    return origin.replace(/^http/, "ws") + "/ws";
  }

  async connect() {
    if (this.disposed || this.ws?.readyState === WebSocket.OPEN) return;

    const healthy = await this.checkHealth();
    if (!healthy) {
      this.scheduleReconnect();
      return;
    }

    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as WsServerMessage;
        this.handlers.forEach((h) => h(msg));
      } catch {
        /* ignore */
      }
    };

    this.ws.onerror = () => {
      /* onclose handles reconnect */
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.scheduleReconnect();
    };
  }

  private async checkHealth(): Promise<boolean> {
    try {
      const origin = getApiOrigin() || "http://127.0.0.1:3847";
      const res = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  private scheduleReconnect() {
    if (this.disposed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    if (this.reconnectAttempts >= 15) return;

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delay);
  }

  subscribe(handler: WsHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(msg: WsClientMessage & { projectId?: string }) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect() {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const ciderWs = typeof window !== "undefined" ? new CiderWebSocket() : null;
