import express from 'express';
import { createTeam, deleteTeam, getMyTeams, lookupPlayer, updateTeam } from '../controllers/teamController.js';
import { authenticateUser as verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/my-teams', verifyToken, getMyTeams);
router.get('/player-lookup/:playerId', verifyToken, lookupPlayer);
router.post('/create', verifyToken, createTeam);
router.put('/:id', verifyToken, updateTeam);
router.delete('/:id', verifyToken, deleteTeam);

export default router;
