import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Shared API helpers ────────────────────────────────────────────────────

export async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? "Request failed";
}

// ─── WebSocket helpers ─────────────────────────────────────────────────────

export type RealtimeMessage = {
  type: "connected" | "event_updated" | "participant_responded";
  eventId: string;
};

export function websocketBaseUrl(): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "") || window.location.origin;
  return base.replace(/^http/, "ws");
}

export function parseRealtimeMessage(data: unknown): RealtimeMessage | null {
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as Partial<RealtimeMessage>;
    if (typeof parsed.type !== "string" || typeof parsed.eventId !== "string") return null;
    if (!["connected", "event_updated", "participant_responded"].includes(parsed.type)) return null;
    return parsed as RealtimeMessage;
  } catch {
    return null;
  }
}
