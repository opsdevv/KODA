import WebSocket from "ws";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

// Types for Deriv API responses
export interface DerivAccountInfo {
  loginid: string;
  currency: string;
  balance: number;
  email: string;
  fullname?: string;
  scopes: string[];
  is_virtual?: boolean;
  landing_company_name?: string;
}

export interface DerivTick {
  symbol: string;
  quote: number;
  epoch: number;
  pip_size?: number;
}

export interface DerivPrice {
  ask: number;
  bid: number;
  symbol: string;
  epoch: number;
  pip_size?: number;
}

export interface DerivContractProposal {
  id: string;
  longcode: string;
  display_value: string;
  payout: number;
  spot: number;
  spot_time: number;
  start_time: number;
  date_expiry: number;
  cancellation?: { ask_price: number; date_expiry: number };
}

export interface DerivPortfolioItem {
  contract_id: number;
  is_valid: boolean;
  transaction_id: number;
  longcode: string;
  status: string;
  buy_price: number;
  sell_price?: number;
  profit?: number;
  entry_tick: number;
  entry_tick_time: number;
  exit_tick?: number;
  exit_tick_time?: number;
  currency: string;
  underlying: string;
  purchase_time: number;
  expiry_time: number;
}

export type DerivContractStatus =
  | "open"
  | "won"
  | "lost"
  | "purchased"
  | "sold"
  | "cancelled";

export interface DerivContractInfo {
  contract_id: number;
  status: DerivContractStatus;
  entry_tick: number;
  entry_tick_display_value?: string;
  exit_tick?: number;
  exit_tick_display_value?: string;
  buy_price: number;
  sell_price?: number;
  profit?: number;
  currency: string;
  underlying: string;
  longcode: string;
  purchase_time: number;
  expiry_time: number;
  tick_count?: number;
  tick_stream?: Array<{ tick: number; epoch: number }>;
}

export type DerivInstrument =
  | "R_10"
  | "R_25"
  | "R_50"
  | "R_75"
  | "R_100"
  | "volatility_10_index"
  | "volatility_25_index"
  | "volatility_50_index"
  | "volatility_75_index"
  | "volatility_100_index"
  | "EURUSD"
  | "GBPUSD"
  | "USDJPY"
  | "BTCUSD"
  | "ETHUSD";

export type DerivContractType =
  | "CALL"
  | "PUT"
  | "CALLSPREAD"
  | "PUTSPREAD"
  | "ASIANU"
  | "ASIAND"
  | "DIGITMATCH"
  | "DIGITDIFF"
  | "DIGITEVEN"
  | "DIGITODD"
  | "DIGITOVER"
  | "DIGITUNDER"
  | "EXPIRYRANGE"
  | "EXPIRYMISS"
  | "RANGE"
  | "UPORDOWN"
  | "STAY"
  | "TICKHIGH"
  | "TICKLOW"
  | "RESETCALL"
  | "RESETPUT"
  | "CALLBARRIER"
  | "PUTBARRIER"
  | "MULTUP"
  | "MULTDOWN";

export type DerivDurationUnit = "t" | "s" | "m" | "h" | "d";

export type DerivOrder = "CALL" | "PUT";

// Minimalist Deriv WebSocket client
export class DerivClient {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private subscriptions = new Map<string, (data: unknown) => void>();
  private token: string;
  private appId: string;
  private connected = false;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(token?: string, appId?: string) {
    this.token = token || config.deriv?.apiToken || process.env.DERIV_API_TOKEN || "";
    this.appId = appId || config.deriv?.appId || process.env.DERIV_APP_ID || "65398";
  }

  get isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const url = `wss://ws.binaryws.com/websockets/v3?app_id=${this.appId}`;
      logger.info({ url: url.replace(/app_id=\d+/, "app_id=***") }, "Connecting to Deriv API");

      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        reject(new Error("Deriv WebSocket connection timeout"));
        this.connectPromise = null;
      }, 10000);

      this.ws.on("open", () => {
        clearTimeout(timeout);
        this.connected = true;
        logger.info("Deriv WebSocket connected");
        resolve();
      });

      this.ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
          this.handleMessage(msg);
        } catch (e) {
          logger.error({ err: e, raw: raw.toString().slice(0, 200) }, "Failed to parse Deriv message");
        }
      });

      this.ws.on("close", (code, reason) => {
        clearTimeout(timeout);
        this.connected = false;
        this.connectPromise = null;
        logger.warn({ code, reason: reason.toString() }, "Deriv WebSocket closed");

        // Reject all pending requests
        for (const [, entry] of this.pending) {
          clearTimeout(entry.timer);
          entry.reject(new Error("Connection closed"));
        }
        this.pending.clear();

        // Auto-reconnect after 3 seconds
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.connect();
          }, 3000);
        }
      });

      this.ws.on("error", (err) => {
        clearTimeout(timeout);
        logger.error({ err: err.message }, "Deriv WebSocket error");
        reject(err);
        this.connectPromise = null;
      });
    });

    return this.connectPromise;
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connected = false;
    this.ws?.close();
    this.ws = null;
    this.connectPromise = null;
  }

  // --- Generic API Methods ---

  private nextId(): number {
    return ++this.msgId;
  }

  private async sendRequest<T>(request: Record<string, unknown>, timeoutMs = 15000): Promise<T> {
    if (!this.isConnected) {
      await this.connect();
    }

    const id = this.nextId();
    const msg = { ...request, req_id: id };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Deriv request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });

      try {
        this.ws!.send(JSON.stringify(msg));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const reqId = msg.req_id as number | undefined;

    // Check for subscription updates
    if (msg.msg_type === "tick" && msg.tick) {
      const tick = msg.tick as { symbol: string; quote: number; epoch: number };
      const subKey = `tick:${tick.symbol}`;
      const handler = this.subscriptions.get(subKey);
      if (handler) handler(tick);
      handler?.(tick);
      // Also route to generic callback
      return;
    }

    if (msg.msg_type === "proposal" && msg.proposal) {
      const subKey = "proposal";
      this.subscriptions.get(subKey)?.(msg);
    }

    if (msg.msg_type === "buy" && msg.buy) {
      const subKey = `buy:${(msg.buy as { contract_id: number }).contract_id}`;
      this.subscriptions.get(subKey)?.(msg);
    }

    // Handle pending request responses
    if (reqId) {
      const entry = this.pending.get(reqId);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(reqId);

        if (msg.error) {
          entry.reject(new Error(`Deriv API error: ${(msg.error as { message: string }).message || JSON.stringify(msg.error)}`));
        } else {
          entry.resolve(msg);
        }
      }
    }
  }

  // --- Authentication & Account ---

  async authorize(): Promise<DerivAccountInfo> {
    const resp = await this.sendRequest<{ authorize: DerivAccountInfo }>({
      authorize: this.token,
    });
    return resp.authorize;
  }

  async getAccountInfo(): Promise<DerivAccountInfo> {
    // authorize already returns account info
    return this.authorize();
  }

  async getBalance(): Promise<{ loginid: string; balance: number; currency: string; is_virtual: boolean }> {
    const info = await this.authorize();
    return {
      loginid: info.loginid,
      balance: info.balance,
      currency: info.currency,
      is_virtual: info.is_virtual ?? false,
    };
  }

  async getAccountList(): Promise<Array<{ loginid: string; currency: string; is_virtual: boolean; landing_company_name?: string }>> {
    // First authorize to get current account
    await this.authorize();
    // Then request account list
    const resp = await this.sendRequest<{ account_list: Array<{ loginid: string; currency: string; is_virtual: number; landing_company_name: string }> }>({
      account_list: 1,
    });
    return resp.account_list.map((a) => ({
      loginid: a.loginid,
      currency: a.currency,
      is_virtual: a.is_virtual === 1,
      landing_company_name: a.landing_company_name,
    }));
  }

  async switchAccount(loginid: string): Promise<void> {
    // For Deriv, you'd need to re-authorize with a different token
    throw new Error("Switch account requires a token for that account. Use a different token.");
  }

  // --- Market Data ---

  async getTicks(symbol: string, count = 100): Promise<DerivTick[]> {
    const resp = await this.sendRequest<{ ticks: Array<{ quote: number; epoch: number }>; pip_size?: number }>({
      ticks: symbol,
      adjust_start_time: 1,
      count,
    });
    return (resp.ticks || []).map((t) => ({
      symbol,
      quote: t.quote,
      epoch: t.epoch,
      pip_size: resp.pip_size,
    }));
  }

  async getTickHistory(symbol: string, start?: number, end?: number, count = 100): Promise<DerivTick[]> {
    const req: Record<string, unknown> = {
      ticks_history: symbol,
      adjust_start_time: 1,
      count,
      style: "ticks",
    };
    if (start) req.start = start;
    if (end) req.end = end;
    const resp = await this.sendRequest<{ history: { prices: number[]; times: number[] }; pip_size?: number }>(req);
    const prices = resp.history?.prices || [];
    const times = resp.history?.times || [];
    return prices.map((q, i) => ({
      symbol,
      quote: q,
      epoch: times[i] || 0,
      pip_size: resp.pip_size,
    }));
  }

  async getCandles(symbol: string, granularity: number, count = 100): Promise<Array<{ epoch: number; open: number; high: number; low: number; close: number }>> {
    const resp = await this.sendRequest<{ candles: Array<{ epoch: number; open: string; high: string; low: string; close: string }> }>({
      ticks_history: symbol,
      adjust_start_time: 1,
      count,
      granularity,
      style: "candles",
    });
    return (resp.candles || []).map((c) => ({
      epoch: c.epoch,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    }));
  }

  async subscribeTicks(symbol: string, callback: (tick: DerivTick) => void): Promise<() => void> {
    if (!this.isConnected) await this.connect();
    const subKey = `tick:${symbol}`;

    this.subscriptions.set(subKey, (data: unknown) => {
      const tick = data as { symbol: string; quote: number; epoch: number };
      callback({
        symbol: tick.symbol,
        quote: tick.quote,
        epoch: tick.epoch,
      });
    });

    await this.sendRequest({
      ticks: symbol,
      subscribe: 1,
    });

    return () => {
      this.subscriptions.delete(subKey);
      // Send forget to unsubscribe
      this.ws?.send(JSON.stringify({ forget: subKey }));
    };
  }

  // --- Pricing & Proposals ---

  async getPriceProposal(params: {
    symbol: string;
    contract_type: DerivContractType;
    currency: string;
    amount: number;
    duration: number;
    duration_unit: DerivDurationUnit;
    basis?: "stake" | "payout";
    date_start?: number;
    barrier?: string;
    barrier2?: string;
  }): Promise<DerivContractProposal> {
    const resp = await this.sendRequest<{ proposal: DerivContractProposal; echo_req: Record<string, unknown> }>({
      proposal: 1,
      amount: params.amount,
      basis: params.basis || "stake",
      contract_type: params.contract_type,
      currency: params.currency,
      duration: params.duration,
      duration_unit: params.duration_unit,
      symbol: params.symbol,
      ...(params.date_start ? { date_start: params.date_start } : {}),
      ...(params.barrier ? { barrier: params.barrier } : {}),
      ...(params.barrier2 ? { barrier2: params.barrier2 } : {}),
    });
    return resp.proposal;
  }

  // --- Trading ---

  async buyContract(proposalId: string, price: number): Promise<{
    contract_id: number;
    longcode: string;
    start_time: number;
    currency: string;
    balance_after: number;
    transaction_id: number;
  }> {
    const resp = await this.sendRequest<{
      buy: {
        contract_id: number;
        longcode: string;
        start_time: number;
        currency: string;
        balance_after: number;
        transaction_id: number;
      };
    }>({
      buy: proposalId,
      price,
    });
    return resp.buy;
  }

  async sellContract(contractId: number, price?: number): Promise<{
    balance_after: number;
    reference_id: number;
    sold_for: number;
  }> {
    const resp = await this.sendRequest<{
      sell: {
        balance_after: number;
        reference_id: number;
        sold_for: number;
      };
    }>({
      sell: contractId,
      ...(price !== undefined ? { price } : {}),
    });
    return resp.sell;
  }

  // --- Portfolio ---

  async getPortfolio(): Promise<DerivPortfolioItem[]> {
    const resp = await this.sendRequest<{ portfolio: { contracts: DerivPortfolioItem[] } }>({
      portfolio: 1,
    });
    return resp.portfolio?.contracts || [];
  }

  async getOpenContracts(): Promise<DerivPortfolioItem[]> {
    const contracts = await this.getPortfolio();
    return contracts.filter((c) => c.status === "open" || c.is_valid);
  }

  async getContractInfo(contractId: number): Promise<DerivContractInfo> {
    const resp = await this.sendRequest<{ contract: DerivContractInfo }>({
      contract_info: contractId,
    });
    return resp.contract;
  }

  async getStatement(limit = 50, offset = 0): Promise<{
    transactions: Array<{
      transaction_id: number;
      action_type: string;
      amount: number;
      balance_after: number;
      currency: string;
      purchase_time: number;
      longcode: string;
      contract_id?: number;
    }>;
    count: number;
  }> {
    const resp = await this.sendRequest<{
      statement: {
        transactions: Array<{
          transaction_id: number;
          action_type: string;
          amount: number;
          balance_after: number;
          currency: string;
          purchase_time: number;
          longcode: string;
          contract_id?: number;
        }>;
        count: number;
      };
    }>({
      statement: 1,
      limit,
      offset,
    });
    return resp.statement;
  }

  // --- Active Symbols ---

  async getActiveSymbols(): Promise<
    Array<{
      symbol: string;
      display_name: string;
      display_order: number;
      market: string;
      market_display_name: string;
      pip_size: number;
      subgroup: string;
      subgroup_display_name: string;
      submarket: string;
      submarket_display_name: string;
    }>
  > {
    const resp = await this.sendRequest<{
      active_symbols: Array<{
        symbol: string;
        display_name: string;
        display_order: number;
        market: string;
        market_display_name: string;
        pip_size: number;
        subgroup: string;
        subgroup_display_name: string;
        submarket: string;
        submarket_display_name: string;
      }>;
    }>({
      active_symbols: "brief",
    });
    return resp.active_symbols || [];
  }

  // --- Trading Times ---

  async getTradingTimes(currency?: string): Promise<{
    trading_times: Record<string, unknown>;
  }> {
    const resp = await this.sendRequest({
      trading_times: new Date().toISOString().split("T")[0],
      ...(currency ? { currency } : {}),
    });
    return resp as { trading_times: Record<string, unknown> };
  }

  // --- Landing Company ---

  async getLandingCompany(landingCompany: string): Promise<Record<string, unknown>> {
    const resp = await this.sendRequest({
      landing_company: landingCompany,
    });
    return resp as Record<string, unknown>;
  }

  // --- Ping ---

  async ping(): Promise<number> {
    const start = Date.now();
    const resp = await this.sendRequest<{ ping: string }>({ ping: 1 }, 5000);
    return Date.now() - start;
  }
}

// Singleton instance
let _client: DerivClient | null = null;

export function getDerivClient(): DerivClient {
  if (!_client) {
    _client = new DerivClient();
  }
  return _client;
}

export function setDerivClient(client: DerivClient): void {
  _client = client;
}

export function createDerivClient(token: string, appId?: string): DerivClient {
  const client = new DerivClient(token, appId);
  setDerivClient(client);
  return client;
}
