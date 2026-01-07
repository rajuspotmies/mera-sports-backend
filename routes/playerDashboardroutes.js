import express from "express";
import {
    addFamilyMember,
    changePassword,
    checkConflict, checkPassword,
    deleteAccount,
    deleteFamilyMember,
    getPlayerDashboard,
    updateFamilyMember,
    updateProfile
} from "../controllers/playerController.js";
import { verifyPlayer } from "../middleware/rbacMiddleware.js";

const router = express.Router();

router.get("/dashboard", verifyPlayer, getPlayerDashboard);
router.post("/check-conflict", verifyPlayer, checkConflict);
router.post("/check-password", verifyPlayer, checkPassword);
router.put("/update-profile", verifyPlayer, updateProfile);
router.put("/change-password", verifyPlayer, changePassword);
router.delete("/delete-account", verifyPlayer, deleteAccount);

/* ================= FAMILY MEMBERS ================= */
router.post("/add-family-member", verifyPlayer, addFamilyMember);
router.put("/update-family-member/:id", verifyPlayer, updateFamilyMember);
router.delete("/delete-family-member/:id", verifyPlayer, deleteFamilyMember);

export default router;
