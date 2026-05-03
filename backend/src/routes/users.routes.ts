import { Router } from 'express';
import { listUsers, createUser, updateUser, deleteUser } from '../controllers/users.controller';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

// All routes require authentication + admin role
router.use(authMiddleware, adminMiddleware);

router.get('/', listUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
