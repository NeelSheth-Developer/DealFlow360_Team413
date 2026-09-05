/**
 * Seeded customers. These have their own accounts, entirely separate from staff
 * accounts, and sign in under /customer/*.
 *
 * `password: null` means the company exists commercially but nobody has claimed
 * the login yet — Forge Analytics and Gemini Healthcare are left that way so the
 * "claim your existing account" signup path is demonstrable.
 *
 * Tier is never self-selected at signup. New registrations start at Bronze and
 * only a Sales Manager or Admin can promote them, because tier sets pricing.
 */
const DEMO_PASSWORD = 'demo1234';

export const customers = [
  {
    id: 'c-acme',
    name: 'Acme Corp',
    tier: 'gold',
    contactName: 'Sundar Iyer',
    email: 'sundar.iyer@acmecorp.example',
    password: DEMO_PASSWORD,
    currency: 'INR',
    industry: 'Manufacturing',
  },
  {
    id: 'c-beta',
    name: 'Beta Industries',
    tier: 'silver',
    contactName: 'Meera Kapoor',
    email: 'meera.kapoor@betaind.example',
    password: DEMO_PASSWORD,
    currency: 'INR',
    industry: 'Industrial Equipment',
  },
  {
    id: 'c-cygnus',
    name: 'Cygnus Retail',
    tier: 'bronze',
    contactName: 'Arjun Bose',
    email: 'arjun.bose@cygnusretail.example',
    password: DEMO_PASSWORD,
    currency: 'INR',
    industry: 'Retail',
  },
  {
    id: 'c-delta',
    name: 'Delta Logistics',
    tier: 'gold',
    contactName: 'Fatima Sheikh',
    email: 'fatima.sheikh@deltalog.example',
    password: DEMO_PASSWORD,
    currency: 'INR',
    industry: 'Logistics',
  },
  {
    id: 'c-everest',
    name: 'Everest Labs',
    tier: 'silver',
    contactName: 'Daniel Weber',
    email: 'daniel.weber@everestlabs.example',
    password: DEMO_PASSWORD,
    currency: 'USD',
    industry: 'Life Sciences',
  },
  {
    // No password yet — demonstrates the "claim your account" signup path.
    id: 'c-forge',
    name: 'Forge Analytics',
    tier: 'bronze',
    contactName: 'Ritu Malhotra',
    email: 'ritu.malhotra@forgeanalytics.example',
    password: null,
    currency: 'INR',
    industry: 'Software',
  },
  {
    id: 'c-gemini',
    name: 'Gemini Healthcare',
    tier: 'gold',
    contactName: 'Dr. Ashok Pillai',
    email: 'ashok.pillai@geminihc.example',
    password: null,
    currency: 'INR',
    industry: 'Healthcare',
  },
  {
    id: 'c-horizon',
    name: 'Horizon Education',
    tier: 'silver',
    contactName: 'Lakshmi Menon',
    email: 'lakshmi.menon@horizonedu.example',
    password: DEMO_PASSWORD,
    currency: 'INR',
    industry: 'Education',
  },
];

export { DEMO_PASSWORD };
