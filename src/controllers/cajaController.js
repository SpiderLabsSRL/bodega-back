// src/controllers/cajaController.js
const cajaService = require("../services/cajaService");

exports.getTransaccionesCaja = async (req, res) => {
  try {
    const { idusuario, fecha, fechaInicio, fechaFin, tipoCaja } = req.query;
    const filtros = {
      idusuario: idusuario ? Number(idusuario) : undefined,
      fecha,
      fechaInicio,
      fechaFin,
      tipoCaja,
    };
    const transacciones = await cajaService.getTransaccionesCaja(filtros);
    res.json(transacciones);
  } catch (error) {
    console.error("Error en getTransaccionesCaja:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getEstadoCajaActual = async (req, res) => {
  try {
    const estadoCaja = await cajaService.getEstadoCajaActual();
    res.json(estadoCaja);
  } catch (error) {
    console.error("Error en getEstadoCajaActual:", error);
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
      monto_final: "0.00"
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
    console.error("Error en getUsuariosCaja:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.createTransaccionCaja = async (req, res) => {
  try {
    const transaccionData = req.body;
    const nuevaTransaccion = await cajaService.createTransaccionCaja(transaccionData);
    res.status(201).json(nuevaTransaccion);
  } catch (error) {
    console.error("Error en createTransaccionCaja:", error);
    res.status(500).json({ error: error.message });
  }
};