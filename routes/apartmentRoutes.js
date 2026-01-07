import express from "express";
import { addApartment, deleteApartment, getApartments, migrateApartments, updateApartment } from "../controllers/apartmentController.js";

const router = express.Router();

router.post("/migrate", migrateApartments);
router.get("/", getApartments);
router.post("/", addApartment);
router.put("/:id", updateApartment);
router.delete("/:id", deleteApartment);

export default router;
