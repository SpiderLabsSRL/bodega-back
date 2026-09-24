// src/routes/productsRoutes.js
const express = require("express");
const router = express.Router();
const productsController = require("../controllers/productsController");
const multer = require("multer");
const path = require("path");

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error("Solo se permiten imágenes (jpeg, jpg, png, gif, webp)"));
  },
});

// Rutas para opciones de selección
router.get("/ubicaciones", productsController.getUbicaciones);
router.get("/categorias", productsController.getCategorias);

// Rutas para productos
router.get("/productos", productsController.getProductos);
router.get("/todos", productsController.getTodosProductos);
router.get("/todos-select", productsController.getTodosProductosSelect);
router.get("/buscar", productsController.buscarProductos);

// IMPORTANTE: la ruta de imagen debe ir ANTES de /productos/:id
router.get("/productos/:id/imagen", productsController.getProductoImagen);

router.get("/productos/:id", productsController.getProductoById);
router.post(
  "/productos",
  upload.single("imagen"),
  productsController.createProducto,
);
router.put(
  "/productos/:id",
  upload.single("imagen"),
  productsController.updateProducto,
);
router.delete("/productos/:id", productsController.deleteProducto);
router.patch("/productos/:id/stock", productsController.updateStockProducto);

module.exports = router;