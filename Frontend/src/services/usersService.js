/**
 * Users, roles and teams — API-REFERENCE §3 (5 endpoints).
 *
 *   GET   /users      any staff · ?role=&active=&teamId=&q=&page=&pageSize=
 *   GET   /users/:id  any staff
 *   PATCH /users/:id  admin (role, active) · admin or sales_manager (name, teamId)
 *   GET   /roles      ADMIN ONLY
 *   GET   /teams      any staff
 *
 * THERE IS NO POST /users AND NO DELETE. Every staff account comes from
 * POST /auth/signup, so every account has proved its own email and chosen its own
 * password. An admin-created account would need an invite flow to do either.
 *
 * Three server guards on PATCH, all returning 409 LAST_ADMIN or 400 as appropriate:
 *  1. an admin cannot change their own role,
 *  2. an admin cannot deactivate themselves,
 *  3. the last active admin cannot be demoted or disabled.
 * `role` can never be set to `admin` — the schema enum excludes it.
 */

import { api, buildQuery } from './apiClient';

/** @returns {Promise<{items: Array, meta: Object|null}>} */
export function listUsers({ role, active, teamId, q, page = 1, pageSize = 25 } = {}) {
  return api.list(`/users${buildQuery({ role, active, teamId, q, page, pageSize })}`);
}

export function getUser(userId) {
  return api.get(`/users/${encodeURIComponent(userId)}`);
}

/**
 * Promote, rename, reassign or disable.
 *
 * The split is deliberate: placing a rep in a territory is a manager's job and grants
 * nothing, while granting a role or disabling an account changes what somebody can
 * do and stays with the admin.
 *
 * @param patch {{role?, name?, active?, teamId?}} teamId null = Unassigned
 */
export function updateUser(userId, patch = {}) {
  const body = {};
  if (patch.role !== undefined) body.role = patch.role;
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.active !== undefined) body.active = patch.active;
  if (patch.teamId !== undefined) body.teamId = patch.teamId;

  if (Object.keys(body).length === 0) {
    throw new Error('Nothing to update — send role, name, active or teamId.');
  }
  if (body.role === 'admin') {
    throw new Error('The admin role cannot be assigned through the API.');
  }
  return api.patch(`/users/${encodeURIComponent(userId)}`, body);
}

/**
 * Assignable roles. ADMIN ONLY — a rep being shown roles they cannot assign is noise.
 *
 * Server-driven so the picker cannot drift out of step with what PATCH /users/:id
 * actually accepts. `admin` is absent because it is not assignable.
 *
 * @returns {Promise<Array>} [{ key, label, description, assignable, activeUsers }]
 */
export async function listRoles() {
  const data = await api.get('/roles');
  return Array.isArray(data) ? data : [];
}

/** @returns {Promise<Array>} [{ id, name, active, memberCount }] */
export async function listTeams() {
  const data = await api.get('/teams');
  return Array.isArray(data) ? data : [];
}
