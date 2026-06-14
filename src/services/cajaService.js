// src/services/cajaService.js
const { query } = require("../../db");

exports.getTransaccionesCaja = async () => {
  const result = await query(
    `SELECT 
      tc.idtransaccion,
      tc.idestado_caja,
      tc.tipo_movimiento,
      tc.descripcion,
      tc.monto,
      tc.fecha,
      tc.idusuario,
      tc.idventa,
      u.nombres,
      u.apellidos
     FROM transacciones_caja tc
     JOIN usuarios u ON tc.idusuario = u.idusuario
     ORDER BY tc.fecha DESC`
  );
  return result.rows;
};

exports.getTransaccionesCajaByFecha = async (fecha) => {
  const result = await query(
    `SELECT 
      tc.idtransaccion,
      tc.idestado_caja,
      tc.tipo_movimiento,
      tc.descripcion,
      tc.monto,
      tc.fecha,
      tc.idusuario,
      tc.idventa,
      u.nombres,
      u.apellidos
     FROM transacciones_caja tc
     JOIN usuarios u ON tc.idusuario = u.idusuario
     WHERE DATE(tc.fecha) = $1
     ORDER BY tc.fecha DESC`,
    [fecha]
  );
  return result.rows;
};

exports.getTransaccionesCajaByRango = async (fechaInicio, fechaFin) => {
  const result = await query(
    `SELECT 
      tc.idtransaccion,
      tc.idestado_caja,
      tc.tipo_movimiento,
      tc.descripcion,
      tc.monto,
      tc.fecha,
      tc.idusuario,
      tc.idventa,
      u.nombres,
      u.apellidos
     FROM transacciones_caja tc
     JOIN usuarios u ON tc.idusuario = u.idusuario
     WHERE DATE(tc.fecha) BETWEEN $1 AND $2
     ORDER BY tc.fecha DESC`,
    [fechaInicio, fechaFin]
  );
  return result.rows;
};

exports.getTransaccionesCajaByUsuario = async (idusuario) => {
  const result = await query(
    `SELECT 
      tc.idtransaccion,
      tc.idestado_caja,
      tc.tipo_movimiento,
      tc.descripcion,
      tc.monto,
      tc.fecha,
      tc.idusuario,
      tc.idventa,
      u.nombres,
      u.apellidos
     FROM transacciones_caja tc
     JOIN usuarios u ON tc.idusuario = u.idusuario
     WHERE tc.idusuario = $1
     ORDER BY tc.fecha DESC`,
    [idusuario]
  );
  return result.rows;
};

exports.getTransaccionesCajaByUsuarioFecha = async (idusuario, fecha) => {
  const result = await query(
    `SELECT 
      tc.idtransaccion,
      tc.idestado_caja,
      tc.tipo_movimiento,
      tc.descripcion,
      tc.monto,
      tc.fecha,
      tc.idusuario,
      tc.idventa,
      u.nombres,
      u.apellidos
     FROM transacciones_caja tc
     JOIN usuarios u ON tc.idusuario = u.idusuario
     WHERE tc.idusuario = $1 AND DATE(tc.fecha) = $2
     ORDER BY tc.fecha DESC`,
    [idusuario, fecha]
  );
  return result.rows;
};

exports.getTransaccionesCajaByUsuarioRango = async (idusuario, fechaInicio, fechaFin) => {
  const result = await query(
    `SELECT 
      tc.idtransaccion,
      tc.idestado_caja,
      tc.tipo_movimiento,
      tc.descripcion,
      tc.monto,
      tc.fecha,
      tc.idusuario,
      tc.idventa,
      u.nombres,
      u.apellidos
     FROM transacciones_caja tc
     JOIN usuarios u ON tc.idusuario = u.idusuario
     WHERE tc.idusuario = $1 AND DATE(tc.fecha) BETWEEN $2 AND $3
     ORDER BY tc.fecha DESC`,
    [idusuario, fechaInicio, fechaFin]
  );
  return result.rows;
};

exports.getEstadoCajaActual = async () => {
  const result = await query(
    `SELECT 
      idestado_caja,
      estado,
      monto_inicial,
      monto_final,
      idusuario
     FROM estado_caja 
     ORDER BY idestado_caja DESC 
     LIMIT 1`
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0];
};

exports.getSaldoActual = async () => {
  try {
    const result = await query(
      `SELECT 
        estado,
        monto_final
       FROM estado_caja 
       ORDER BY idestado_caja DESC 
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return {
        estado: "cerrada",
        monto_final: "0.00"
      };
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error in getSaldoActual service:", error);
    return {
      estado: "cerrada",
      monto_final: "0.00"
    };
  }
};

exports.getUsuariosCaja = async () => {
  const result = await query(
    `SELECT DISTINCT 
      CONCAT(u.nombres, ' ', u.apellidos) as empleado_nombre
     FROM transacciones_caja tc
     JOIN usuarios u ON tc.idusuario = u.idusuario
     WHERE u.estado = 0
     ORDER BY empleado_nombre`
  );
  return result.rows.map(row => row.empleado_nombre);
};

exports.createTransaccionCaja = async (transaccionData) => {
  const { idestado_caja, tipo_movimiento, descripcion, monto, idusuario, idventa } = transaccionData;
  
  const result = await query(
    `INSERT INTO transacciones_caja 
     (idestado_caja, tipo_movimiento, descripcion, monto, idusuario, idventa, fecha)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     RETURNING *`,
    [idestado_caja, tipo_movimiento, descripcion, monto, idusuario, idventa]
  );
  
  const transaccionCompleta = await query(
    `SELECT 
      tc.idtransaccion,
      tc.idestado_caja,
      tc.tipo_movimiento,
      tc.descripcion,
      tc.monto,
      tc.fecha,
      tc.idusuario,
      tc.idventa,
      u.nombres,
      u.apellidos
     FROM transacciones_caja tc
     JOIN usuarios u ON tc.idusuario = u.idusuario
     WHERE tc.idtransaccion = $1`,
    [result.rows[0].idtransaccion]
  );
  
  return transaccionCompleta.rows[0];
};