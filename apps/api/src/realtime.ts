import type { FastifyInstance } from "fastify";

interface RealtimeClient {
  send(message: string): void;
}

interface RealtimeServer {
  clients: Set<RealtimeClient>;
}

export function broadcast(app: FastifyInstance, payload: Record<string, unknown>): void {
  const server = (app as FastifyInstance & { websocketServer?: RealtimeServer }).websocketServer;
  if (!server) return;

  const message = JSON.stringify(payload);
  server.clients.forEach((client) => client.send(message));
}
