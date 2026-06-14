const express = require("express");
const router = express.Router();
const multer = require('multer');
const FormularioProductoController = require("../controllers/FormularioProductoController");

const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB límite para archivos
        fieldSize: 10 * 1024 * 1024, // 10MB límite para campos de texto
        fieldNameSize: 1000, // Tamaño máximo del nombre del campo
    }
});

// Rutas específicas para formulario de productos
router.post("/formulario-productos/productos", upload.single('imagen'), FormularioProductoController.createProducto);
router.put("/formulario-productos/productos/:id", upload.single('imagen'), FormularioProductoController.updateProducto);
router.get("/formulario-productos/productos/:id", FormularioProductoController.getProductoById);
router.patch("/formulario-productos/productos/:id/eliminar", FormularioProductoController.deleteProducto);

module.exports = router;