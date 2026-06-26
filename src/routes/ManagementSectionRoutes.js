// src/routes/ManagementRoutes.js
const express = require("express");
const router = express.Router();
const ManagementSectionController = require("../controllers/ManagementSectionController");

// ============================================
// RUTAS PARA CATEGORÍAS
// ============================================

router.get("/management/categorias", ManagementSectionController.getCategorias);
router.post("/management/categorias", ManagementSectionController.createCategoria);
router.put("/management/categorias/:id", ManagementSectionController.updateCategoria);
router.delete("/management/categorias/:id", ManagementSectionController.deleteCategoria);

// ============================================
// RUTAS PARA UBICACIONES
// ============================================

router.get("/management/ubicaciones", ManagementSectionController.getUbicaciones);
router.post("/management/ubicaciones", ManagementSectionController.createUbicacion);
router.put("/management/ubicaciones/:id", ManagementSectionController.updateUbicacion);
router.delete("/management/ubicaciones/:id", ManagementSectionController.deleteUbicacion);

module.exports = router;