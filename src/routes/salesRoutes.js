const express = require("express");
const router = express.Router();
const salesController = require("../controllers/salesController");

// Rutas de ventas
router.get("/sales/products/search", salesController.searchProducts);
router.post("/sales/process", salesController.processSale);
router.get("/sales/clientes/search", salesController.searchClientes);

module.exports = router;