// src/routes/TransferenciaRoutes.js
const express = require("express");
const router = express.Router();
const transferenciaController = require("../controllers/TransferenciaController");

// Obtener todas las transferencias (filtradas por rol)
router.get("/transferencias", transferenciaController.getTransferencias);

// Obtener una transferencia por ID
router.get("/transferencias/:idtransferencia", transferenciaController.getTransferenciaById);

// Crear una nueva transferencia
router.post("/transferencias", transferenciaController.crearTransferencia);

// Aprobar una transferencia
router.put("/transferencias/:idtransferencia/aprobar", transferenciaController.aprobarTransferencia);

// Observar una transferencia
router.put("/transferencias/:idtransferencia/observar", transferenciaController.observarTransferencia);

// Rechazar una transferencia
router.put("/transferencias/:idtransferencia/rechazar", transferenciaController.rechazarTransferencia);

// Obtener transferencias pendientes (solo Admin)
router.get("/transferencias/pendientes", transferenciaController.getTransferenciasPendientes);

// Obtener transferencias de un usuario específico
router.get("/transferencias/usuario/:idusuario", transferenciaController.getTransferenciasByUsuario);

// Contar transferencias pendientes
router.get("/transferencias/pendientes/count", transferenciaController.countTransferenciasPendientes);

module.exports = router;