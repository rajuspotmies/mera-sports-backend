import express from "express";
import { createAdvertisement, deleteAdvertisement, getAdvertisements, toggleAdvertisement, updateAdvertisement } from "../controllers/advertisementController.js";
import { verifyAdmin } from "../middleware/rbacMiddleware.js";

const router = express.Router();

router.get("/", getAdvertisements);
router.post("/", verifyAdmin, createAdvertisement);
router.put("/:id", verifyAdmin, updateAdvertisement);
router.delete("/:id", verifyAdmin, deleteAdvertisement);
router.patch("/:id/toggle", verifyAdmin, toggleAdvertisement);

export default router;
