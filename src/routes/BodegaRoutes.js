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

router.get("/todas", BodegaController.getTodasBodegas);
router.get("/activas", BodegaController.getBodegasActivas);
router.get("/productos/todos", BodegaController.getAllProductos);
router.get("/buscar", BodegaController.buscarProductos);

// Crear una nueva bodega (sucursal)
router.post("/", BodegaController.createBodega);

// ============================================
// RUTAS PARA UBICACIONES
// ============================================
router.get("/ubicaciones", BodegaController.getUbicaciones);
router.post("/ubicaciones", BodegaController.createUbicacion);
router.put("/ubicaciones/:id", BodegaController.updateUbicacion);
router.delete("/ubicaciones/:id", BodegaController.deleteUbicacion);

// ============================================
// RUTAS PARA CATEGORÍAS
// ============================================
router.get("/categorias", BodegaController.getCategorias);
router.post("/categorias", BodegaController.createCategoria);
router.put("/categorias/:id", BodegaController.updateCategoria);
router.delete("/categorias/:id", BodegaController.deleteCategoria);

// ============================================
// RUTAS PARA PRODUCTOS
// ============================================
router.post(
  "/productos",
  upload.single("imagen"),
  BodegaController.createProducto
);

router.put(
  "/productos/:id",
  upload.single("imagen"),
  BodegaController.updateProducto
);

router.get("/productos/:id", BodegaController.getProductoById);
router.delete("/productos/:id", BodegaController.deleteProducto);
router.patch("/productos/:id/stock", BodegaController.updateStock);

// ============================================
// RUTAS PARA PRODUCTO_UBICACION_BODEGA
// ============================================
router.get(
  "/productos/:idproducto/bodega/:idbodega/ubicaciones",
  BodegaController.getUbicacionesByProductoBodega
);
router.post(
  "/productos/ubicacion",
  BodegaController.asignarUbicacionProductoBodega
);
router.delete(
  "/productos/:idproducto/bodega/:idbodega/ubicacion/:idubicacion",
  BodegaController.eliminarUbicacionProductoBodega
);

// Transferir producto a otra bodega
router.post("/transferir", BodegaController.transferirProducto);

// ============================================
// RUTAS CON PARÁMETROS DINÁMICOS (DEBEN IR AL FINAL)
// ============================================

router.get("/", BodegaController.getBodegas);
router.get("/:id", BodegaController.getBodegaById);
router.put("/:id", BodegaController.updateBodega);
router.patch("/:id/estado", BodegaController.updateBodegaEstado);
router.get("/:idbodega/productos", BodegaController.getProductosByBodega);

module.exports = router;