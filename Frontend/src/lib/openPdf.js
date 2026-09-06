/**
 * Opens a PDF returned by `api.pdf()`.
 *
 * The server answers a PDF route in one of two ways — a hosted Cloudinary URL, or the
 * bytes streamed back — and `api.pdf()` flattens both into `{ url, hosted, revoke }`.
 * A streamed body becomes an in-memory blob URL, which stays allocated until it is
 * revoked, so that is done here on a delay rather than left to the caller to remember.
 *
 * `noopener` is set because the opened tab would otherwise get a `window.opener` handle
 * back into an authenticated session, and a hosted URL points at a third-party origin.
 *
 * The revoke is deferred rather than immediate: revoking synchronously after `open()`
 * races the new tab's own fetch of the blob and can hand it an empty document.
 */
export function openPdfResult(result) {
  if (!result?.url) return false;

  window.open(result.url, '_blank', 'noopener,noreferrer');

  if (result.revoke) {
    setTimeout(() => URL.revokeObjectURL(result.url), 60_000);
  }
  return true;
}
