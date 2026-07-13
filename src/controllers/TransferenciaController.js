// src/controllers/TransferenciaController.js
const transferenciaService = require("../services/TransferenciaService");
const { query } = require("../../db");

// Función auxiliar para obtener la bodega de un usuario
const getBodegaByUsuario = async (idusuario) => {
  try {
    const result = await query(
      `SELECT idbodega FROM usuarios WHERE idusuario = $1`,
      [idusuario]
    );
    return result.rows.length > 0 ? result.rows[0].idbodega : null;
  } catch (error) {
    console.error("Error en getBodegaByUsuario:", error);
    return null;
  }
};

exports.getTransferencias = async (req, res) => {
  try {
    const { idusuario, fecha, fechaInicio, fechaFin } = req.query;
    const filtros = {
      idusuario,
      fecha,
      fechaInicio,
      fechaFin,
    };

    const transferencias = await transferenciaService.getTransferencias(filtros);
    res.json(transferencias);
  } catch (error) {
    console.error("Error en getTransferencias:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.crearTransferencia = async (req, res) => {
  try {
    const data = req.body;
    
    const userId = data.idusuario_solicitante || req.headers["user-id"];
    if (!userId) {
      return res.status(401).json({ error: "Se requiere ID de usuario" });
    }

    const { idcaja_origen, monto, tipo, descripcion } = data;

    if (!idcaja_origen) {
      return res.status(400).json({ error: "La caja de origen es requerida" });
    }

    if (!monto || parseFloat(monto) <= 0) {
      return res.status(400).json({ error: "El monto debe ser mayor a 0" });
    }

    if (!tipo) {
      return res.status(400).json({ error: "El tipo de transferencia es requerido" });
    }

    if (tipo !== 'Efectivo' && tipo !== 'QR') {
      return res.status(400).json({ error: "El tipo debe ser 'Efectivo' o 'QR'" });
    }

    if (!descripcion) {
      return res.status(400).json({ error: "La descripción es requerida" });
    }

    const resultado = await transferenciaService.crearTransferencia({
      idcaja_origen,
      monto: parseFloat(monto),
      tipo,
      descripcion,
      idusuario_solicitante: userId
    });

    res.status(201).json(resultado);
  } catch (error) {
    console.error("Error en crearTransferencia:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.aprobarTransferencia = async (req, res) => {
  try {
    const { idtransferencia } = req.params;
    const idusuario_aprobador = req.body.idusuario_aprobador || req.headers["user-id"];

    if (!idusuario_aprobador) {
      return res.status(401).json({ error: "Se requiere ID de usuario aprobador" });
    }

    // Obtener la bodega del administrador que está aprobando
    const idbodega_admin = await getBodegaByUsuario(idusuario_aprobador);
    
    if (!idbodega_admin) {
      return res.status(400).json({ error: "El administrador no tiene una bodega asignada" });
    }

    const resultado = await transferenciaService.aprobarTransferencia(
      idtransferencia, 
      idusuario_aprobador,
      idbodega_admin  // Pasamos la bodega del admin
    );
    res.json(resultado);
  } catch (error) {
    console.error("Error en aprobarTransferencia:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.observarTransferencia = async (req, res) => {
  try {
    const { idtransferencia } = req.params;
    const { observacion } = req.body;
    const idusuario_aprobador = req.body.idusuario_aprobador || req.headers["user-id"];

    if (!idusuario_aprobador) {
      return res.status(401).json({ error: "Se requiere ID de usuario aprobador" });
    }

    if (!observacion) {
      return res.status(400).json({ error: "La observación es requerida" });
    }

    const resultado = await transferenciaService.observarTransferencia(
      idtransferencia,
      idusuario_aprobador,
      observacion
    );
    res.json(resultado);
  } catch (error) {
    console.error("Error en observarTransferencia:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.rechazarTransferencia = async (req, res) => {
  try {
    const { idtransferencia } = req.params;
    const { motivo } = req.body;
    const idusuario_aprobador = req.body.idusuario_aprobador || req.headers["user-id"];

    if (!idusuario_aprobador) {
      return res.status(401).json({ error: "Se requiere ID de usuario aprobador" });
    }

    if (!motivo) {
      return res.status(400).json({ error: "El motivo del rechazo es requerido" });
    }

    const resultado = await transferenciaService.rechazarTransferencia(
      idtransferencia,
      idusuario_aprobador,
      motivo
    );
    res.json(resultado);
  } catch (error) {
    console.error("Error en rechazarTransferencia:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransferenciaById = async (req, res) => {
  try {
    const { idtransferencia } = req.params;
    const transferencia = await transferenciaService.getTransferenciaById(idtransferencia);
    
    if (!transferencia) {
      return res.status(404).json({ error: "Transferencia no encontrada" });
    }
    
    res.json(transferencia);
  } catch (error) {
    console.error("Error en getTransferenciaById:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransferenciasPendientes = async (req, res) => {
  try {
    const transferencias = await transferenciaService.getTransferenciasPendientes();
    res.json(transferencias);
  } catch (error) {
    console.error("Error en getTransferenciasPendientes:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransferenciasByUsuario = async (req, res) => {
  try {
    const { idusuario } = req.params;
    
    if (!idusuario) {
      return res.status(400).json({ error: "Se requiere ID de usuario" });
    }

    const transferencias = await transferenciaService.getTransferenciasByUsuario(idusuario);
    res.json(transferencias);
  } catch (error) {
    console.error("Error en getTransferenciasByUsuario:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.countTransferenciasPendientes = async (req, res) => {
  try {
    const total = await transferenciaService.countTransferenciasPendientes();
    res.json({ total });
  } catch (error) {
    console.error("Error en countTransferenciasPendientes:", error);
    res.status(500).json({ error: error.message });
  }
};