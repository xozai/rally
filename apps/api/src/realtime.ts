import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

interface EventSocket {
  readyState: number;
  send(message: string, callback?: (error?: Error) => void): void;
  on(event: "close" | "error", listener: (error?: Error) => void): this;
}

const openState = 1;
const watchers = new Map<string, Set<EventSocket>>();

export function setupRealtime(app: FastifyInstance): void {
  void app.register(websocket);

  app.get("/api/events/:id/ws", { websocket: true }, (connection, request) => {
    const parsedParams = z.object({ id: z.string().min(1) }).safeParse(request.params);
    const parsedQuery = z.object({
      token: z.string().optional(),
      sessionToken: z.string().optional()
    }).safeParse(request.query);

    if (!parsedParams.success || !parsedQuery.success) {
      connection.socket.close();
      return;
    }

    const eventId = parsedParams.data.id;
    const socket = connection.socket as EventSocket;
    const eventWatchers = watchers.get(eventId) ?? new Set<EventSocket>();
    eventWatchers.add(socket);
    watchers.set(eventId, eventWatchers);

    safeSend(socket, { type: "connected", eventId });

    socket.on("close", () => removeWatcher(eventId, socket));
    socket.on("error", () => removeWatcher(eventId, socket));
  });
}

export function notifyEventUpdated(eventId: string, payload: Record<string, unknown> = {}): void {
  sendToEvent(eventId, { type: "event_updated", eventId, ...payload });
}

export function notifyParticipantResponded(eventId: string, respondedCount: number, totalCount: number): void {
  sendToEvent(eventId, { type: "participant_responded", eventId, respondedCount, totalCount });
}

export function broadcast(_app: FastifyInstance, payload: Record<string, unknown>): void {
  const eventId = typeof payload.eventId === "string" ? payload.eventId : null;
  if (!eventId) return;
  notifyEventUpdated(eventId, payload);
}

function sendToEvent(eventId: string, payload: Record<string, unknown>): void {
  const eventWatchers = watchers.get(eventId);
  if (!eventWatchers) return;

  for (const socket of eventWatchers) {
    if (socket.readyState !== openState) {
      eventWatchers.delete(socket);
      continue;
    }
    safeSend(socket, payload);
  }

  if (eventWatchers.size === 0) watchers.delete(eventId);
}

function safeSend(socket: EventSocket, payload: Record<string, unknown>): void {
  try {
    socket.send(JSON.stringify(payload), () => undefined);
  } catch {
    // Ignore closed sockets; cleanup happens on close/error or the next broadcast.
  }
}

function removeWatcher(eventId: string, socket: EventSocket): void {
  const eventWatchers = watchers.get(eventId);
  if (!eventWatchers) return;
  eventWatchers.delete(socket);
  if (eventWatchers.size === 0) watchers.delete(eventId);
}
