import { toast } from 'sonner';

/**
 * One way to report the outcome of a server call.
 *
 * THE PROBLEM THIS REPLACES. Every mutation call site wrote its own `toast.success(...)`,
 * and most of them fired it whether or not the request had actually succeeded — several
 * did not even await the promise. So a 403 from an admin-only route, a 409 from a
 * business rule, or a 400 from a validation failure all presented as a green "Saved".
 * The user then reloaded, found nothing had changed, and reasonably concluded the API
 * was never called. It was called; its answer was thrown away.
 *
 * THE RULE: pass the whole result object. Every store action resolves to
 * `{ ok, error, code, ... }` — never a bare value — so `report()` can decide which toast
 * to raise from the result itself rather than trusting the call site to branch first.
 *
 * SERVER MESSAGES ARE RENDERED VERBATIM. The API writes its 4xx messages for a
 * salesperson ("That is more than the outstanding balance of INR 224130.00"), which is
 * more useful than anything this layer could compose. A generic fallback is used only
 * when the server sent nothing.
 */

/** Codes worth softening — expected outcomes rather than failures. */
const INFO_CODES = new Set(['NOTHING_TO_CONSOLIDATE', 'NO_COUNTER_PROPOSED']);

/** Codes that mean "you are not allowed", which reads better as a warning than an error. */
const PERMISSION_CODES = new Set(['FORBIDDEN', 'WRONG_KIND']);

export const notify = {
  success(title, description) {
    return toast.success(title, description ? { description } : undefined);
  },

  error(title, description) {
    return toast.error(title, description ? { description } : undefined);
  },

  warning(title, description) {
    return toast.warning(title, description ? { description } : undefined);
  },

  info(title, description) {
    return toast.info(title, description ? { description } : undefined);
  },

  /**
   * Report a store-action result.
   *
   * @param result   `{ ok, error, code }` from any store action.
   * @param success  string, or `{ title, description }`, shown when `ok`.
   * @param failure  optional title override for the failure case; the server's own
   *                 message always becomes the description.
   * @returns the result, so a caller can keep chaining on it.
   *
   * @example
   *   const result = await upsertProduct(form);
   *   if (!notify.report(result, { title: 'Product saved' })) return;
   */
  report(result, success, failure) {
    const ok = Boolean(result?.ok);
    const conf = typeof success === 'string' ? { title: success } : (success ?? {});

    if (ok) {
      toast.success(conf.title ?? 'Done', {
        description:
          typeof conf.description === 'function'
            ? conf.description(result)
            : (conf.description ?? undefined),
      });
      return true;
    }

    const message = result?.error ?? 'Something went wrong. Please try again.';
    const code = result?.code ?? null;
    const title = failure ?? conf.failure ?? 'Could not save';

    if (code && INFO_CODES.has(code)) toast.info(title, { description: message });
    else if (code && PERMISSION_CODES.has(code))
      toast.warning('Not permitted', { description: message });
    else toast.error(title, { description: message });

    return false;
  },
};

export { toast };
