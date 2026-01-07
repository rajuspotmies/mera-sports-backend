import express from "express";
import { getMessages, sendMessage, updateMessageStatus } from "../controllers/contactController.js";
import { verifyAdmin } from "../middleware/rbacMiddleware.js";

const router = express.Router();

router.get("/", verifyAdmin, getMessages);
router.put("/:id/status", verifyAdmin, updateMessageStatus);
router.post("/send", sendMessage);

export default router;