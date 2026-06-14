// src/routes/cashRoutes.js
const express = require("express");
const router = express.Router();
const cashController = require("../controllers/cashController");

// Ruta para obtener el estado de caja (con userId en query params)
router.get("/cash/status", cashController.getCashStatus);

// Ruta para obtener transacciones del usuario (con userId en query params)
router.get("/cash/transactions/user", cashController.getUserTransactions);

// Ruta para crear una nueva transacción
router.post("/cash/transactions", cashController.createTransaction);

// Ruta para abrir caja
router.post("/cash/open", cashController.openCash);

// Ruta para cerrar caja
router.post("/cash/close", cashController.closeCash);

module.exports = router;