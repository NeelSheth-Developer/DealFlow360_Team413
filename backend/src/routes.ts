import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { rolesRouter } from './modules/users/roles.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/roles', rolesRouter);
