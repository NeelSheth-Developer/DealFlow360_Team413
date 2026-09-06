import { toast } from '@/lib/notify';

/**
 * Opens a PDF returned by `api.pdf()`.
 *
 * The server answers a PDF route in one of two ways — a hosted URL, or the bytes
 * streamed back — and `api.pdf()` flattens both into `{ url, hosted, revoke }`, having
 * already verified that a hosted link is one the browser can actually open. A streamed
 * body becomes an in-memory blob URL, which stays allocated until it is revoked, so that
 * is done here on a delay rather than left to the caller to remember.
 *
 * `noopener` is set because the opened tab would otherwise get a `window.opener` handle
 * back into an authenticated session, and a hosted URL points at a third-party origin.
 *
 * The revoke is deferred rather than immediate: revoking synchronously after `open()`
 * races the new tab's own fetch of the blob and can hand it an empty document.
 */
export function openPdfResult(result) {
  if (!result?.url) return false;

  const opened = window.open(result.url, '_blank', 'noopener,noreferrer');

  // POPUP BLOCKERS ARE THE SECOND WAY A PDF "DOESN'T OPEN".
  //
  // Rendering a PDF is the slowest thing the API does, and `window.open` runs after
  // that await — well past the few seconds of transient user activation a browser
  // grants a click. When the blocker steps in, `open()` returns null and the old code
  // returned `true` regardless, so the button looked like it had worked and nothing
  // appeared. A download is not popup-gated, so that is the fallback; the toast is the
  // last resort for the browsers that gate both.
  if (!opened) {
    if (!downloadInstead(result)) {
      toast.error('Your browser blocked the document window', {
        description: 'Allow pop-ups for this site, then try again.',
      });
      return false;
    }
  }

  if (result.revoke) {
    setTimeout(() => URL.revokeObjectURL(result.url), 60_000);
  }
  return true;
}

/** Save the file instead of opening a tab. Returns false if the browser refused. */
function downloadInstead(result) {
  try {
    const link = document.createElement('a');
    link.href = result.url;
    link.download = `${result.reference ?? 'document'}.pdf`;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success('Document downloaded', {
      description: 'Your browser blocked the new tab, so the file was saved instead.',
    });
    return true;
  } catch {
    return false;
  }
}
