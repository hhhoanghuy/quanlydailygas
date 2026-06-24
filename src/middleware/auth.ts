import type { FastifyInstance, FastifyRequest } from "fastify";
import { getUserFromToken } from "../services/auth.service.js";
import { unauthorizedError } from "../../utils/errors.js";

export type AuthUser = Awaited<ReturnType<typeof getUserFromToken>>;

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export async function authMiddleware(
  req: FastifyRequest,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw unauthorizedError("Chưa đăng nhập");
  }
  const token = header.slice(7);
  req.user = await getUserFromToken(req.server.db, token);
}

export function optionalAuth(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice(7);
}
