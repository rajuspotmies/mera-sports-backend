import express from "express";
import {
    getCategoryDraw,
    initBracket,
    uploadCategoryMedia,
    updateBracketMatch,
    setMatchResult,
    publishCategoryDraw,
    deleteCategoryMedia,
    resetBracket,
    deleteCategoryBracket,
    addBracketRound,
    deleteBracketRound
} from "../controllers/bracketController.js";
import { verifyAdmin } from "../middleware/rbacMiddleware.js";

const router = express.Router();

// Get draw/bracket for category
router.get("/events/:id/categories/:categoryId/draw", verifyAdmin, getCategoryDraw);
router.get("/events/:id/categories/draw", verifyAdmin, getCategoryDraw); // Alternative with categoryLabel query

// Initialize bracket
router.post("/events/:id/categories/:categoryId/bracket/init", verifyAdmin, initBracket);
router.post("/events/:id/categories/bracket/init", verifyAdmin, initBracket); // Alternative

// Upload media
router.post("/events/:id/categories/:categoryId/media", verifyAdmin, uploadCategoryMedia);
router.post("/events/:id/categories/media", verifyAdmin, uploadCategoryMedia); // Alternative

// Bracket match operations
router.post("/events/:id/categories/:categoryId/bracket/match", verifyAdmin, updateBracketMatch);
router.post("/events/:id/categories/bracket/match", verifyAdmin, updateBracketMatch); // Alternative

// Set match result
router.post("/events/:id/categories/:categoryId/bracket/result", verifyAdmin, setMatchResult);
router.post("/events/:id/categories/bracket/result", verifyAdmin, setMatchResult); // Alternative

// Publish/Unpublish
router.post("/events/:id/categories/:categoryId/publish", verifyAdmin, publishCategoryDraw);
router.post("/events/:id/categories/publish", verifyAdmin, publishCategoryDraw); // Alternative

// Delete media
router.delete("/events/:id/categories/:categoryId/media/:mediaId", verifyAdmin, deleteCategoryMedia);
router.delete("/events/:id/categories/media/:mediaId", verifyAdmin, deleteCategoryMedia); // Alternative

// Reset bracket
router.post("/events/:id/categories/:categoryId/bracket/reset", verifyAdmin, resetBracket);
router.post("/events/:id/categories/bracket/reset", verifyAdmin, resetBracket); // Alternative

// Delete bracket (unpublished only)
router.delete("/events/:id/categories/:categoryId/bracket", verifyAdmin, deleteCategoryBracket);
router.delete("/events/:id/categories/bracket", verifyAdmin, deleteCategoryBracket); // Alternative with categoryLabel query

// Add round to bracket (dynamic rounds)
router.post("/events/:id/categories/:categoryId/bracket/round/add", verifyAdmin, addBracketRound);
router.post("/events/:id/categories/bracket/round/add", verifyAdmin, addBracketRound); // Alternative with categoryLabel

// Delete last round from bracket
router.post("/events/:id/categories/:categoryId/bracket/round/delete", verifyAdmin, deleteBracketRound);
router.post("/events/:id/categories/bracket/round/delete", verifyAdmin, deleteBracketRound); // Alternative with categoryLabel

export default router;
