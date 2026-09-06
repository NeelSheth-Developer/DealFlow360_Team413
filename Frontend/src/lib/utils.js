import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Conditional classnames with Tailwind conflict resolution. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

let idCounter = 0;

/**
 * Stable unique id generator. Prefers crypto.randomUUID, falls back to a
 * counter so the app still works in older/insecure contexts.
 */
export function nextId(prefix = 'id') {
  idCounter += 1;
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}-${idCounter}`;
}

/** Artificial latency so loading states are visible in a backend-less app. */
export function sleep(ms = 350) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function clamp(n, min, max) {
  return Math.min(Math.max(Number(n) || 0, min), max);
}

/** Add days to a date and return an ISO date string (yyyy-MM-dd). */
export function addDaysISO(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nowISO() {
  return new Date().toISOString();
}

/** Random-ish but deterministic-looking token for portal links. */
export function makeToken(seed = '') {
  const base = `${seed}${Math.random().toString(36).slice(2)}`;
  return base.replace(/[^a-z0-9]/gi, '').slice(0, 20).toLowerCase();
}

export function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

export function sum(arr, fn = (x) => x) {
  return arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0);
}

export function mean(arr, fn = (x) => x) {
  if (!arr.length) return 0;
  return sum(arr, fn) / arr.length;
}

export function unique(arr) {
  return [...new Set(arr)];
}

export function sortBy(arr, fn, dir = 'asc') {
  const copy = [...arr];
  copy.sort((a, b) => {
    const av = fn(a);
    const bv = fn(b);
    if (av === bv) return 0;
    const res = av > bv ? 1 : -1;
    return dir === 'asc' ? res : -res;
  });
  return copy;
}

/** Deep-ish clone good enough for our plain-data seed objects. */
export function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function titleCase(str = '') {
  return String(str)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

/** Copy text to clipboard with a non-throwing fallback. */
export async function copyToClipboard(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path below
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deterministic avatar gradient.
 *
 * Seeded accounts used to carry a hand-picked `avatarColor`. Accounts now come
 * from the API, which has no opinion on styling, so the gradient is derived from
 * a stable seed (user id or email) instead. Same input always yields the same
 * gradient, so an avatar never changes colour between renders or sessions.
 */
const AVATAR_GRADIENTS = [
  'from-brand-500 to-accent-indigo',
  'from-accent-indigo to-accent-teal',
  'from-accent-teal to-brand-400',
  'from-brand-600 to-accent-pink',
  'from-accent-amber to-accent-pink',
  'from-brand-700 to-brand-400',
  'from-accent-pink to-brand-500',
  'from-state-info to-accent-teal',
];

export function avatarGradient(seed = '') {
  const key = String(seed);
  if (!key) return AVATAR_GRADIENTS[0];

  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}
