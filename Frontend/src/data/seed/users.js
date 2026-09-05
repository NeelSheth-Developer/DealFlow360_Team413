/**
 * Seeded internal staff — one per role, plus extra reps for reporting variety.
 *
 * Accounts exist only through self-signup; these are the pre-registered ones.
 * No role, including admin, can create an account for anyone else.
 *
 * Passwords are stored in plain text because this build has no server. A real
 * deployment hashes them server-side and never ships them to the client.
 */
const DEMO_PASSWORD = 'demo1234';

export const users = [
  {
    id: 'u-priya',
    name: 'Priya Sharma',
    email: 'priya.sharma@dealflow360.com',
    password: DEMO_PASSWORD,
    role: 'sales_rep',
    team: 'Enterprise West',
    avatarColor: 'from-brand-500 to-accent-indigo',
  },
  {
    id: 'u-rahul',
    name: 'Rahul Mehta',
    email: 'rahul.mehta@dealflow360.com',
    password: DEMO_PASSWORD,
    role: 'sales_rep',
    team: 'Enterprise East',
    avatarColor: 'from-accent-indigo to-accent-teal',
  },
  {
    id: 'u-kiran',
    name: 'Kiran Nair',
    email: 'kiran.nair@dealflow360.com',
    password: DEMO_PASSWORD,
    role: 'sales_rep',
    team: 'Mid-Market',
    avatarColor: 'from-accent-teal to-brand-400',
  },
  {
    id: 'u-anita',
    name: 'Anita Desai',
    email: 'anita.desai@dealflow360.com',
    password: DEMO_PASSWORD,
    role: 'sales_manager',
    team: 'Enterprise',
    avatarColor: 'from-brand-600 to-accent-pink',
  },
  {
    id: 'u-vikram',
    name: 'Vikram Rao',
    email: 'vikram.rao@dealflow360.com',
    password: DEMO_PASSWORD,
    role: 'finance',
    team: 'Finance',
    avatarColor: 'from-accent-amber to-accent-pink',
  },
  {
    id: 'u-neha',
    name: 'Neha Gupta',
    email: 'neha.gupta@dealflow360.com',
    password: DEMO_PASSWORD,
    role: 'admin',
    team: 'Operations',
    avatarColor: 'from-brand-700 to-brand-400',
  },
];

/** Role quick-pick cards on the staff login screen. */
export const roleQuickPick = [
  {
    role: 'sales_rep',
    userId: 'u-priya',
    label: 'Sales Rep',
    blurb: 'Builds quotations, applies discounts, answers customers.',
  },
  {
    role: 'sales_manager',
    userId: 'u-anita',
    label: 'Sales Manager',
    blurb: 'Approves discounts, sets ceilings, assigns and promotes.',
  },
  {
    role: 'finance',
    userId: 'u-vikram',
    label: 'Finance',
    blurb: 'Second-level approvals, and the only role that settles payments.',
  },
  {
    role: 'admin',
    userId: 'u-neha',
    label: 'Admin',
    blurb: 'Full backend configuration and platform analytics.',
  },
];

export { DEMO_PASSWORD };
