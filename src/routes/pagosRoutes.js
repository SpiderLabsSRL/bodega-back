const express = require("express");
const router = express.Router();
const pagosController = require("../controllers/pagosController");

// Obtener todas las cotizaciones con pagos pendientes
router.get("/pagos/pendientes", pagosController.getPagosPendientes);

// Procesar pago de una cotización
router.post("/pagos/procesar-pago/:id", pagosController.procesarPago);

// Actualizar entregas de productos
router.put("/pagos/actualizar-entregas/:id", pagosController.actualizarEntregas);

// Marcar cotización como completamente entregada
router.patch("/pagos/marcar-entregado/:id", pagosController.marcarComoEntregado);
// Eliminar cotización (cambiar estado a 1)
router.delete("/pagos/eliminar/:id", pagosController.eliminarCotizacion);

module.exports = router; 