// src/services/cajaService.js
const { query } = require("../../db");

exports.getTransaccionesCaja = async (filtros = {}) => {
  const { idusuario, fecha, fechaInicio, fechaFin, tipoCaja } = filtros;

  const condiciones = [];
  const values = [];
  let paramIndex = 1;

  if (idusuario) {
    condiciones.push(`mc.idusuario = $${paramIndex}`);
    values.push(idusuario);
    paramIndex++;
  }

  if (fechaInicio && fechaFin) {
    condiciones.push(`DATE(mc.fecha) BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
    values.push(fechaInicio, fechaFin);
    paramIndex += 2;
  } else if (fecha) {
    condiciones.push(`DATE(mc.fecha) = $${paramIndex}`);
    values.push(fecha);
    paramIndex++;
  }

  if (tipoCaja) {
    condiciones.push(`c.tipo = $${paramIndex}`);
    values.push(tipoCaja);
    paramIndex++;
  }

  const whereClause = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

  const result = await query(
    `SELECT 
      mc.idmovimiento_caja as idtransaccion,
      mc.tipo as tipo_movimiento,
      mc.descripcion,
      mc.monto,
      mc.fecha,
      mc.idusuario,
      mc.idventa,
      u.nombres,
      u.apellidos,
      c.tipo AS tipo_caja
     FROM movimiento_caja mc
     JOIN usuarios u ON mc.idusuario = u.idusuario
     JOIN caja c ON mc.idcaja = c.idcaja
     ${whereClause}
     ORDER BY mc.fecha DESC`,
    values
  );
  return result.rows;
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
      tc.idusuario as idusuario,
      CONCAT(u.nombres, ' ', u.apellidos) as empleado_nombre
     FROM movimiento_caja tc
     JOIN usuarios u ON tc.idusuario = u.idusuario
     WHERE u.estado = 0
     ORDER BY empleado_nombre`
  );
  return result.rows;
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