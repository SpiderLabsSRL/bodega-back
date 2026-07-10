// src/services/TransferenciaService.js
const { query, pool } = require("../../db");

// Obtener transferencias según el rol del usuario
exports.getTransferencias = async (idusuario, rol) => {
  try {
    let sql = `
      SELECT 
        t.idtransferencia as id,
        t.fecha_solicitud as fecha,
        t.monto,
        t.descripcion,
        t.tipo,
        t.estado,
        t.fecha_resolucion as fecha_aprobacion,
        t.observacion,
        t.idusuario_solicitante,
        t.idusuario_aprobador,
        u_sol.nombres || ' ' || u_sol.apellidos as usuario_origen,
        u_apr.nombres || ' ' || u_apr.apellidos as usuario_aprobador,
        c_origen.nombre as caja_origen,
        c_origen.tipo as tipo_origen
      FROM transferencias_caja t
      JOIN usuarios u_sol ON t.idusuario_solicitante = u_sol.idusuario
      LEFT JOIN usuarios u_apr ON t.idusuario_aprobador = u_apr.idusuario
      JOIN caja c_origen ON t.idcaja_origen = c_origen.idcaja
      WHERE 1=1
    `;

    const params = [];

    if (rol === 'asistente') {
      sql += ` AND t.idusuario_solicitante = $1`;
      params.push(idusuario);
    }

    sql += ` ORDER BY 
      CASE WHEN t.estado = 'pendiente' THEN 0 ELSE 1 END,
      t.fecha_solicitud DESC
    `;

    const result = await query(sql, params);
    return result.rows;
  } catch (error) {
    console.error("Error en getTransferencias:", error);
    throw error;
  }
};

// Crear una transferencia (siempre pendiente)
exports.crearTransferencia = async (data) => {
  const { 
    idcaja_origen, 
    monto, 
    tipo, 
    descripcion, 
    idusuario_solicitante
  } = data;

  const client = await pool.connect();
  
  try {
    await client.query("BEGIN");

    // Verificar que la caja origen existe
    const cajaOrigen = await client.query(
      `SELECT idcaja, total, estado_caja, tipo, idbodega FROM caja WHERE idcaja = $1`,
      [idcaja_origen]
    );

    if (cajaOrigen.rows.length === 0) {
      throw new Error("La caja de origen no existe");
    }

    // Verificar que el monto no exceda el saldo de origen
    const saldoOrigen = parseFloat(cajaOrigen.rows[0].total);
    if (saldoOrigen < parseFloat(monto)) {
      throw new Error(`Saldo insuficiente en caja de origen. Saldo disponible: ${saldoOrigen}`);
    }

    // Insertar la transferencia (siempre pendiente)
    const transferenciaResult = await client.query(
      `INSERT INTO transferencias_caja 
       (idcaja_origen, monto, tipo, descripcion, estado, idusuario_solicitante) 
       VALUES ($1, $2, $3, $4, 'pendiente', $5)
       RETURNING idtransferencia`,
      [idcaja_origen, monto, tipo, descripcion, idusuario_solicitante]
    );

    const idtransferencia = transferenciaResult.rows[0].idtransferencia;

    await client.query("COMMIT");
    
    return { 
      idtransferencia, 
      estado: 'pendiente',
      mensaje: 'Transferencia registrada, pendiente de aprobación'
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Aprobar transferencia - SOLO EGRESO DE CAJA ORIGEN
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
      `SELECT idcaja, total, estado_caja FROM caja WHERE idcaja = $1`,
      [data.idcaja_origen]
    );

    if (cajaOrigen.rows.length === 0) {
      throw new Error("Caja de origen no encontrada");
    }

    const saldoOrigen = parseFloat(cajaOrigen.rows[0].total);
    if (saldoOrigen < parseFloat(data.monto)) {
      throw new Error(`Saldo insuficiente en caja de origen. Saldo disponible: ${saldoOrigen}`);
    }

    await client.query(
      `UPDATE transferencias_caja 
       SET estado = 'aprobada', 
           fecha_resolucion = TIMEZONE('America/La_Paz', NOW()), 
           idusuario_aprobador = $1
       WHERE idtransferencia = $2`,
      [idusuario_aprobador, idtransferencia]
    );

    // EGRESO EN CAJA ORIGEN
    const nuevoSaldoOrigen = saldoOrigen - parseFloat(data.monto);
    
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
        nuevoSaldoOrigen,
        idtransferencia
      ]
    );

    await client.query(
      `UPDATE caja SET total = $1 WHERE idcaja = $2`,
      [nuevoSaldoOrigen, data.idcaja_origen]
    );

    await client.query("COMMIT");
    
    return { 
      idtransferencia, 
      estado: 'aprobada',
      mensaje: 'Transferencia aprobada correctamente',
      saldo_anterior: saldoOrigen,
      saldo_actual: nuevoSaldoOrigen,
      monto_egresado: data.monto
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Observar transferencia - NO AFECTA A LA CAJA
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

// Rechazar transferencia - NO AFECTA A LA CAJA
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

// Obtener transferencia por ID
exports.getTransferenciaById = async (idtransferencia) => {
  try {
    const result = await query(
      `SELECT 
        t.idtransferencia as id,
        t.fecha_solicitud as fecha,
        t.monto,
        t.descripcion,
        t.tipo,
        t.estado,
        t.fecha_resolucion as fecha_aprobacion,
        t.observacion,
        t.idusuario_solicitante,
        t.idusuario_aprobador,
        u_sol.nombres || ' ' || u_sol.apellidos as usuario_origen,
        u_apr.nombres || ' ' || u_apr.apellidos as usuario_aprobador,
        c_origen.nombre as caja_origen,
        c_origen.tipo as tipo_origen,
        c_origen.idbodega
      FROM transferencias_caja t
      JOIN usuarios u_sol ON t.idusuario_solicitante = u_sol.idusuario
      LEFT JOIN usuarios u_apr ON t.idusuario_aprobador = u_apr.idusuario
      JOIN caja c_origen ON t.idcaja_origen = c_origen.idcaja
      WHERE t.idtransferencia = $1`,
      [idtransferencia]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error("Error en getTransferenciaById:", error);
    throw error;
  }
};

// Obtener transferencias pendientes
exports.getTransferenciasPendientes = async () => {
  try {
    const result = await query(
      `SELECT 
        t.idtransferencia as id,
        t.fecha_solicitud as fecha,
        t.monto,
        t.descripcion,
        t.tipo,
        t.estado,
        t.fecha_resolucion as fecha_aprobacion,
        t.observacion,
        t.idusuario_solicitante,
        t.idusuario_aprobador,
        u_sol.nombres || ' ' || u_sol.apellidos as usuario_origen,
        u_apr.nombres || ' ' || u_apr.apellidos as usuario_aprobador,
        c_origen.nombre as caja_origen,
        c_origen.tipo as tipo_origen
      FROM transferencias_caja t
      JOIN usuarios u_sol ON t.idusuario_solicitante = u_sol.idusuario
      LEFT JOIN usuarios u_apr ON t.idusuario_aprobador = u_apr.idusuario
      JOIN caja c_origen ON t.idcaja_origen = c_origen.idcaja
      WHERE t.estado = 'pendiente'
      ORDER BY t.fecha_solicitud DESC`
    );
    return result.rows;
  } catch (error) {
    console.error("Error en getTransferenciasPendientes:", error);
    throw error;
  }
};

// Obtener transferencias de un usuario
exports.getTransferenciasByUsuario = async (idusuario) => {
  try {
    const result = await query(
      `SELECT 
        t.idtransferencia as id,
        t.fecha_solicitud as fecha,
        t.monto,
        t.descripcion,
        t.tipo,
        t.estado,
        t.fecha_resolucion as fecha_aprobacion,
        t.observacion,
        t.idusuario_solicitante,
        t.idusuario_aprobador,
        u_sol.nombres || ' ' || u_sol.apellidos as usuario_origen,
        u_apr.nombres || ' ' || u_apr.apellidos as usuario_aprobador,
        c_origen.nombre as caja_origen,
        c_origen.tipo as tipo_origen
      FROM transferencias_caja t
      JOIN usuarios u_sol ON t.idusuario_solicitante = u_sol.idusuario
      LEFT JOIN usuarios u_apr ON t.idusuario_aprobador = u_apr.idusuario
      JOIN caja c_origen ON t.idcaja_origen = c_origen.idcaja
      WHERE t.idusuario_solicitante = $1
      ORDER BY t.fecha_solicitud DESC`,
      [idusuario]
    );
    return result.rows;
  } catch (error) {
    console.error("Error en getTransferenciasByUsuario:", error);
    throw error;
  }
};

// Contar transferencias pendientes
exports.countTransferenciasPendientes = async () => {
  try {
    const result = await query(
      `SELECT COUNT(*) as total FROM transferencias_caja WHERE estado = 'pendiente'`
    );
    return parseInt(result.rows[0].total) || 0;
  } catch (error) {
    console.error("Error en countTransferenciasPendientes:", error);
    return 0;
  }
};