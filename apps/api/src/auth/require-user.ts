import type { FastifyReply, FastifyRequest } from "fastify";
import { getSession } from "./session";

export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<{ userId: string; email: string } | null> {
  const session = await getSession(request);
  if (!session) {
    reply.code(401).send({ error: "Unauthorized" });
    return null;
  }
  return session;
}
