// src/controllers/cajaController.js
const cajaService = require("../services/cajaService");

exports.getTransaccionesCaja = async (req, res) => {
  try {
    const { idusuario, fecha, fechaInicio, fechaFin, tipoCaja, idbodega } = req.query;
    const filtros = {
      idusuario: idusuario ? Number(idusuario) : undefined,
      fecha,
      fechaInicio,
      fechaFin,
      tipoCaja,
      idbodega: idbodega ? Number(idbodega) : undefined,
    };
    const transacciones = await cajaService.getTransaccionesCaja(filtros);
    res.json(transacciones);
  } catch (error) {
    console.error("Error en getTransaccionesCaja:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getSaldoActual = async (req, res) => {
  try {
    const { idbodega, tipoCaja } = req.query;
    const saldoActual = await cajaService.getSaldoActual({ idbodega, tipoCaja });
    res.json(saldoActual);
  } catch (error) {
    console.error("Error en getSaldoActual:", error);
    res.json({
      estado: "cerrada",
      monto_final: "0.00",
      idcaja: null
    });
  }
};

exports.getUsuariosCaja = async (req, res) => {
  try {
    const usuarios = await cajaService.getUsuariosCaja();
    res.json(usuarios);
  } catch (error) {
    console.error("Error en getUsuariosCaja:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getUsuariosAdmin = async (req, res) => {
  try {
    const usuarios = await cajaService.getUsuariosAdmin();
    res.json(usuarios);
  } catch (error) {
    console.error("Error en getUsuariosAdmin:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.createTransaccionCaja = async (req, res) => {
  try {
    const transaccionData = req.body;
    
    const userId = transaccionData.idusuario || req.headers["user-id"];
    if (!userId) {
      return res.status(401).json({ error: "Se requiere ID de usuario" });
    }

    const { 
      tipoCaja, 
      tipoMovimiento, 
      monto, 
      descripcion, 
      usuarioTransferencia,
      idbodega 
    } = transaccionData;

    if (!tipoCaja || !tipoMovimiento) {
      return res.status(400).json({ error: "Tipo de caja y tipo de movimiento son requeridos" });
    }

    if (!idbodega) {
      return res.status(400).json({ error: "ID de bodega es requerido" });
    }

    // Obtener o crear la caja
    const caja = await cajaService.getOrCreateCaja(idbodega, tipoCaja);
    if (!caja) {
      return res.status(404).json({ error: "No se pudo obtener la caja" });
    }

    let resultado;

    switch (tipoMovimiento) {
      case 'Apertura':
        if (monto === undefined || monto === null || parseFloat(monto) < 0) {
          return res.status(400).json({ error: "El monto inicial es requerido para apertura y debe ser mayor o igual a 0" });
        }
        resultado = await cajaService.abrirCaja(
          caja.idcaja,
          userId,
          parseFloat(monto),
          descripcion || `Apertura de caja ${tipoCaja}`
        );
        break;

      case 'Cierre':
        const montoCierre = monto ? parseFloat(monto) : null;
        resultado = await cajaService.cerrarCaja(
          caja.idcaja,
          userId,
          montoCierre,
          descripcion || `Cierre de caja ${tipoCaja}`
        );
        break;

      case 'Ingreso':
        if (!monto || parseFloat(monto) <= 0) {
          return res.status(400).json({ error: "El monto es requerido para ingreso y debe ser mayor a 0" });
        }
        if (!descripcion) {
          return res.status(400).json({ error: "La descripción es requerida para ingreso" });
        }
        resultado = await cajaService.registrarMovimientoCaja(
          caja.idcaja,
          userId,
          parseFloat(monto),
          'ingreso',
          descripcion
        );
        break;

      case 'Egreso':
        if (!monto || parseFloat(monto) <= 0) {
          return res.status(400).json({ error: "El monto es requerido para egreso y debe ser mayor a 0" });
        }
        if (!descripcion) {
          return res.status(400).json({ error: "La descripción es requerida para egreso" });
        }
        resultado = await cajaService.registrarMovimientoCaja(
          caja.idcaja,
          userId,
          parseFloat(monto),
          'egreso',
          descripcion
        );
        break;

      case 'Transferencia':
        if (!monto || parseFloat(monto) <= 0) {
          return res.status(400).json({ error: "El monto es requerido para transferencia y debe ser mayor a 0" });
        }
        if (!descripcion) {
          return res.status(400).json({ error: "La descripción es requerida para transferencia" });
        }
        if (!usuarioTransferencia) {
          return res.status(400).json({ error: "El usuario destino es requerido para transferencia" });
        }

        resultado = await cajaService.crearTransferencia({
          idcaja_origen: caja.idcaja,
          monto: parseFloat(monto),
          tipo: tipoCaja,
          descripcion: descripcion,
          idusuario_solicitante: userId,
          idusuario_aprobador: null
        });
        break;

      default:
        return res.status(400).json({ error: `Tipo de movimiento no soportado: ${tipoMovimiento}` });
    }

    res.status(201).json(resultado);
  } catch (error) {
    console.error("Error en createTransaccionCaja:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransferenciasPendientes = async (req, res) => {
  try {
    const transferencias = await cajaService.getTransferenciasPendientes();
    res.json(transferencias);
  } catch (error) {
    console.error("Error en getTransferenciasPendientes:", error);
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

    const resultado = await cajaService.aprobarTransferencia(idtransferencia, idusuario_aprobador);
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

    const resultado = await cajaService.observarTransferencia(
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

    const resultado = await cajaService.rechazarTransferencia(
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

exports.getCajaInfo = async (req, res) => {
  try {
    const { idcaja } = req.params;
    const caja = await cajaService.getCajaInfo(idcaja);
    if (!caja) {
      return res.status(404).json({ error: "Caja no encontrada" });
    }
    res.json(caja);
  } catch (error) {
    console.error("Error en getCajaInfo:", error);
    res.status(500).json({ error: error.message });
  }
};