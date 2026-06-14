const express = require("express");
const router = express.Router();
const notesController = require("../controllers/notesController");

// Rutas para notas
router.get("/notes", notesController.getNotes);
router.post("/notes", notesController.createNote);
router.put("/notes/:id", notesController.updateNote);
router.delete("/notes/:id", notesController.deleteNote);

module.exports = router;