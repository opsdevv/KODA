"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ServerStatus() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        await api.health();
        if (!cancelled) setOnline(true);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };

    check();
    const id = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (online === null) return null;

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-[10px]",
        online ? "text-cider-success" : "text-cider-danger"
      )}
      title={online ? "Backend connected" : "Start backend: npm run dev:server"}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", online ? "bg-cider-success" : "bg-cider-danger")} />
      {online ? "Server online" : "Server offline — run npm run dev"}
    </span>
  );
}
