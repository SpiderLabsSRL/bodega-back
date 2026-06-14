const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// Rutas de autenticación
router.post("/auth/login", authController.login);
router.post("/auth/logout", authController.logout);
router.get("/auth/verify", authController.verifyToken);

module.exports = router;