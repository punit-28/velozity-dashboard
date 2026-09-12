import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getActivityFeed } from '../controllers/feed.controller';

const router = Router();
router.use(requireAuth);
router.get('/', getActivityFeed);

export default router;
