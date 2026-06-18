// ClientesRoutes.js
const express = require("express");
const router = express.Router();
const clientesController = require("../controllers/ClientesController");

// Rutas para clientes
router.get("/clientes", clientesController.getClientes);
router.post("/clientes", clientesController.createCliente);
router.put("/clientes/:id", clientesController.updateCliente);
router.delete("/clientes/:id", clientesController.deleteCliente);
router.patch("/clientes/:id/toggle-status", clientesController.toggleClienteStatus);

module.exports = router;