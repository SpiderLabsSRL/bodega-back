const express = require("express");
const router = express.Router();
const pagosController = require("../controllers/pagosController");
const { authenticate } = require("../middleware/auth");

// Todas las rutas protegidas con authenticate
router.get("/pagos/pendientes", authenticate, pagosController.getPagosPendientes);
router.post("/pagos/procesar-pago/:id", authenticate, pagosController.procesarPago);
router.put("/pagos/actualizar-entregas/:id", authenticate, pagosController.actualizarEntregas);
router.patch("/pagos/marcar-entregado/:id", authenticate, pagosController.marcarComoEntregado);
router.delete("/pagos/eliminar/:id", authenticate, pagosController.eliminarCotizacion);

module.exports = router;