import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { listDevelopers, listClients } from '../controllers/misc.controller';

const router = Router();
router.use(requireAuth);
router.get('/developers', requireRole('ADMIN', 'PM'), listDevelopers);
router.get('/clients', requireRole('ADMIN', 'PM'), listClients);

export default router;
