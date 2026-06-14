const cotizacionesService = require("../services/cotizacionesService");

const cotizacionesController = {
  // Crear cotización
  createCotizacion: async (req, res) => {
    try {
      const {
        vigencia,
        cliente_nombre,
        cliente_telefono,
        cliente_direccion,
        tipo_pago,
        sub_total,
        descuento,
        total,
        abono,
        saldo,
        items
      } = req.body;

      // Validaciones básicas
      if (!cliente_nombre || !tipo_pago || !items || items.length === 0) {
        return res.status(400).json({ 
          error: "Datos incompletos: nombre, tipo_pago e items son requeridos" 
        });
      }

      // Validar tipo de pago
      if (!["Pago por Adelantado", "Mitad de Pago", "Contra Entrega"].includes(tipo_pago)) {
        return res.status(400).json({ 
          error: "Tipo de pago inválido" 
        });
      }

      const cotizacionData = {
        vigencia,
        cliente_nombre,
        cliente_telefono,
        cliente_direccion,
        tipo_pago,
        sub_total,
        descuento,
        total,
        abono,
        saldo,
        items
      };

      const nuevaCotizacion = await cotizacionesService.createCotizacion(cotizacionData);
      res.status(201).json(nuevaCotizacion);
    } catch (error) {
      console.error("Error en createCotizacion:", error);
      res.status(500).json({ 
        error: "Error al crear cotización", 
        details: error.message 
      });
    }
  },

  // Obtener todas las cotizaciones
  getCotizaciones: async (req, res) => {
    try {
      const cotizaciones = await cotizacionesService.getCotizaciones();
      res.json(cotizaciones);
    } catch (error) {
      console.error("Error en getCotizaciones:", error);
      res.status(500).json({ 
        error: "Error al obtener cotizaciones", 
        details: error.message 
      });
    }
  },

  // Obtener cotización por ID
  getCotizacionById: async (req, res) => {
    try {
      const { id } = req.params;
      const cotizacion = await cotizacionesService.getCotizacionById(parseInt(id));
      
      if (!cotizacion) {
        return res.status(404).json({ error: "Cotización no encontrada" });
      }
      
      res.json(cotizacion);
    } catch (error) {
      console.error("Error en getCotizacionById:", error);
      res.status(500).json({ 
        error: "Error al obtener cotización", 
        details: error.message 
      });
    }
  },

  // Actualizar cotización
  updateCotizacion: async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const cotizacionActualizada = await cotizacionesService.updateCotizacion(parseInt(id), updateData);
      
      if (!cotizacionActualizada) {
        return res.status(404).json({ error: "Cotización no encontrada" });
      }
      
      res.json(cotizacionActualizada);
    } catch (error) {
      console.error("Error en updateCotizacion:", error);
      res.status(500).json({ 
        error: "Error al actualizar cotización", 
        details: error.message 
      });
    }
  },

  // Eliminar cotización (soft delete)
  deleteCotizacion: async (req, res) => {
    try {
      const { id } = req.params;
      await cotizacionesService.deleteCotizacion(parseInt(id));
      res.json({ message: "Cotización eliminada correctamente" });
    } catch (error) {
      console.error("Error en deleteCotizacion:", error);
      res.status(500).json({ 
        error: "Error al eliminar cotización", 
        details: error.message 
      });
    }
  },
  searchCotizaciones: async (req, res) => {
  try {
    console.log("🔍 SEARCH COTIZACIONES EJECUTADO");
    console.log("Query recibido:", req.query.q);
    
    const { q } = req.query;
    
    if (!q || q.trim() === "") {
      return res.json([]);
    }
    
    const cotizaciones = await cotizacionesService.searchCotizaciones(q.trim());
    console.log("Resultados encontrados:", cotizaciones.length);
    res.json(cotizaciones);
  } catch (error) {
    console.error("Error en searchCotizaciones controller:", error);
    res.json([]);
  }
  },
};

module.exports = cotizacionesController;