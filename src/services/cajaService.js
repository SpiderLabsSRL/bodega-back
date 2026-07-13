// src/services/cajaService.js
const { query, pool } = require("../../db");

exports.getTransaccionesCaja = async (filtros = {}) => {
  const { idusuario, fecha, fechaInicio, fechaFin, tipoCaja, idbodega } = filtros;

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

  if (idbodega) {
    condiciones.push(`c.idbodega = $${paramIndex}`);
    values.push(idbodega);
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
      mc.idtransferencia,
      u.nombres,
      u.apellidos,
      c.tipo AS tipo_caja,
      c.idcaja,
      c.idbodega,
      b.nombre as bodega_nombre,
      c.estado_caja
     FROM movimiento_caja mc
     JOIN usuarios u ON mc.idusuario = u.idusuario
     JOIN caja c ON mc.idcaja = c.idcaja
     LEFT JOIN bodegas b ON c.idbodega = b.idbodega
     ${whereClause}
     ORDER BY mc.fecha DESC`,
    values
  );
  return result.rows;
};

exports.getSaldoActual = async (params = {}) => {
  try {
    const { idbodega, tipoCaja } = params;
    
    let sql = `SELECT idcaja, total, estado_caja FROM caja WHERE 1=1`;
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
        monto_final: "0.00",
        idcaja: null
      };
    }

    return {
      estado: result.rows[0].estado_caja || "cerrada",
      monto_final: result.rows[0].total.toString(),
      idcaja: result.rows[0].idcaja
    };
  } catch (error) {
    console.error("Error in getSaldoActual service:", error);
    return {
      estado: "cerrada",
      monto_final: "0.00",
      idcaja: null
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
    `SELECT 
      u.idusuario as id,
      CONCAT(u.nombres, ' ', u.apellidos) as nombre,
      u.usuario
     FROM usuarios u
     WHERE u.estado = 0 AND u.rol = 'Admin'
     ORDER BY nombre`
  );
  return result.rows;
};

exports.getOrCreateCaja = async (idbodega, tipo) => {
  const cajaResult = await query(
    `SELECT idcaja, total, estado_caja FROM caja 
     WHERE idbodega = $1 AND tipo = $2`,
    [idbodega, tipo]
  );

  if (cajaResult.rows.length > 0) {
    return cajaResult.rows[0];
  }

  const nombre = tipo === 'Efectivo' ? 'Caja Efectivo' : 'Caja QR';
  const newCaja = await query(
    `INSERT INTO caja (nombre, tipo, estado_caja, total, idbodega) 
     VALUES ($1, $2, 'cerrada', 0, $3) 
     RETURNING idcaja, total, estado_caja`,
    [nombre, tipo, idbodega]
  );

  return newCaja.rows[0];
};

exports.registrarMovimientoCaja = async (idcaja, idusuario, monto, tipo, descripcion, idventa = null, idtransferencia = null) => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");

    const cajaActual = await client.query(
      `SELECT total FROM caja WHERE idcaja = $1`,
      [idcaja]
    );

    const montoAnterior = cajaActual.rows.length > 0 ? parseFloat(cajaActual.rows[0].total) : 0;
    let montoActual = montoAnterior;

    if (tipo === 'ingreso') {
      montoActual = montoAnterior + parseFloat(monto);
    } else if (tipo === 'egreso') {
      montoActual = montoAnterior - parseFloat(monto);
    }

    const result = await client.query(
      `INSERT INTO movimiento_caja 
       (idcaja, idusuario, monto, tipo, descripcion, monto_anterior, monto_actual, idventa, idtransferencia) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING idmovimiento_caja`,
      [idcaja, idusuario, monto, tipo, descripcion, montoAnterior, montoActual, idventa, idtransferencia]
    );

    await client.query(
      `UPDATE caja SET total = $1 WHERE idcaja = $2`,
      [montoActual, idcaja]
    );

    await client.query("COMMIT");
    
    return { 
      idmovimiento: result.rows[0].idmovimiento_caja, 
      montoAnterior, 
      montoActual 
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

exports.abrirCaja = async (idcaja, idusuario, montoInicial, descripcion = 'Apertura de caja') => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");

    const caja = await client.query(
      `SELECT idcaja, total, estado_caja FROM caja WHERE idcaja = $1`,
      [idcaja]
    );

    if (caja.rows.length === 0) {
      throw new Error("Caja no encontrada");
    }

    if (caja.rows[0].estado_caja === 'abierta') {
      throw new Error("La caja ya está abierta");
    }

    const saldoActual = parseFloat(caja.rows[0].total) || 0;
    const montoApertura = parseFloat(montoInicial) || 0;
    const diferencia = montoApertura - saldoActual;

    // Registrar apertura (NO se suma a los ingresos del día)
    await client.query(
      `INSERT INTO movimiento_caja 
       (idcaja, idusuario, monto, tipo, descripcion, monto_anterior, monto_actual) 
       VALUES ($1, $2, $3, 'apertura', $4, $5, $6)`,
      [idcaja, idusuario, montoApertura, descripcion, saldoActual, montoApertura]
    );

    if (diferencia !== 0) {
      const tipoAjuste = diferencia > 0 ? 'ingreso' : 'egreso';
      const montoAjuste = Math.abs(diferencia);
      const descripcionAjuste = diferencia > 0 
        ? `Ajuste por apertura: saldo anterior Bs ${saldoActual.toFixed(2)} → Bs ${montoApertura.toFixed(2)} (ingreso de Bs ${montoAjuste.toFixed(2)})`
        : `Ajuste por apertura: saldo anterior Bs ${saldoActual.toFixed(2)} → Bs ${montoApertura.toFixed(2)} (egreso de Bs ${montoAjuste.toFixed(2)})`;

      await client.query(
        `INSERT INTO movimiento_caja 
         (idcaja, idusuario, monto, tipo, descripcion, monto_anterior, monto_actual) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [idcaja, idusuario, montoAjuste, tipoAjuste, descripcionAjuste, saldoActual, montoApertura]
      );
    }

    await client.query(
      `UPDATE caja SET estado_caja = 'abierta', total = $1 WHERE idcaja = $2`,
      [montoApertura, idcaja]
    );

    await client.query("COMMIT");
    
    return { 
      mensaje: "Caja abierta correctamente",
      saldo_anterior: saldoActual,
      monto_apertura: montoApertura,
      diferencia: diferencia,
      ajuste: diferencia !== 0 ? (diferencia > 0 ? 'ingreso' : 'egreso') : 'ninguno',
      monto_ajuste: Math.abs(diferencia)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

exports.cerrarCaja = async (idcaja, idusuario, montoCierre = null, descripcion = 'Cierre de caja') => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");

    const caja = await client.query(
      `SELECT idcaja, total, estado_caja FROM caja WHERE idcaja = $1`,
      [idcaja]
    );

    if (caja.rows.length === 0) {
      throw new Error("Caja no encontrada");
    }

    if (caja.rows[0].estado_caja !== 'abierta') {
      throw new Error("La caja no está abierta");
    }

    const saldoActual = parseFloat(caja.rows[0].total) || 0;
    const montoFinal = montoCierre !== null ? parseFloat(montoCierre) : saldoActual;
    const diferencia = montoFinal - saldoActual;

    // Registrar cierre (NO se resta de los egresos del día)
    await client.query(
      `INSERT INTO movimiento_caja 
       (idcaja, idusuario, monto, tipo, descripcion, monto_anterior, monto_actual) 
       VALUES ($1, $2, $3, 'cierre', $4, $5, $6)`,
      [idcaja, idusuario, montoFinal, descripcion, saldoActual, montoFinal]
    );

    if (diferencia !== 0) {
      const tipoAjuste = diferencia > 0 ? 'ingreso' : 'egreso';
      const montoAjuste = Math.abs(diferencia);
      const descripcionAjuste = diferencia > 0 
        ? `Ajuste por cierre: saldo anterior Bs ${saldoActual.toFixed(2)} → Bs ${montoFinal.toFixed(2)} (ingreso de Bs ${montoAjuste.toFixed(2)})`
        : `Ajuste por cierre: saldo anterior Bs ${saldoActual.toFixed(2)} → Bs ${montoFinal.toFixed(2)} (egreso de Bs ${montoAjuste.toFixed(2)})`;

      await client.query(
        `INSERT INTO movimiento_caja 
         (idcaja, idusuario, monto, tipo, descripcion, monto_anterior, monto_actual) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [idcaja, idusuario, montoAjuste, tipoAjuste, descripcionAjuste, saldoActual, montoFinal]
      );
    }

    await client.query(
      `UPDATE caja SET estado_caja = 'cerrada', total = $1 WHERE idcaja = $2`,
      [montoFinal, idcaja]
    );

    await client.query("COMMIT");
    
    return { 
      mensaje: "Caja cerrada correctamente",
      saldo_anterior: saldoActual,
      monto_cierre: montoFinal,
      diferencia: diferencia,
      ajuste: diferencia !== 0 ? (diferencia > 0 ? 'ingreso' : 'egreso') : 'ninguno',
      monto_ajuste: Math.abs(diferencia)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

exports.crearTransferencia = async (data) => {
  const { 
    idcaja_origen, 
    monto, 
    tipo, 
    descripcion, 
    idusuario_solicitante,
    idusuario_aprobador = null
  } = data;

  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");

    const cajaOrigen = await client.query(
      `SELECT idcaja, total, estado_caja, tipo, idbodega FROM caja WHERE idcaja = $1`,
      [idcaja_origen]
    );

    if (cajaOrigen.rows.length === 0) {
      throw new Error("La caja de origen no existe");
    }

    const saldoOrigen = parseFloat(cajaOrigen.rows[0].total);
    if (saldoOrigen < parseFloat(monto)) {
      throw new Error(`Saldo insuficiente en caja de origen. Saldo disponible: ${saldoOrigen}`);
    }

    // Insertar la transferencia
    const transferenciaResult = await client.query(
      `INSERT INTO transferencias_caja 
       (idcaja_origen, monto, tipo, descripcion, estado, idusuario_solicitante) 
       VALUES ($1, $2, $3, $4, 'pendiente', $5)
       RETURNING idtransferencia`,
      [idcaja_origen, monto, tipo, descripcion, idusuario_solicitante]
    );

    const idtransferencia = transferenciaResult.rows[0].idtransferencia;

    // Si es Admin, aprobar automáticamente
    const usuarioSolicitante = await client.query(
      `SELECT rol FROM usuarios WHERE idusuario = $1`,
      [idusuario_solicitante]
    );

    if (usuarioSolicitante.rows.length > 0 && usuarioSolicitante.rows[0].rol === 'Admin') {
      // Aprobar la transferencia
      await client.query(
        `UPDATE transferencias_caja 
         SET estado = 'aprobada', fecha_resolucion = TIMEZONE('America/La_Paz', NOW())
         WHERE idtransferencia = $1`,
        [idtransferencia]
      );

      // Registrar egreso en caja origen
      const nuevoSaldo = saldoOrigen - parseFloat(monto);
      
      await client.query(
        `INSERT INTO movimiento_caja 
         (idcaja, idusuario, monto, tipo, descripcion, monto_anterior, monto_actual, idtransferencia) 
         VALUES ($1, $2, $3, 'egreso', $4, $5, $6, $7)`,
        [
          idcaja_origen, 
          idusuario_solicitante, 
          monto, 
          `Transferencia aprobada - ${descripcion}`,
          saldoOrigen,
          nuevoSaldo,
          idtransferencia
        ]
      );

      await client.query(
        `UPDATE caja SET total = $1 WHERE idcaja = $2`,
        [nuevoSaldo, idcaja_origen]
      );

      await client.query("COMMIT");
      
      return { 
        idtransferencia, 
        estado: 'aprobada',
        mensaje: 'Transferencia aprobada automáticamente'
      };
    }

    await client.query("COMMIT");
    
    return { 
      idtransferencia, 
      estado: 'pendiente',
      mensaje: 'Transferencia pendiente de aprobación'
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

exports.aprobarTransferencia = async (idtransferencia, idusuario_aprobador) => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");

    const transferencia = await client.query(
      `SELECT * FROM transferencias_caja WHERE idtransferencia = $1 AND estado = 'pendiente'`,
      [idtransferencia]
    );

    if (transferencia.rows.length === 0) {
      throw new Error("Transferencia no encontrada o ya procesada");
    }

    const data = transferencia.rows[0];

    const cajaOrigen = await client.query(
      `SELECT idcaja, total FROM caja WHERE idcaja = $1`,
      [data.idcaja_origen]
    );

    if (cajaOrigen.rows.length === 0) {
      throw new Error("Caja de origen no encontrada");
    }

    const saldoOrigen = parseFloat(cajaOrigen.rows[0].total);
    if (saldoOrigen < parseFloat(data.monto)) {
      throw new Error(`Saldo insuficiente en caja de origen. Saldo disponible: ${saldoOrigen}`);
    }

    // Aprobar la transferencia
    await client.query(
      `UPDATE transferencias_caja 
       SET estado = 'aprobada', fecha_resolucion = TIMEZONE('America/La_Paz', NOW()), idusuario_aprobador = $1
       WHERE idtransferencia = $2`,
      [idusuario_aprobador, idtransferencia]
    );

    // Registrar egreso en caja origen
    const nuevoSaldo = saldoOrigen - parseFloat(data.monto);
    
    await client.query(
      `INSERT INTO movimiento_caja 
       (idcaja, idusuario, monto, tipo, descripcion, monto_anterior, monto_actual, idtransferencia) 
       VALUES ($1, $2, $3, 'egreso', $4, $5, $6, $7)`,
      [
        data.idcaja_origen, 
        data.idusuario_solicitante, 
        data.monto, 
        `Transferencia aprobada - ${data.descripcion}`,
        saldoOrigen,
        nuevoSaldo,
        idtransferencia
      ]
    );

    await client.query(
      `UPDATE caja SET total = $1 WHERE idcaja = $2`,
      [nuevoSaldo, data.idcaja_origen]
    );

    await client.query("COMMIT");
    
    return { 
      idtransferencia, 
      estado: 'aprobada',
      mensaje: 'Transferencia aprobada correctamente',
      saldo_anterior: saldoOrigen,
      saldo_actual: nuevoSaldo,
      monto_egresado: data.monto
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

exports.observarTransferencia = async (idtransferencia, idusuario_aprobador, observacion) => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");

    const transferencia = await client.query(
      `SELECT * FROM transferencias_caja WHERE idtransferencia = $1 AND estado = 'pendiente'`,
      [idtransferencia]
    );

    if (transferencia.rows.length === 0) {
      throw new Error("Transferencia no encontrada o ya procesada");
    }

    await client.query(
      `UPDATE transferencias_caja 
       SET estado = 'observada', 
           fecha_resolucion = TIMEZONE('America/La_Paz', NOW()), 
           idusuario_aprobador = $1,
           observacion = $2
       WHERE idtransferencia = $3`,
      [idusuario_aprobador, observacion, idtransferencia]
    );

    await client.query("COMMIT");
    
    return { 
      idtransferencia, 
      estado: 'observada',
      mensaje: 'Transferencia marcada como observada'
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

exports.rechazarTransferencia = async (idtransferencia, idusuario_aprobador, motivo) => {
  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");

    const transferencia = await client.query(
      `SELECT * FROM transferencias_caja WHERE idtransferencia = $1 AND estado = 'pendiente'`,
      [idtransferencia]
    );

    if (transferencia.rows.length === 0) {
      throw new Error("Transferencia no encontrada o ya procesada");
    }

    await client.query(
      `UPDATE transferencias_caja 
       SET estado = 'observada', 
           fecha_resolucion = TIMEZONE('America/La_Paz', NOW()), 
           idusuario_aprobador = $1,
           observacion = $2
       WHERE idtransferencia = $3`,
      [idusuario_aprobador, motivo || 'Transferencia rechazada', idtransferencia]
    );

    await client.query("COMMIT");
    
    return { 
      idtransferencia, 
      estado: 'observada',
      mensaje: 'Transferencia rechazada correctamente'
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

exports.getTransferenciasPendientes = async () => {
  const result = await query(
    `SELECT 
      t.*,
      u_sol.nombres as solicitante_nombre,
      u_sol.apellidos as solicitante_apellidos,
      c_origen.tipo as caja_origen_tipo,
      c_origen.nombre as caja_origen_nombre
     FROM transferencias_caja t
     JOIN usuarios u_sol ON t.idusuario_solicitante = u_sol.idusuario
     JOIN caja c_origen ON t.idcaja_origen = c_origen.idcaja
     WHERE t.estado = 'pendiente'
     ORDER BY t.fecha_solicitud DESC`
  );
  return result.rows;
};

exports.getCajaInfo = async (idcaja) => {
  const result = await query(
    `SELECT idcaja, nombre, tipo, estado_caja, total, idbodega 
     FROM caja 
     WHERE idcaja = $1`,
    [idcaja]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
};

exports.getEstadoCaja = async (idcaja) => {
  const result = await query(
    `SELECT estado_caja FROM caja WHERE idcaja = $1`,
    [idcaja]
  );
  return result.rows.length > 0 ? result.rows[0].estado_caja : 'cerrada';
};