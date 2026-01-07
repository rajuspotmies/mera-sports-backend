import express from "express";
import { getNotifications, markNotificationsRead } from "../controllers/notificationController.js";

const router = express.Router();

// Local Middleware (because main authMiddleware might be different or circular? No, usually fine to import.)
// But original file had a local 'authenticate' function. I should probably use the standard one or keep this simple one.
// Let's import the standard one to accept 'player' or 'admin'.
import { authenticateUser } from "../middleware/authMiddleware.js";

router.get("/", authenticateUser, getNotifications);
router.post("/mark-read", authenticateUser, markNotificationsRead);

export default router;
