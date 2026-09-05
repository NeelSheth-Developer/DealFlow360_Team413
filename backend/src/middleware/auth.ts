import { eq } from 'drizzle-orm';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { db } from '../db/index.js';
import { customers, users, type Role, type SubjectKind } from '../db/schema.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { ApiError } from '../utils/api-error.js';

export type AuthContext = {
  id: string;
  kind: SubjectKind;
  role?: Role;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function bearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

/**
 * Verifies the access token and confirms the account is still active.
 *
 * The `active` lookup costs one query per request but closes the gap an access token
 * otherwise leaves: the JWT is valid for up to 15 minutes after a user is disabled,
 * and without this check a deactivated account keeps working for that window.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  void (async () => {
    try {
      const token = bearerToken(req);
      if (!token) {
        next(ApiError.unauthorized('INVALID_CREDENTIALS', 'Missing bearer token'));
        return;
      }

      const claims = verifyAccessToken(token);
      if (!claims) {
        next(ApiError.unauthorized('INVALID_CREDENTIALS', 'Invalid or expired token'));
        return;
      }

      const active = await isActive(claims.sub, claims.kind);
      if (!active) {
        next(ApiError.forbidden('ACCOUNT_DISABLED', 'This account is no longer active'));
        return;
      }

      req.auth = {
        id: claims.sub,
        kind: claims.kind,
        ...(claims.role ? { role: claims.role } : {}),
      };
      next();
    } catch (error) {
      next(error);
    }
  })();
};

async function isActive(id: string, kind: SubjectKind): Promise<boolean> {
  if (kind === 'staff') {
    const [row] = await db
      .select({ active: users.active })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row?.active === true;
  }

  const [row] = await db
    .select({ active: customers.active })
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  return row?.active === true;
}

/**
 * The wall between the two applications. A customer token on an internal route and a
 * staff token on a portal route both stop here — checked server-side on every
 * request, not by hiding buttons in the UI.
 */
export function requireKind(kind: SubjectKind): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(ApiError.unauthorized());
      return;
    }
    if (req.auth.kind !== kind) {
      next(ApiError.forbidden('WRONG_KIND', 'This endpoint is not available to your account type'));
      return;
    }
    next();
  };
}

/** Staff-only, and only the listed roles. Customers never reach this. */
export function requireRole(...allowed: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(ApiError.unauthorized());
      return;
    }
    if (req.auth.kind !== 'staff' || !req.auth.role || !allowed.includes(req.auth.role)) {
      next(ApiError.forbidden('FORBIDDEN', 'Your role does not permit this action'));
      return;
    }
    next();
  };
}
