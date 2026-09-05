import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { uploads, users } from '../../db/schema.js';
import { cacheDel, cached } from '../../lib/redis.js';
import { sendWelcomeEmail } from '../../lib/email.js';
import { uploadBuffer } from '../../lib/cloudinary.js';
import { upload } from '../../middleware/upload.js';
import { ApiError } from '../../utils/api-error.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const usersRouter = Router();

const createUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8),
});

/** Example wiring: Neon write + Resend email in one request. */
usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body);

    const [existing] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (existing) throw ApiError.conflict('A user with that email already exists');

    const [user] = await db
      .insert(users)
      .values({
        email: body.email,
        name: body.name,
        // Replace with a real hash (argon2/bcrypt) once auth lands.
        passwordHash: body.password,
      })
      .returning();

    if (!user) throw new Error('Failed to create user');

    await sendWelcomeEmail(user.email, user.name);

    res.status(201).json({ success: true, data: { id: user.id, email: user.email } });
  }),
);

/** Example wiring: Redis read-through cache in front of Neon. */
usersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.uuid().parse(req.params.id);

    const user = await cached(`user:${id}`, async () => {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!row) throw ApiError.notFound('User not found');
      const { passwordHash: _passwordHash, ...safe } = row;
      return safe;
    });

    res.json({ success: true, data: user });
  }),
);

/** Example wiring: Cloudinary upload recorded in Neon, cache invalidated after. */
usersRouter.post(
  '/:id/avatar',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    if (!req.file) throw ApiError.badRequest('Expected a file field named "file"');

    const result = await uploadBuffer(req.file.buffer, { publicId: `avatars/${id}` });

    await db
      .update(users)
      .set({ avatarUrl: result.secure_url, avatarPublicId: result.public_id, updatedAt: new Date() })
      .where(eq(users.id, id));

    await db.insert(uploads).values({
      userId: id,
      publicId: result.public_id,
      url: result.secure_url,
      format: result.format,
      bytes: String(result.bytes),
    });

    await cacheDel(`user:${id}`);

    res.status(201).json({ success: true, data: { url: result.secure_url } });
  }),
);
