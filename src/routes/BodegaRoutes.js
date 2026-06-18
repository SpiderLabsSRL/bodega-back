// src/routes/BodegaRoutes.js
const express = require("express");
const router = express.Router();
const BodegaController = require("../controllers/BodegaController");
const multer = require("multer");
const path = require("path");

// Configuración de multer para manejar archivos
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Solo se permiten imágenes (jpeg, jpg, png, gif)"));
    }
  },
});

// ============================================
// RUTAS QUE DEBEN IR PRIMERO (sin parámetros dinámicos)
// ============================================

router.get("/activas", BodegaController.getBodegasActivas);
router.get("/productos/todos", BodegaController.getAllProductos);
router.get("/buscar", BodegaController.buscarProductos);

// Crear una nueva bodega (sucursal)
router.post("/", BodegaController.createBodega);

// Crear un nuevo producto en bodega
router.post(
  "/productos",
  upload.single("imagen"),
  BodegaController.createProducto
);

// Actualizar un producto en bodega
router.put(
  "/productos/:id",
  upload.single("imagen"),
  BodegaController.updateProducto
);

// Obtener un producto por ID
router.get("/productos/:id", BodegaController.getProductoById);

// Eliminar un producto de bodega
router.delete("/productos/:id", BodegaController.deleteProducto);

// Actualizar stock de un producto en una bodega específica
router.patch("/productos/:id/stock", BodegaController.updateStock);

// Transferir producto a otra bodega
router.post("/transferir", BodegaController.transferirProducto);

// Obtener ubicaciones
router.get("/ubicaciones", BodegaController.getUbicaciones);

// Obtener categorías
router.get("/categorias", BodegaController.getCategorias);

// ============================================
// RUTAS CON PARÁMETROS DINÁMICOS (DEBEN IR AL FINAL)
// ============================================

router.get("/", BodegaController.getBodegas);
router.get("/:id", BodegaController.getBodegaById);
router.put("/:id", BodegaController.updateBodega);
router.patch("/:id/estado", BodegaController.updateBodegaEstado);
router.get("/:idbodega/productos", BodegaController.getProductosByBodega);

module.exports = router;