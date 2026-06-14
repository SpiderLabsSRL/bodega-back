const express = require("express");
const router = express.Router();
const usersController = require("../controllers/usersController");

// Rutas para usuarios
router.get("/users", usersController.getUsuarios);
router.post("/users", usersController.createUsuario);
router.put("/users/:id", usersController.updateUsuario);
router.delete("/users/:id", usersController.deleteUsuario);
router.patch("/users/:id/toggle-status", usersController.toggleUsuarioStatus);

module.exports = router;