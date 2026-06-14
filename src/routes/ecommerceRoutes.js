// src/routes/ecommerceRoutes.js - Agregar esta ruta
const express = require("express");
const router = express.Router();
const ecommerceController = require("../controllers/ecommerceController");

// Rutas para carruseles
router.get("/ecommerce/carruseles", ecommerceController.getCarruseles);
router.post("/ecommerce/carruseles", ecommerceController.createCarrusel);
router.put("/ecommerce/carruseles/:id", ecommerceController.updateCarrusel);
router.delete("/ecommerce/carruseles/:id", ecommerceController.deleteCarrusel);

// Rutas para variantes de carruseles
router.get("/ecommerce/carruseles/:id/productos", ecommerceController.getCarruselProductos);
router.post("/ecommerce/carruseles/:id/productos", ecommerceController.addCarruselProductos);
router.put("/ecommerce/carruseles/:id/productos", ecommerceController.updateCarruselProductos);

// Rutas para productos
router.get("/ecommerce/productos", ecommerceController.getProductos);
router.get("/ecommerce/productos/search", ecommerceController.searchProductos); // NUEVA RUTA
router.get("/ecommerce/productos/:id/categorias", ecommerceController.getProductoCategorias);

module.exports = router;