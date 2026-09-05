/**
 * Staff directory records used to populate reporting, quotation ownership and
 * the reps dropdown until GET /users replaces them.
 *
 * THESE ARE NOT CREDENTIALS. Authentication is entirely server-side via
 * POST /auth/login — there are no passwords in this file and nothing here can
 * sign anyone in. The plaintext `password` field and the `roleQuickPick`
 * one-click login list were both removed when auth moved to the API.
 *
 * `avatarColor` is also gone: it is now derived from the user id by
 * `avatarGradient()` in src/lib/utils.js, so API-sourced users get one too.
 */
export const users = [
  {
    id: 'u-priya',
    name: 'Priya Sharma',
    email: 'priya.sharma@dealflow360.com',
    role: 'sales_rep',
    team: 'Enterprise West',
  },
  {
    id: 'u-rahul',
    name: 'Rahul Mehta',
    email: 'rahul.mehta@dealflow360.com',
    role: 'sales_rep',
    team: 'Enterprise East',
  },
  {
    id: 'u-kiran',
    name: 'Kiran Nair',
    email: 'kiran.nair@dealflow360.com',
    role: 'sales_rep',
    team: 'Mid-Market',
  },
  {
    id: 'u-anita',
    name: 'Anita Desai',
    email: 'anita.desai@dealflow360.com',
    role: 'sales_manager',
    team: 'Enterprise',
  },
  {
    id: 'u-vikram',
    name: 'Vikram Rao',
    email: 'vikram.rao@dealflow360.com',
    role: 'finance',
    team: 'Finance',
  },
  {
    id: 'u-neha',
    name: 'Neha Gupta',
    email: 'neha.gupta@dealflow360.com',
    role: 'admin',
    team: 'Operations',
  },
];
