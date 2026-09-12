import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  updateTaskStatus,
} from '../controllers/task.controller';

const router = Router();

router.use(requireAuth);
router.get('/', listTasks);
router.get('/:id', getTask);
router.post('/', requireRole('ADMIN', 'PM'), createTask);
router.patch('/:id', requireRole('ADMIN', 'PM'), updateTask);
// Every role can reach this route; fine-grained ownership is enforced inside
// the controller (Developer: own task only; PM: own project only).
router.patch('/:id/status', updateTaskStatus);

export default router;
