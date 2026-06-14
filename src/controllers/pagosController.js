const pagosService = require("../services/pagosService");

exports.getPagosPendientes = async (req, res) => {
  try {
    const pagosPendientes = await pagosService.obtenerPagosPendientes();
    res.json(pagosPendientes);
  } catch (error) {
    console.error("Error en getPagosPendientes:", error);
    res.status(500).json({ 
      error: "Error al obtener los pagos pendientes",
      detalles: error.message 
    });
  }
};

exports.procesarPago = async (req, res) => {
  try {
    const { id } = req.params;
    const { monto, metodoPago, idUsuario } = req.body;
    
    await pagosService.procesarPagoCotizacion({
      idcotizacion: parseInt(id),
      monto,
      metodoPago,
      idusuario: idUsuario
    });
    
    res.json({ 
      success: true, 
      message: "Pago procesado correctamente" 
    });
  } catch (error) {
    console.error("Error en procesarPago:", error);
    res.status(500).json({ 
      error: "Error al procesar el pago",
      detalles: error.message 
    });
  }
};

exports.actualizarEntregas = async (req, res) => {
  try {
    const { id } = req.params;
    const { productos, montoPago, metodoPago, idUsuario } = req.body;
    
    await pagosService.actualizarEntregasProductos({
      idcotizacion: parseInt(id),
      productos,
      montoPago: montoPago || 0,
      metodoPago,
      idusuario: idUsuario
    });
    
    res.json({ 
      success: true, 
      message: "Entregas actualizadas correctamente" 
    });
  } catch (error) {
    console.error("Error en actualizarEntregas:", error);
    res.status(500).json({ 
      error: "Error al actualizar las entregas",
      detalles: error.message 
    });
  }
};

exports.marcarComoEntregado = async (req, res) => {
  try {
    const { id } = req.params;
    
    await pagosService.marcarCotizacionEntregada(parseInt(id));
    
    res.json({ 
      success: true, 
      message: "Cotización marcada como entregada" 
    });
  } catch (error) {
    console.error("Error en marcarComoEntregado:", error);
    res.status(500).json({ 
      error: "Error al marcar como entregado",
      detalles: error.message 
    });
  }
};
exports.eliminarCotizacion = async (req, res) => {
    try {
      const { id } = req.params;
      
      await pagosService.eliminarCotizacion(parseInt(id));
      
      res.json({ 
        success: true, 
        message: "Cotización eliminada correctamente" 
      });
    } catch (error) {
      console.error("Error en eliminarCotizacion:", error);
      res.status(500).json({ 
        error: "Error al eliminar la cotización",
        detalles: error.message 
      });
    }
};