// src/routes/cajaRoutes.js
const express = require("express");
const router = express.Router();
const cajaController = require("../controllers/cajaController");

// Ruta para obtener todas las transacciones de caja
router.get("/caja/transacciones", cajaController.getTransaccionesCaja);

// Ruta para obtener transacciones de caja por fecha
router.get("/caja/transacciones/fecha/:fecha", cajaController.getTransaccionesCajaByFecha);

// Ruta para obtener transacciones de caja por rango de fechas
router.get("/caja/transacciones/rango/:fechaInicio/:fechaFin", cajaController.getTransaccionesCajaByRango);

// Ruta para obtener transacciones de caja por usuario
router.get("/caja/transacciones/usuario/:idusuario", cajaController.getTransaccionesCajaByUsuario);

// Ruta para obtener transacciones de caja por usuario y fecha
router.get("/caja/transacciones/usuario/:idusuario/fecha/:fecha", cajaController.getTransaccionesCajaByUsuarioFecha);

// Ruta para obtener transacciones de caja por usuario y rango de fechas
router.get("/caja/transacciones/usuario/:idusuario/rango/:fechaInicio/:fechaFin", cajaController.getTransaccionesCajaByUsuarioRango);

// Ruta para obtener estado actual de caja
router.get("/caja/estado-actual", cajaController.getEstadoCajaActual);

// Ruta para obtener saldo actual (monto_final)
router.get("/caja/saldo-actual", cajaController.getSaldoActual);

// Ruta para obtener usuarios únicos
router.get("/caja/usuarios", cajaController.getUsuariosCaja);

// Ruta para crear transacción de caja
router.post("/caja/transacciones", cajaController.createTransaccionCaja);

module.exports = router;