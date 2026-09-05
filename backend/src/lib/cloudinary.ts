import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { env } from '../config/env.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

/** Uploads an in-memory file buffer to Cloudinary under the configured folder. */
export function uploadBuffer(
  buffer: Buffer,
  options: { folder?: string; publicId?: string } = {},
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder ?? env.CLOUDINARY_FOLDER,
        ...(options.publicId ? { public_id: options.publicId } : {}),
        resource_type: 'auto',
      },
      (error, result) => {
        if (error)
          return reject(new Error(error.message ?? 'Cloudinary upload failed', { cause: error }));
        if (!result) return reject(new Error('Cloudinary returned an empty response'));
        resolve(result);
      },
    );

    stream.end(buffer);
  });
}

export function deleteAsset(publicId: string) {
  return cloudinary.uploader.destroy(publicId);
}

/** Builds a transformed delivery URL for an already-uploaded asset. */
export function buildUrl(publicId: string, width = 400, height = 400) {
  return cloudinary.url(publicId, {
    width,
    height,
    crop: 'fill',
    quality: 'auto',
    fetch_format: 'auto',
    secure: true,
  });
}

export { cloudinary };
