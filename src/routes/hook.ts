import { Router } from 'express';

// Import controller modules.
import hookController from '@controllers/hookController';

// Create router
const router = Router();

/// HOOK ROUTES ///

// POST request vk hook
router.post('/', hookController.post);

export default router;
