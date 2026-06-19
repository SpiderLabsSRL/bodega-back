// src/controllers/productsController.js
const productsService = require("../services/productsService");

const productsController = {
  // Obtener opciones de selección - FILTRADO POR BODEGA
  getUbicaciones: async (req, res) => {
    try {
      const { bodega } = req.query;
      const ubicaciones = await productsService.getUbicaciones(bodega);
      res.json(ubicaciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  getCategorias: async (req, res) => {
    try {
      const categorias = await productsService.getCategorias();
      res.json(categorias);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener solo id y nombre para selects - FILTRADO POR BODEGA
  getTodosProductosSelect: async (req, res) => {
    try {
      const { bodega } = req.query;
      const productos = await productsService.getTodosProductosSelect(bodega);
      res.json(productos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // CRUD de productos - MODIFICADO para búsqueda con filtro de bodega
  getProductos: async (req, res) => {
    try {
      const { termino, bodega } = req.query;
      let productos;

      if (termino && termino.trim().length >= 2) {
        productos = await productsService.buscarProductos(termino, bodega);
      } else {
        productos = [];
      }

      res.json(productos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener todos los productos - FILTRADO POR BODEGA
  getTodosProductos: async (req, res) => {
    try {
      const { bodega } = req.query;
      const productos = await productsService.getTodosProductos(bodega);
      res.json(productos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Búsqueda específica - FILTRADO POR BODEGA
  buscarProductos: async (req, res) => {
    try {
      const { termino, bodega } = req.query;
      if (!termino || termino.trim().length < 2) {
        return res.json([]);
      }

      const productos = await productsService.buscarProductos(termino, bodega);
      res.json(productos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  getProductoById: async (req, res) => {
    try {
      const { id } = req.params;
      const { bodega } = req.query;
      const producto = await productsService.getProductoById(parseInt(id), bodega);
      res.json(producto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  createProducto: async (req, res) => {
    try {
      const productoData = {
        nombre: req.body.nombre,
        descripcion: req.body.descripcion,
        idubicacion: parseInt(req.body.idubicacion),
        categorias: JSON.parse(req.body.categorias || "[]"),
        precio_compra: parseFloat(req.body.precio_compra || 0),
        precio_venta: parseFloat(req.body.precio_venta || 0),
        stock: parseInt(req.body.stock || 0),
        stock_minimo: parseInt(req.body.stock_minimo || 0),
        codigo_barras: req.body.codigo_barras || null,
        productos_similares: JSON.parse(req.body.productos_similares || "[]"),
        idbodega: req.body.idbodega ? parseInt(req.body.idbodega) : null,
      };

      let imagenFile = null;
      if (req.file) {
        imagenFile = req.file;
      } else if (req.files && req.files.imagen) {
        imagenFile = req.files.imagen;
      }

      const producto = await productsService.createProducto(
        productoData,
        imagenFile,
      );
      res.status(201).json(producto);
    } catch (error) {
      console.error("Error creating producto:", error);
      res.status(500).json({ error: error.message });
    }
  },

  updateProducto: async (req, res) => {
    try {
      const { id } = req.params;

      const productoData = {
        nombre: req.body.nombre,
        descripcion: req.body.descripcion,
        idubicacion: parseInt(req.body.idubicacion),
        categorias: JSON.parse(req.body.categorias || "[]"),
        precio_compra: parseFloat(req.body.precio_compra || 0),
        precio_venta: parseFloat(req.body.precio_venta || 0),
        stock: parseInt(req.body.stock || 0),
        stock_minimo: parseInt(req.body.stock_minimo || 0),
        codigo_barras: req.body.codigo_barras || null,
        productos_similares: JSON.parse(req.body.productos_similares || "[]"),
        idbodega: req.body.idbodega ? parseInt(req.body.idbodega) : null,
      };

      let imagenFile = null;
      if (req.file) {
        imagenFile = req.file;
      } else if (req.files && req.files.imagen) {
        imagenFile = req.files.imagen;
      }

      const producto = await productsService.updateProducto(
        parseInt(id),
        productoData,
        imagenFile,
      );
      res.json(producto);
    } catch (error) {
      console.error("Error updating producto:", error);
      res.status(500).json({ error: error.message });
    }
  },

  deleteProducto: async (req, res) => {
    try {
      const { id } = req.params;
      await productsService.deleteProducto(parseInt(id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  updateStockProducto: async (req, res) => {
    try {
      const { id } = req.params;
      const { cantidad } = req.body;
      const { bodega } = req.query;
      
      const producto = await productsService.updateStockProducto(
        parseInt(id),
        cantidad,
        bodega,
      );
      res.json(producto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = productsController;