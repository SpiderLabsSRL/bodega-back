const FormularioProductoService = require("../services/FormularioProductoService");

class FormularioProductoController {
    async createProducto (req, res) {
        try {
        const productoData = {
            nombre: req.body.nombre,
            descripcion: req.body.descripcion,
            idubicacion: parseInt(req.body.idubicacion),
            categorias: JSON.parse(req.body.categorias || '[]'),
            precio_compra: parseFloat(req.body.precio_compra),
            precio_venta: parseFloat(req.body.precio_venta),
            stock: parseInt(req.body.stock)
        };

        let imagenFile = null;
        if (req.file) {
            imagenFile = req.file;
        } else if (req.files && req.files.imagen) {
            imagenFile = req.files.imagen;
        }

        const producto = await FormularioProductoService.createProducto(productoData, imagenFile);
        res.status(201).json(producto);
        } catch (error) {
        console.error("Error creating producto:", error);
        res.status(500).json({ error: error.message });
        }
    }

    async updateProducto (req, res) {
        try {
        const { id } = req.params;
        
        const productoData = {
            nombre: req.body.nombre,
            descripcion: req.body.descripcion,
            idubicacion: parseInt(req.body.idubicacion),
            categorias: JSON.parse(req.body.categorias || '[]'),
            precio_compra: parseFloat(req.body.precio_compra),
            precio_venta: parseFloat(req.body.precio_venta),
            stock: parseInt(req.body.stock),
            stock_minimo: parseInt(req.body.stock_minimo || 0) 
        };

        let imagenFile = null;
        if (req.file) {
            imagenFile = req.file;
        } else if (req.files && req.files.imagen) {
            imagenFile = req.files.imagen;
        }

        const producto = await FormularioProductoService.updateProducto(parseInt(id), productoData, imagenFile);
        res.json(producto);
        } catch (error) {
        console.error("Error updating producto:", error);
        res.status(500).json({ error: error.message });
        }
    }

    async getProductoById(req, res) {
        try {
            const { id } = req.params;
            console.log("Obteniendo producto ID:", id);
            
            const producto = await FormularioProductoService.getProductoById(parseInt(id));
            
            if (!producto) {
                return res.status(404).json({
                    success: false,
                    message: "Producto no encontrado"
                });
            }
            
            res.json({
                success: true,
                data: producto
            });
        } catch (error) {
            console.error("Error en getProductoById controller:", error);
            res.status(500).json({
                success: false,
                message: error.message || "Error interno del servidor"
            });
        }
    }

    async deleteProducto(req, res) {
        try {
            const { id } = req.params;
            console.log("Eliminando producto ID:", id);
            
            await FormularioProductoService.deleteProducto(parseInt(id));
            
            res.json({
                success: true,
                message: "Producto eliminado exitosamente"
            });
        } catch (error) {
            console.error("Error en deleteProducto controller:", error);
            res.status(500).json({
                success: false,
                message: error.message || "Error interno del servidor"
            });
        }
    }
}

module.exports = new FormularioProductoController();