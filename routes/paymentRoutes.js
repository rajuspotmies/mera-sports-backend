import express from "express";
import { submitManualPayment } from "../controllers/paymentController.js";
import { authenticateUser as verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/submit-manual-payment", verifyToken, submitManualPayment);

export default router;
