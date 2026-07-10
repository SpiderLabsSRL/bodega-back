// src/routes/cajaRoutes.js
const express = require("express");
const router = express.Router();
const cajaController = require("../controllers/cajaController");

// Ruta para obtener todas las transacciones de caja
router.get("/caja/transacciones", cajaController.getTransaccionesCaja);

// Ruta para obtener estado actual de caja
router.get("/caja/estado-actual", cajaController.getEstadoCajaActual);

// Ruta para obtener saldo actual (monto_final)
router.get("/caja/saldo-actual", cajaController.getSaldoActual);

// Ruta para obtener usuarios únicos
router.get("/caja/usuarios", cajaController.getUsuariosCaja);

// Ruta para crear transacción de caja
router.post("/caja/transacciones", cajaController.createTransaccionCaja);

router.get("/caja/usuariosAdmins", cajaController.getUsuariosAdmin);

module.exports = router;