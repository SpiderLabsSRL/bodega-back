// src/routes/cajaRoutes.js
const express = require("express");
const router = express.Router();
const cajaController = require("../controllers/cajaController");

// Ruta para obtener todas las transacciones de caja
router.get("/caja/transacciones", cajaController.getTransaccionesCaja);

// Ruta para obtener saldo actual
router.get("/cash/status", cajaController.getSaldoActual);

// Ruta para obtener usuarios únicos
router.get("/caja/usuarios", cajaController.getUsuariosCaja);

// Ruta para obtener usuarios Admin
router.get("/caja/usuariosAdmins", cajaController.getUsuariosAdmin);

// Ruta para crear transacción de caja
router.post("/caja/transacciones", cajaController.createTransaccionCaja);

// Ruta para obtener transferencias pendientes
router.get("/caja/transferencias/pendientes", cajaController.getTransferenciasPendientes);

// Ruta para aprobar transferencia
router.put("/caja/transferencias/:idtransferencia/aprobar", cajaController.aprobarTransferencia);

// Ruta para observar transferencia
router.put("/caja/transferencias/:idtransferencia/observar", cajaController.observarTransferencia);

// Ruta para rechazar transferencia
router.put("/caja/transferencias/:idtransferencia/rechazar", cajaController.rechazarTransferencia);

// Ruta para obtener información de una caja
router.get("/caja/:idcaja", cajaController.getCajaInfo);

module.exports = router;