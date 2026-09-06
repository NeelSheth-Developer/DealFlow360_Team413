import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { cloudinaryConfigured, env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Cloudinary upload for generated documents.
 *
 * Configured lazily on first use rather than at import time, so a deployment without
 * Cloudinary credentials still boots — the PDF endpoints fall back to streaming the
 * file straight back to the caller. A hard dependency on a third-party account for a
 * feature that has a perfectly good local path would be the wrong trade.
 *
 * PDFs are uploaded as `resource_type: 'raw'`. Cloudinary's `image` pipeline would try
 * to rasterise them, which turns a three-page invoice into a picture of its first page.
 */

let configured = false;

function ensureConfigured() {
  if (configured || !cloudinaryConfigured) return;

  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  configured = true;
}

/**
 * Whether this cloud will actually SERVE what we upload.
 *
 * Cloudinary ships with "Allow delivery of PDF and ZIP files" DISABLED — a deliberate
 * default, hardened years ago against people using the CDN to host arbitrary documents.
 * An upload under that setting still succeeds and still returns a `secure_url`, and only
 * a GET on that URL reveals the truth: `401` with `x-cld-error: deny or ACL failure`.
 *
 * So a successful upload is NOT evidence the link works, and the app was handing
 * customers a URL that renders "This page isn't working". Probing once per process and
 * remembering the answer costs one HEAD per cold start and turns a broken link into the
 * streamed file, which has always been the fallback for an unconfigured deployment.
 *
 * `null` means "not probed yet". Once it is `false` no further uploads are attempted.
 */
let deliveryWorks: boolean | null = null;

/** HEAD the uploaded URL to see whether the CDN will serve it to a customer. */
async function canDeliver(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (response.ok) return true;

    logger.warn(
      { status: response.status, cldError: response.headers.get('x-cld-error'), url },
      'Cloudinary accepted the upload but will not deliver it — falling back to streaming. ' +
        'Enable "Allow delivery of PDF and ZIP files" under Settings > Security to use hosted links.',
    );
    return false;
  } catch (error) {
    logger.warn({ err: error, url }, 'Could not verify Cloudinary delivery — falling back to streaming');
    return false;
  }
}

export type UploadResult = {
  url: string;
  publicId: string;
  bytes: number;
  format: string | null;
};

/**
 * Uploads a PDF and returns its hosted URL.
 *
 * `publicId` is stable and derived from the document reference (`quotations/Q-1042`),
 * with `overwrite: true`: regenerating a quotation's PDF after an edit replaces the
 * old file rather than accumulating a new one on every download, and the URL a rep has
 * already sent to a customer keeps working and shows the current version.
 */
export async function uploadPdf(buffer: Buffer, publicId: string): Promise<UploadResult | null> {
  if (!cloudinaryConfigured) return null;
  // Already known not to deliver on this cloud — skip the upload entirely.
  if (deliveryWorks === false) return null;
  ensureConfigured();

  try {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder: env.CLOUDINARY_FOLDER,
          public_id: publicId,
          overwrite: true,
          format: 'pdf',
        },
        (error, uploaded) => {
          // Cloudinary's callback error is typed loosely; normalised to an Error so the
          // rejection carries a usable message and a stack rather than "[object Object]".
          if (error) {
            reject(new Error(error.message || 'Cloudinary upload failed'));
            return;
          }
          if (!uploaded) {
            reject(new Error('Cloudinary returned no result'));
            return;
          }
          resolve(uploaded);
        },
      );
      stream.end(buffer);
    });

    const url = result.secure_url || result.url || '';

    // Verified once per process: an upload that cannot be delivered is worse than no
    // upload at all, because the caller stops streaming and hands out a dead link.
    if (deliveryWorks === null) deliveryWorks = await canDeliver(url);
    if (!deliveryWorks) return null;

    return {
      url,
      publicId: result.public_id || publicId,
      bytes: result.bytes || buffer.byteLength,
      format: result.format || 'pdf',
    };
  } catch (error) {
    // Never fatal. The caller falls back to streaming the PDF, so a Cloudinary outage
    // costs the hosted link, not the document.
    logger.error({ err: error, publicId }, 'Cloudinary upload failed');
    return null;
  }
}
