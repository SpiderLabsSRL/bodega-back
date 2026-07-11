// src/routes/sales.routes.js
const express = require("express");
const router = express.Router();
const salesController = require("../controllers/salesController");

// Rutas de ventas
router.get("/sales/products/search", salesController.searchProducts);
router.post("/sales/process", salesController.processSale);
router.get("/sales/clientes/search", salesController.searchClientes);
router.get("/sales/caja/estado", salesController.getEstadoCaja);

module.exports = router;