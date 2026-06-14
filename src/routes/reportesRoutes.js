const express = require("express");
const router = express.Router();
const reportesController = require("../controllers/reportesController");

// Productos más vendidos
router.get("/reportes/productos-mas-vendidos", reportesController.getProductosMasVendidos);

// Productos sin vender
router.get("/reportes/productos-sin-vender", reportesController.getProductosSinVender);

// Análisis de productos
router.get("/reportes/analisis-productos", reportesController.getAnalisisProductos);

// Objetivos
router.get("/reportes/objetivos", reportesController.getObjetivos);
router.get("/reportes/objetivos/objetivo", reportesController.getObjetivo);
router.post("/reportes/objetivos", reportesController.createOrUpdateObjetivo);

// Ventas mensuales
router.get("/reportes/ventas-mensuales", reportesController.getVentasMensuales);

module.exports = router;