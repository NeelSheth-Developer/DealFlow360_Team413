import { and, count, desc, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { quotations, teams, users, type Role } from '../../db/schema.js';
import { ApiError } from '../../utils/api-error.js';
import { ASSIGNABLE_ROLES } from './users.schemas.js';
import type { ListUsersQuery, UpdateUserInput } from './users.schemas.js';

/**
 * What each assignable role may do. Returned by `GET /roles` so an admin's role
 * picker is driven by the server rather than a hardcoded list in the frontend that
 * can drift out of step with what `PATCH /users/:id` actually accepts.
 *
 * `admin` is not here. It is granted only by `npm run seed:admin`.
 */
const ROLE_CATALOGUE = {
  sales_rep: {
    label: 'Sales Rep',
    description: 'Creates quotations, applies discounts, responds to customer requests',
  },
  sales_manager: {
    label: 'Sales Manager',
    description: 'Approves discounts above threshold, configures tiers, monitors deal health',
  },
  finance: {
    label: 'Finance / Operations',
    description: 'Second-level approval, warehouse splits, billing and credit notes',
  },
} as const;

/** Assignable roles, with the count of users currently holding each. */
export async function listAssignableRoles() {
  const counts = await db
    .select({ role: users.role, total: count() })
    .from(users)
    .where(eq(users.active, true))
    .groupBy(users.role);

  const byRole = new Map(counts.map((row) => [row.role, row.total]));

  return ASSIGNABLE_ROLES.map((key) => ({
    key,
    label: ROLE_CATALOGUE[key].label,
    description: ROLE_CATALOGUE[key].description,
    assignable: true,
    activeUsers: byRole.get(key) ?? 0,
  }));
}

/** Never selects `password_hash`. */
const publicColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  teamId: users.teamId,
  active: users.active,
  emailVerifiedAt: users.emailVerifiedAt,
  createdAt: users.createdAt,
};

/**
 * The directory shape, with the team name resolved and the owned-quotation count
 * counted in the same round trip rather than N+1 per user.
 */
const directoryColumns = {
  ...publicColumns,
  teamName: teams.name,
  ownedQuotationCount: sql<number>`(SELECT COUNT(*)::int FROM ${quotations} WHERE ${quotations.ownerId} = ${users.id})`,
};

export async function listUsers(query: ListUsersQuery) {
  const filters: SQL[] = [];
  if (query.role) filters.push(eq(users.role, query.role));
  if (query.active !== undefined) filters.push(eq(users.active, query.active));
  if (query.teamId) filters.push(eq(users.teamId, query.teamId));
  if (query.q) {
    const term = `%${query.q}%`;
    const search = or(ilike(users.name, term), ilike(users.email, term));
    if (search) filters.push(search);
  }

  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  const [rows, [totals]] = await Promise.all([
    db
      .select(directoryColumns)
      .from(users)
      .leftJoin(teams, eq(teams.id, users.teamId))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ total: count() }).from(users).where(where),
  ]);

  const total = totals?.total ?? 0;
  return {
    data: rows.map(present),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getUser(id: string) {
  const [row] = await db
    .select(directoryColumns)
    .from(users)
    .leftJoin(teams, eq(teams.id, users.teamId))
    .where(eq(users.id, id))
    .limit(1);

  if (!row) throw ApiError.notFound('User not found');
  return present(row);
}

/**
 * The only way anyone becomes a manager, finance user, or admin — signup always
 * produces a `sales_rep`, and `role` is rejected from the signup body.
 *
 * Two self-targeting guards. An admin may edit their own name, but not
 * their own `role` or `active`:
 *
 *   - self-demotion is how you end up with zero admins and nobody able to fix it
 *   - self-deactivation locks you out of the account that could undo it
 *
 * Neither is a privilege escalation (only admins reach this code at all); both are
 * one-way doors that need a second admin, or a database edit, to reverse.
 */
export async function updateUser(
  actorId: string,
  actorRole: Role,
  targetId: string,
  patch: UpdateUserInput,
) {
  const [existing] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!existing) throw ApiError.notFound('User not found');

  /**
   * A manager may place people in teams and correct a name. Granting a role or
   * disabling an account stays with the admin: those two are the ones that change what
   * somebody can do, and team placement is not.
   */
  if (actorRole !== 'admin') {
    if (patch.role !== undefined) {
      throw ApiError.forbidden('FORBIDDEN', 'Only an admin can change a role');
    }
    if (patch.active !== undefined) {
      throw ApiError.forbidden('FORBIDDEN', 'Only an admin can activate or deactivate an account');
    }
  }

  const isSelf = actorId === targetId;
  if (isSelf && patch.role !== undefined && patch.role !== existing.role) {
    throw ApiError.forbidden('FORBIDDEN', 'You cannot change your own role');
  }
  if (isSelf && patch.active === false) {
    throw ApiError.forbidden('FORBIDDEN', 'You cannot deactivate your own account');
  }

  // Demoting or deactivating the last active admin would leave the system with no
  // one able to promote anyone — recoverable only by running the seed script again.
  // `patch.role` cannot be 'admin' — the schema enum excludes it — so any role change
  // on an admin is a demotion.
  const losesAdmin =
    existing.role === 'admin' && (patch.role !== undefined || patch.active === false);

  if (losesAdmin) {
    const [remaining] = await db
      .select({ total: count() })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.active, true), ne(users.id, targetId)));

    if ((remaining?.total ?? 0) === 0) {
      throw ApiError.conflict(
        'LAST_ADMIN',
        'This is the only active admin. Promote another admin first — or use npm run seed:admin.',
      );
    }
  }

  // A non-existent team id would otherwise fail as a raw foreign-key violation, which
  // reaches the client as a 500 rather than a message naming the field.
  if (patch.teamId !== undefined && patch.teamId !== null) {
    const [team] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, patch.teamId))
      .limit(1);
    if (!team) throw ApiError.notFound('That team does not exist');
  }

  const [updated] = await db
    .update(users)
    .set({
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.teamId !== undefined ? { teamId: patch.teamId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, targetId))
    .returning({ id: users.id });

  if (!updated) throw ApiError.notFound('User not found');

  return getUser(targetId);
}

/**
 * The single shape every user endpoint returns — list, detail, and update alike, so
 * a client can reuse one type. Fields are listed explicitly rather than spread, which
 * fixes the key order and makes it impossible for a new column to leak in by accident.
 *
 * `emailVerifiedAt` becomes a boolean: whether the address is confirmed is what a
 * client needs, and the timestamp is not its business.
 */
function present(row: {
  id: string;
  name: string;
  email: string;
  role: string;
  teamId: string | null;
  teamName?: string | null;
  active: boolean;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  ownedQuotationCount?: number;
}) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    teamId: row.teamId,
    // "Unassigned" rather than null so the directory and the report rollup use the
    // same label for the same state.
    team: row.teamName ?? null,
    active: row.active,
    verified: row.emailVerifiedAt !== null,
    ownedQuotationCount: row.ownedQuotationCount ?? 0,
    createdAt: row.createdAt,
  };
}
