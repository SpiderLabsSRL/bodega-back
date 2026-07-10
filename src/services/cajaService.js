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
      c.tipo AS tipo_caja,
      c.idcaja
     FROM movimiento_caja mc
     JOIN usuarios u ON mc.idusuario = u.idusuario
     JOIN caja c ON mc.idcaja = c.idcaja
     ${whereClause}
     ORDER BY mc.fecha DESC`,
    values
  );
  return result.rows;
};

exports.getSaldoActual = async (params = {}) => {
  try {
    const { idbodega, tipoCaja } = params;
    
    let sql = `SELECT total FROM caja WHERE 1=1`;
    const values = [];
    let paramIndex = 1;

    if (idbodega) {
      sql += ` AND idbodega = $${paramIndex}`;
      values.push(idbodega);
      paramIndex++;
    }

    if (tipoCaja) {
      sql += ` AND tipo = $${paramIndex}`;
      values.push(tipoCaja);
      paramIndex++;
    }

    sql += ` ORDER BY idcaja DESC LIMIT 1`;

    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return {
        estado: "cerrada",
        monto_final: "0.00"
      };
    }

    return {
      estado: "abierta",
      monto_final: result.rows[0].total.toString()
    };
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
      mc.idusuario as idusuario,
      CONCAT(u.nombres, ' ', u.apellidos) as empleado_nombre
     FROM movimiento_caja mc
     JOIN usuarios u ON mc.idusuario = u.idusuario
     WHERE u.estado = 0
     ORDER BY empleado_nombre`
  );
  return result.rows;
};

exports.getUsuariosAdmin = async () => {
  const result = await query(
    `SELECT DISTINCT 
      mc.idusuario as id,
      CONCAT(u.nombres, ' ', u.apellidos) as nombre,
      u.usuario
     FROM movimiento_caja mc
     JOIN usuarios u ON mc.idusuario = u.idusuario
     WHERE u.estado = 0 AND u.rol = 'Admin'
     ORDER BY nombre`
  );
  return result.rows;
};

exports.createTransaccionCaja = async (transaccionData) => {
  const { idcaja, tipo_movimiento, descripcion, monto, idusuario, idventa } = transaccionData;
  
  // Obtener monto actual de la caja
  const cajaActual = await query(
    `SELECT total FROM caja WHERE idcaja = $1`,
    [idcaja]
  );

  const montoAnterior = cajaActual.rows.length > 0 ? parseFloat(cajaActual.rows[0].total) : 0;
  let montoActual = montoAnterior;

  if (tipo_movimiento === 'ingreso' || tipo_movimiento === 'apertura') {
    montoActual = montoAnterior + parseFloat(monto);
  } else if (tipo_movimiento === 'egreso' || tipo_movimiento === 'cierre') {
    montoActual = montoAnterior - parseFloat(monto);
  }

  // Insertar movimiento
  const result = await query(
    `INSERT INTO movimiento_caja 
     (idcaja, idusuario, monto, tipo, descripcion, monto_anterior, monto_actual, idventa) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING idmovimiento_caja`,
    [idcaja, idusuario, monto, tipo_movimiento, descripcion, montoAnterior, montoActual, idventa || null]
  );
  
  // Actualizar total de la caja
  await query(
    `UPDATE caja SET total = $1 WHERE idcaja = $2`,
    [montoActual, idcaja]
  );

  // Obtener la transacción completa
  const transaccionCompleta = await query(
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
      c.tipo as tipo_caja,
      c.idcaja
     FROM movimiento_caja mc
     JOIN usuarios u ON mc.idusuario = u.idusuario
     JOIN caja c ON mc.idcaja = c.idcaja
     WHERE mc.idmovimiento_caja = $1`,
    [result.rows[0].idmovimiento_caja]
  );
  
  return transaccionCompleta.rows[0];
};