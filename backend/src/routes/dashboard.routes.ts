import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getDashboard } from '../controllers/dashboard.controller';

const router = Router();
router.use(requireAuth);
router.get('/', getDashboard);

export default router;
