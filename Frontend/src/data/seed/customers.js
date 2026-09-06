/**
 * Customer directory records, used for quotation ownership, tier pricing and
 * reporting until GET /customers/:id and a customer list endpoint exist.
 *
 * THESE ARE NOT CREDENTIALS. Customers authenticate server-side through
 * POST /auth/login with type:'customer'. The plaintext `password` fields are
 * gone, and with them the "claim your existing unclaimed account" signup path —
 * that flow was a frontend invention with no API behind it.
 *
 * Tier is never self-selected at signup. New registrations start at Bronze and
 * only a Sales Manager or Admin can promote them, because tier sets pricing.
 */

export const customers = [
  {
    id: 'c-acme',
    name: 'Acme Corp',
    tier: 'gold',
    contactName: 'Sundar Iyer',
    email: 'sundar.iyer@acmecorp.example',
    currency: 'INR',
    industry: 'Manufacturing',
  },
  {
    id: 'c-beta',
    name: 'Beta Industries',
    tier: 'silver',
    contactName: 'Meera Kapoor',
    email: 'meera.kapoor@betaind.example',
    currency: 'INR',
    industry: 'Industrial Equipment',
  },
  {
    id: 'c-cygnus',
    name: 'Cygnus Retail',
    tier: 'bronze',
    contactName: 'Arjun Bose',
    email: 'arjun.bose@cygnusretail.example',
    currency: 'INR',
    industry: 'Retail',
  },
  {
    id: 'c-delta',
    name: 'Delta Logistics',
    tier: 'gold',
    contactName: 'Fatima Sheikh',
    email: 'fatima.sheikh@deltalog.example',
    currency: 'INR',
    industry: 'Logistics',
  },
  {
    id: 'c-everest',
    name: 'Everest Labs',
    tier: 'silver',
    contactName: 'Daniel Weber',
    email: 'daniel.weber@everestlabs.example',
    currency: 'USD',
    industry: 'Life Sciences',
  },
  {
    id: 'c-forge',
    name: 'Forge Analytics',
    tier: 'bronze',
    contactName: 'Ritu Malhotra',
    email: 'ritu.malhotra@forgeanalytics.example',
    currency: 'INR',
    industry: 'Software',
  },
  {
    id: 'c-gemini',
    name: 'Gemini Healthcare',
    tier: 'gold',
    contactName: 'Dr. Ashok Pillai',
    email: 'ashok.pillai@geminihc.example',
    currency: 'INR',
    industry: 'Healthcare',
  },
  {
    id: 'c-horizon',
    name: 'Horizon Education',
    tier: 'silver',
    contactName: 'Lakshmi Menon',
    email: 'lakshmi.menon@horizonedu.example',
    currency: 'INR',
    industry: 'Education',
  },
];
