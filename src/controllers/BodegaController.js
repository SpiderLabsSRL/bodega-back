// src/controllers/BodegaController.js
const BodegaService = require("../services/BodegaService");

const BodegaController = {
  // ============================================
  // CONTROLADORES PARA BODEGAS
  // ============================================

  getBodegas: async (req, res) => {
    try {
      const bodegas = await BodegaService.getAllBodegas();
      res.json(bodegas);
    } catch (error) {
      console.error("Error en getBodegas:", error);
      res.status(500).json({ error: error.message });
    }
  },

  getBodegasActivas: async (req, res) => {
    try {
      const bodegas = await BodegaService.getBodegasActivas();
      res.json(bodegas);
    } catch (error) {
      console.error("Error en getBodegasActivas:", error);
      res.status(500).json({ error: error.message });
    }
  },

  getBodegaById: async (req, res) => {
    try {
      const { id } = req.params;
      const bodega = await BodegaService.getBodegaById(id);
      if (!bodega) {
        return res.status(404).json({ error: "Bodega no encontrada" });
      }
      res.json(bodega);
    } catch (error) {
      console.error("Error en getBodegaById:", error);
      res.status(500).json({ error: error.message });
    }
  },

  createBodega: async (req, res) => {
    try {
      const { nombre, tipo, direccion, telefono } = req.body;
      
      if (!tipo || !['Principal', 'Sucursal'].includes(tipo)) {
        return res.status(400).json({ error: "Tipo de bodega inválido. Debe ser 'Principal' o 'Sucursal'" });
      }

      const bodega = await BodegaService.createBodega({
        nombre,
        tipo,
        direccion,
        telefono,
      });
      res.status(201).json(bodega);
    } catch (error) {
      console.error("Error en createBodega:", error);
      res.status(500).json({ error: error.message });
    }
  },

  updateBodega: async (req, res) => {
    try {
      const { id } = req.params;
      const { nombre, tipo, direccion, telefono, estado } = req.body;
      const bodega = await BodegaService.updateBodega(id, {
        nombre,
        tipo,
        direccion,
        telefono,
        estado,
      });
      if (!bodega) {
        return res.status(404).json({ error: "Bodega no encontrada" });
      }
      res.json(bodega);
    } catch (error) {
      console.error("Error en updateBodega:", error);
      res.status(500).json({ error: error.message });
    }
  },

  updateBodegaEstado: async (req, res) => {
    try {
      const { id } = req.params;
      const { estado } = req.body;
      const bodega = await BodegaService.updateBodegaEstado(id, estado);
      if (!bodega) {
        return res.status(404).json({ error: "Bodega no encontrada" });
      }
      res.json(bodega);
    } catch (error) {
      console.error("Error en updateBodegaEstado:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // ============================================
  // CONTROLADORES PARA PRODUCTOS EN BODEGA
  // ============================================

  getProductosByBodega: async (req, res) => {
    try {
      const { idbodega } = req.params;
      const productos = await BodegaService.getProductosByBodega(idbodega);
      res.json(productos);
    } catch (error) {
      console.error("Error en getProductosByBodega:", error);
      res.status(500).json({ error: error.message });
    }
  },

  getAllProductos: async (req, res) => {
    try {
      const productos = await BodegaService.getAllProductos();
      res.json(productos);
    } catch (error) {
      console.error("Error en getAllProductos:", error);
      res.status(500).json({ error: error.message });
    }
  },

  buscarProductos: async (req, res) => {
    try {
      const { termino, idbodega } = req.query;
      if (!termino || termino.trim().length < 2) {
        return res.json([]);
      }
      const productos = await BodegaService.buscarProductos(termino, idbodega);
      res.json(productos);
    } catch (error) {
      console.error("Error en buscarProductos:", error);
      res.status(500).json({ error: error.message });
    }
  },

  getProductoById: async (req, res) => {
    try {
      const { id } = req.params;
      const producto = await BodegaService.getProductoById(id);
      if (!producto) {
        return res.status(404).json({ error: "Producto no encontrado" });
      }
      res.json(producto);
    } catch (error) {
      console.error("Error en getProductoById:", error);
      res.status(500).json({ error: error.message });
    }
  },

  createProducto: async (req, res) => {
    try {
      let categorias = [];
      if (req.body.categorias) {
        try {
          categorias = JSON.parse(req.body.categorias);
        } catch (e) {
          if (Array.isArray(req.body.categorias)) {
            categorias = req.body.categorias;
          } else {
            categorias = [req.body.categorias];
          }
        }
      }

      let productosSimilares = [];
      if (req.body.productos_similares) {
        try {
          productosSimilares = JSON.parse(req.body.productos_similares);
        } catch (e) {
          if (Array.isArray(req.body.productos_similares)) {
            productosSimilares = req.body.productos_similares;
          }
        }
      }

      const productoData = {
        nombre: req.body.nombre,
        descripcion: req.body.descripcion || "",
        idubicacion: parseInt(req.body.idubicacion) || 1,
        categorias: categorias,
        precio_venta: parseFloat(req.body.precio_venta) || 0,
        precio_compra: parseFloat(req.body.precio_compra) || 0,
        stock: parseInt(req.body.stock) || 0,
        stock_minimo: parseInt(req.body.stock_minimo) || 0,
        codigo_barras: req.body.codigo_barras || null,
        idbodega: req.body.idbodega ? parseInt(req.body.idbodega) : 1,
        productos_similares: productosSimilares,
      };

      console.log("Datos recibidos:", productoData);

      let imagenFile = null;
      if (req.file) {
        imagenFile = req.file;
      }

      const producto = await BodegaService.createProducto(productoData, imagenFile);
      res.status(201).json(producto);
    } catch (error) {
      console.error("Error en createProducto:", error);
      res.status(500).json({ error: error.message });
    }
  },

  updateProducto: async (req, res) => {
    try {
      const { id } = req.params;

      let categorias = [];
      if (req.body.categorias) {
        try {
          categorias = JSON.parse(req.body.categorias);
        } catch (e) {
          if (Array.isArray(req.body.categorias)) {
            categorias = req.body.categorias;
          } else {
            categorias = [req.body.categorias];
          }
        }
      }

      let productosSimilares = [];
      if (req.body.productos_similares) {
        try {
          productosSimilares = JSON.parse(req.body.productos_similares);
        } catch (e) {
          if (Array.isArray(req.body.productos_similares)) {
            productosSimilares = req.body.productos_similares;
          }
        }
      }

      const productoData = {
        nombre: req.body.nombre,
        descripcion: req.body.descripcion || "",
        idubicacion: parseInt(req.body.idubicacion) || 1,
        categorias: categorias,
        precio_venta: parseFloat(req.body.precio_venta) || 0,
        precio_compra: parseFloat(req.body.precio_compra) || 0,
        stock: req.body.stock ? parseInt(req.body.stock) : undefined,
        stock_minimo: req.body.stock_minimo ? parseInt(req.body.stock_minimo) : 0,
        codigo_barras: req.body.codigo_barras || null,
        idbodega: req.body.idbodega ? parseInt(req.body.idbodega) : null,
        productos_similares: productosSimilares,
      };

      let imagenFile = null;
      if (req.file) {
        imagenFile = req.file;
      }

      const producto = await BodegaService.updateProducto(parseInt(id), productoData, imagenFile);
      res.json(producto);
    } catch (error) {
      console.error("Error en updateProducto:", error);
      res.status(500).json({ error: error.message });
    }
  },

  deleteProducto: async (req, res) => {
    try {
      const { id } = req.params;
      await BodegaService.deleteProducto(parseInt(id));
      res.status(204).send();
    } catch (error) {
      console.error("Error en deleteProducto:", error);
      res.status(500).json({ error: error.message });
    }
  },

  updateStock: async (req, res) => {
    try {
      const { id } = req.params;
      const { idbodega, cantidad } = req.body;
      const producto = await BodegaService.updateStock(parseInt(id), parseInt(idbodega), cantidad);
      res.json(producto);
    } catch (error) {
      console.error("Error en updateStock:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // ============================================
  // CONTROLADORES PARA TRANSFERENCIAS
  // ============================================

  transferirProducto: async (req, res) => {
    try {
      const { idproducto, idbodegaOrigen, idbodegaDestino, cantidad } = req.body;
      
      const origen = idbodegaOrigen || 1;
      
      const result = await BodegaService.transferirProducto(
        idproducto,
        origen,
        idbodegaDestino,
        cantidad
      );
      res.json(result);
    } catch (error) {
      console.error("Error en transferirProducto:", error);
      res.status(500).json({ error: error.message });
    }
  },

  getMovimientos: async (req, res) => {
    try {
      const { idbodega, limit } = req.query;
      const movimientos = await BodegaService.getMovimientos(idbodega, limit);
      res.json(movimientos);
    } catch (error) {
      console.error("Error en getMovimientos:", error);
      res.status(500).json({ error: error.message });
    }
  },

  // ============================================
  // CONTROLADORES PARA DATOS MAESTROS
  // ============================================

  getUbicaciones: async (req, res) => {
    try {
      const ubicaciones = await BodegaService.getUbicaciones();
      res.json(ubicaciones);
    } catch (error) {
      console.error("Error en getUbicaciones:", error);
      res.status(500).json({ error: error.message });
    }
  },

  getCategorias: async (req, res) => {
    try {
      const categorias = await BodegaService.getCategorias();
      res.json(categorias);
    } catch (error) {
      console.error("Error en getCategorias:", error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = BodegaController;