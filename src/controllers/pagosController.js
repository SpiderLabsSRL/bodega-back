const pagosService = require("../services/pagosService");

exports.getPagosPendientes = async (req, res) => {
  try {
    console.log("🔍 Headers recibidos:", req.headers.authorization);
    
    const usuario = req.user;
    
    console.log("👤 Usuario en req.user:", JSON.stringify(usuario, null, 2));
    
    if (!usuario) {
      console.error("❌ Usuario no encontrado en req.user");
      return res.status(401).json({ 
        error: "Usuario no autenticado" 
      });
    }

    const idusuario = usuario.id;
    const rol = usuario.rol;
    const idbodega = usuario.idbodega;

    console.log("👤 Usuario autenticado - ID:", idusuario, "Rol:", rol, "Bodega:", idbodega);

    if (!idusuario) {
      console.error("❌ No se pudo obtener el ID del usuario");
      return res.status(400).json({ 
        error: "ID de usuario no encontrado" 
      });
    }

    // Para Asistente: validar que tenga bodega asignada
    if (rol !== 'Admin' && !idbodega) {
      console.error("❌ Usuario no-admin sin bodega asignada");
      return res.status(400).json({ 
        error: "Usuario no tiene bodega asignada" 
      });
    }

    const pagosPendientes = await pagosService.obtenerPagosPendientes(
      idusuario,
      idbodega,
      rol
    );
    
    res.json(pagosPendientes);
  } catch (error) {
    console.error("❌ Error en getPagosPendientes:", error);
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
    
    console.log("💳 Procesando pago - Cotización:", id, "Usuario:", idUsuario);
    
    // Obtener el usuario autenticado para validar su bodega
    const usuario = req.user;
    const idbodegaUsuario = usuario.idbodega;
    const rol = usuario.rol;
    
    console.log("👤 Usuario autenticado - ID:", idUsuario, "Rol:", rol, "Bodega:", idbodegaUsuario);
    
    await pagosService.procesarPagoCotizacion({
      idcotizacion: parseInt(id),
      monto,
      metodoPago,
      idusuario: idUsuario,
      idbodegaUsuario: idbodegaUsuario,
      rol: rol
    });
    
    res.json({ 
      success: true, 
      message: "Pago procesado correctamente" 
    });
  } catch (error) {
    console.error("❌ Error en procesarPago:", error);
    if (error.message.includes("caja está cerrada") || error.message.includes("No tiene permisos")) {
      res.status(400).json({ 
        error: error.message 
      });
    } else {
      res.status(500).json({ 
        error: "Error al procesar el pago",
        detalles: error.message 
      });
    }
  }
};

exports.actualizarEntregas = async (req, res) => {
  try {
    const { id } = req.params;
    const { productos, montoPago, metodoPago, idUsuario } = req.body;
    
    console.log("📦 Actualizando entregas - Cotización:", id, "Usuario:", idUsuario);
    
    // Obtener el usuario autenticado para validar su bodega
    const usuario = req.user;
    const idbodegaUsuario = usuario.idbodega;
    const rol = usuario.rol;
    
    console.log("👤 Usuario autenticado - ID:", idUsuario, "Rol:", rol, "Bodega:", idbodegaUsuario);
    
    await pagosService.actualizarEntregasProductos({
      idcotizacion: parseInt(id),
      productos,
      montoPago: montoPago || 0,
      metodoPago,
      idusuario: idUsuario,
      idbodegaUsuario: idbodegaUsuario,
      rol: rol
    });
    
    res.json({ 
      success: true, 
      message: "Entregas actualizadas correctamente" 
    });
  } catch (error) {
    console.error("❌ Error en actualizarEntregas:", error);
    if (error.message.includes("caja está cerrada") || error.message.includes("No tiene permisos")) {
      res.status(400).json({ 
        error: error.message 
      });
    } else {
      res.status(500).json({ 
        error: "Error al actualizar las entregas",
        detalles: error.message 
      });
    }
  }
};

exports.marcarComoEntregado = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log("✅ Marcando como entregado - Cotización:", id);
    
    // Obtener el usuario autenticado para validar su bodega
    const usuario = req.user;
    const idbodegaUsuario = usuario.idbodega;
    const rol = usuario.rol;
    
    await pagosService.marcarCotizacionEntregada(parseInt(id), idbodegaUsuario, rol);
    
    res.json({ 
      success: true, 
      message: "Cotización marcada como entregada" 
    });
  } catch (error) {
    console.error("❌ Error en marcarComoEntregado:", error);
    if (error.message.includes("No tiene permisos")) {
      res.status(400).json({ 
        error: error.message 
      });
    } else {
      res.status(500).json({ 
        error: "Error al marcar como entregado",
        detalles: error.message 
      });
    }
  }
};

exports.eliminarCotizacion = async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log("🗑️ Eliminando cotización - ID:", id);
    
    // Obtener el usuario autenticado para validar su bodega
    const usuario = req.user;
    const idbodegaUsuario = usuario.idbodega;
    const rol = usuario.rol;
    
    await pagosService.eliminarCotizacion(parseInt(id), idbodegaUsuario, rol);
    
    res.json({ 
      success: true, 
      message: "Cotización eliminada correctamente" 
    });
  } catch (error) {
    console.error("❌ Error en eliminarCotizacion:", error);
    if (error.message.includes("No tiene permisos")) {
      res.status(400).json({ 
        error: error.message 
      });
    } else {
      res.status(500).json({ 
        error: "Error al eliminar la cotización",
        detalles: error.message 
      });
    }
  }
};