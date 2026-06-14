const express = require("express");
const router = express.Router();
const salesController = require("../controllers/salesController");

// Rutas de ventas
router.get("/sales/products/search", salesController.searchProducts);
router.get("/sales/cash-status", salesController.getCashStatus);
router.post("/sales/process", salesController.processSale);

module.exports = router;
