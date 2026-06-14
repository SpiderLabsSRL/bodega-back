// src/controllers/cajaController.js
const cajaService = require("../services/cajaService");

exports.getTransaccionesCaja = async (req, res) => {
  try {
    const transacciones = await cajaService.getTransaccionesCaja();
    res.json(transacciones);
  } catch (error) {
    console.error("Error en getTransaccionesCaja:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransaccionesCajaByFecha = async (req, res) => {
  try {
    const { fecha } = req.params;
    const transacciones = await cajaService.getTransaccionesCajaByFecha(fecha);
    res.json(transacciones);
  } catch (error) {
    console.error("Error en getTransaccionesCajaByFecha:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransaccionesCajaByRango = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.params;
    const transacciones = await cajaService.getTransaccionesCajaByRango(fechaInicio, fechaFin);
    res.json(transacciones);
  } catch (error) {
    console.error("Error en getTransaccionesCajaByRango:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransaccionesCajaByUsuario = async (req, res) => {
  try {
    const { idusuario } = req.params;
    const transacciones = await cajaService.getTransaccionesCajaByUsuario(parseInt(idusuario));
    res.json(transacciones);
  } catch (error) {
    console.error("Error en getTransaccionesCajaByUsuario:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransaccionesCajaByUsuarioFecha = async (req, res) => {
  try {
    const { idusuario, fecha } = req.params;
    const transacciones = await cajaService.getTransaccionesCajaByUsuarioFecha(parseInt(idusuario), fecha);
    res.json(transacciones);
  } catch (error) {
    console.error("Error en getTransaccionesCajaByUsuarioFecha:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransaccionesCajaByUsuarioRango = async (req, res) => {
  try {
    const { idusuario, fechaInicio, fechaFin } = req.params;
    const transacciones = await cajaService.getTransaccionesCajaByUsuarioRango(
      parseInt(idusuario), 
      fechaInicio, 
      fechaFin
    );
    res.json(transacciones);
  } catch (error) {
    console.error("Error en getTransaccionesCajaByUsuarioRango:", error);
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
    const saldoActual = await cajaService.getSaldoActual();
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