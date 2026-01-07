import express from "express";
import {
    createEvent,
    deleteEvent,
    getEventBrackets,
    getEventDetails,
    getEventSponsors,
    listEvents,
    updateEvent
} from "../controllers/eventController.js";
import { verifyAdmin } from "../middleware/rbacMiddleware.js";

const router = express.Router();

router.post('/create', verifyAdmin, createEvent);
router.get('/list', listEvents);
router.get('/:id', getEventDetails);
router.get('/:id/brackets', getEventBrackets);
router.get('/:id/sponsors', getEventSponsors);
router.put('/:id', verifyAdmin, updateEvent);
router.delete('/:id', verifyAdmin, deleteEvent);

export default router;
