import multer from 'multer';
import { env } from '../config/env.js';

/** Keeps files in memory so they can be streamed straight to Cloudinary. */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
});
