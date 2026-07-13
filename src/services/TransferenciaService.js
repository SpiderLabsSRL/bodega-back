// src/services/TransferenciaService.js
const { query, pool } = require("../../db");

// Obtener transferencias según el rol del usuario
exports.getTransferencias = async (filtros) => {
  try {
    const { idusuario, fecha, fechaInicio, fechaFin } = filtros;

    const condiciones = [];
    const values = [];
    let paramIndex = 1;

    if (idusuario) {
      condiciones.push(`t.idusuario_solicitante = $${paramIndex}`);
      values.push(idusuario);
      paramIndex++;
    }

    if (fechaInicio && fechaFin) {
      condiciones.push(`DATE(t.fecha_solicitud) BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
      values.push(fechaInicio, fechaFin);
      paramIndex += 2;
    } else if (fecha) {
      condiciones.push(`DATE(t.fecha_solicitud) = $${paramIndex}`);
      values.push(fecha);
      paramIndex++;
    }

    const whereClause = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

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
        c_origen.tipo as tipo_origen,
        c_origen.idbodega as bodega_origen
      FROM transferencias_caja t
      JOIN usuarios u_sol ON t.idusuario_solicitante = u_sol.idusuario
      LEFT JOIN usuarios u_apr ON t.idusuario_aprobador = u_apr.idusuario
      JOIN caja c_origen ON t.idcaja_origen = c_origen.idcaja
      ${whereClause}
      ORDER BY 
        CASE WHEN t.estado = 'pendiente' THEN 0 ELSE 1 END,
        t.fecha_solicitud DESC
    `;

    const result = await query(sql, values);
    return result.rows;
  } catch (error) {
    console.error("Error en getTransferencias:", error);
    throw error;
  }
};

// Función para obtener o crear caja (tanto Efectivo como QR)
const getOrCreateCaja = async (client, idbodega, tipo) => {
  const cajaResult = await client.query(
    `SELECT idcaja, total, estado_caja FROM caja 
     WHERE idbodega = $1 AND tipo = $2`,
    [idbodega, tipo]
  );

  if (cajaResult.rows.length > 0) {
    return cajaResult.rows[0];
  }

  const nombre = tipo === 'Efectivo' ? 'Caja Efectivo' : 'Caja QR';
  const newCaja = await client.query(
    `INSERT INTO caja (nombre, tipo, estado_caja, total, idbodega) 
     VALUES ($1, $2, 'cerrada', 0, $3) 
     RETURNING idcaja, total, estado_caja`,
    [nombre, tipo, idbodega]
  );

  return newCaja.rows[0];
};

// Verificar caja abierta - SOLO para Efectivo (QR no se verifica)
const verificarCajaAbierta = async (client, idcaja, tipo) => {
  // QR no tiene estado de apertura/cierre, siempre se permite
  if (tipo === 'QR') {
    return true;
  }
  
  // Solo Efectivo verifica estado
  const result = await client.query(
    `SELECT estado_caja FROM caja WHERE idcaja = $1`,
    [idcaja]
  );
  
  if (result.rows.length === 0) {
    throw new Error("No se encontró la caja");
  }
  
  if (result.rows[0].estado_caja !== 'abierta') {
    throw new Error("La caja de Efectivo está cerrada. No se pueden realizar transferencias.");
  }
  
  return true;
};

// Crear una transferencia - DESCUENTA DE LA CAJA DEL ASISTENTE (EGRESO)
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

    const tipoCaja = cajaOrigen.rows[0].tipo;
    const saldoOrigen = parseFloat(cajaOrigen.rows[0].total);
    const montoTransferencia = parseFloat(monto);

    // Verificar que la caja esté abierta (SOLO para Efectivo)
    await verificarCajaAbierta(client, idcaja_origen, tipoCaja);

    // Verificar que haya saldo suficiente
    if (saldoOrigen < montoTransferencia) {
      throw new Error(`Saldo insuficiente en caja de origen. Saldo disponible: ${saldoOrigen}`);
    }

    // 1. Insertar la transferencia con estado 'pendiente'
    const transferenciaResult = await client.query(
      `INSERT INTO transferencias_caja 
       (idcaja_origen, monto, tipo, descripcion, estado, idusuario_solicitante) 
       VALUES ($1, $2, $3, $4, 'pendiente', $5)
       RETURNING idtransferencia`,
      [idcaja_origen, montoTransferencia, tipo, descripcion, idusuario_solicitante]
    );

    const idtransferencia = transferenciaResult.rows[0].idtransferencia;

    // 2. DESCONTAR DE LA CAJA DEL ASISTENTE (EGRESO)
    const nuevoSaldo = saldoOrigen - montoTransferencia;

    const movimientoResult = await client.query(
      `INSERT INTO movimiento_caja 
       (idcaja, idusuario, monto, tipo, descripcion, monto_anterior, monto_actual, idtransferencia) 
       VALUES ($1, $2, $3, 'egreso', $4, $5, $6, $7)
       RETURNING idmovimiento_caja`,
      [
        idcaja_origen, 
        idusuario_solicitante, 
        montoTransferencia, 
        `Transferencia pendiente - ${descripcion}`,
        saldoOrigen,
        nuevoSaldo,
        idtransferencia
      ]
    );

    // Actualizar saldo de la caja
    await client.query(
      `UPDATE caja SET total = $1 WHERE idcaja = $2`,
      [nuevoSaldo, idcaja_origen]
    );

    await client.query("COMMIT");
    
    return { 
      idtransferencia, 
      estado: 'pendiente',
      mensaje: `Transferencia registrada. Se descontó de la caja ${tipo} del asistente. Pendiente de aprobación.`,
      saldo_anterior: saldoOrigen,
      saldo_actual: nuevoSaldo,
      monto_descontado: montoTransferencia,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Aprobar transferencia - INGRESO A LA CAJA DEL ADMINISTRADOR
exports.aprobarTransferencia = async (idtransferencia, idusuario_aprobador, idbodega_admin) => {
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
    const montoTransferencia = parseFloat(data.monto);
    const tipo = data.tipo; // 'Efectivo' o 'QR'

    // Actualizar estado de la transferencia a 'aprobada'
    await client.query(
      `UPDATE transferencias_caja 
       SET estado = 'aprobada', 
           fecha_resolucion = TIMEZONE('America/La_Paz', NOW()), 
           idusuario_aprobador = $1
       WHERE idtransferencia = $2`,
      [idusuario_aprobador, idtransferencia]
    );

    // Actualizar la descripción del movimiento de egreso (caja del asistente)
    await client.query(
      `UPDATE movimiento_caja 
       SET descripcion = $1 
       WHERE idtransferencia = $2`,
      [`Transferencia APROBADA - ${data.descripcion}`, data.idtransferencia]
    );

    // ============================================
    // INGRESO A LA CAJA DEL ADMINISTRADOR
    // ============================================
    console.log(`💰 Sumando transferencia a la caja del Admin - Bodega: ${idbodega_admin}, Tipo: ${tipo}, Monto: ${montoTransferencia}`);

    // Obtener o crear la caja del administrador en su bodega
    const cajaAdmin = await getOrCreateCaja(client, idbodega_admin, tipo);
    console.log(`📦 Caja Admin encontrada/creada:`, cajaAdmin);

    // Obtener saldo actual de la caja del admin
    const cajaAdminActual = await client.query(
      `SELECT total FROM caja WHERE idcaja = $1`,
      [cajaAdmin.idcaja]
    );
    const saldoAdminActual = cajaAdminActual.rows.length > 0 ? parseFloat(cajaAdminActual.rows[0].total) : 0;
    const nuevoSaldoAdmin = saldoAdminActual + montoTransferencia;

    // Registrar INGRESO en la caja del administrador
    await client.query(
      `INSERT INTO movimiento_caja 
       (idcaja, idusuario, monto, tipo, descripcion, monto_anterior, monto_actual, idtransferencia) 
       VALUES ($1, $2, $3, 'ingreso', $4, $5, $6, $7)`,
      [
        cajaAdmin.idcaja, 
        idusuario_aprobador, 
        montoTransferencia, 
        `Transferencia APROBADA - ${data.descripcion}`,
        saldoAdminActual,
        nuevoSaldoAdmin,
        idtransferencia
      ]
    );

    // Actualizar saldo de la caja del administrador
    await client.query(
      `UPDATE caja SET total = $1 WHERE idcaja = $2`,
      [nuevoSaldoAdmin, cajaAdmin.idcaja]
    );

    console.log(`✅ Transferencia sumada a la caja del Admin. Nuevo saldo de caja ${tipo}: +${montoTransferencia}`);

    await client.query("COMMIT");
    
    return { 
      idtransferencia, 
      estado: 'aprobada',
      mensaje: `Transferencia aprobada correctamente. Se sumó a la caja ${tipo} del administrador.`,
      monto: montoTransferencia,
      caja_admin: cajaAdmin.idcaja,
      bodega_admin: idbodega_admin,
      tipo: tipo,
      saldo_admin_anterior: saldoAdminActual,
      saldo_admin_actual: nuevoSaldoAdmin
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// OBSERVAR transferencia - ANULAR EGRESO Y DEVOLVER DINERO A LA CAJA DEL ASISTENTE (INGRESO)
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

    const data = transferencia.rows[0];
    const montoTransferencia = parseFloat(data.monto);
    const tipo = data.tipo;

    // Actualizar estado de la transferencia a 'observada'
    await client.query(
      `UPDATE transferencias_caja 
       SET estado = 'observada', 
           fecha_resolucion = TIMEZONE('America/La_Paz', NOW()), 
           idusuario_aprobador = $1,
           observacion = $2
       WHERE idtransferencia = $3`,
      [idusuario_aprobador, observacion || 'Transferencia observada', idtransferencia]
    );

    const result = await client.query(
      `UPDATE caja SET total = total + $1 WHERE idcaja = $2 RETURNING total`,
      [montoTransferencia, data.idcaja_origen]
    );

    const nuevoTotal = result.rows[0].total;

    // Cambiar el movimiento de egreso a ingreso (reversión)
    await client.query(
      `UPDATE movimiento_caja 
       SET tipo = 'ingreso',
           descripcion = $1,
           monto_actual = $2
       WHERE idtransferencia = $3`,
      [
        `Transferencia OBSERVADA - Reversión - Motivo: ${observacion || 'Sin motivo'}`,
        nuevoTotal,
        data.idtransferencia
      ]
    );

    await client.query("COMMIT");
    
    return { 
      idtransferencia, 
      estado: 'observada',
      mensaje: `Transferencia observada. Se anuló el egreso y se devolvió el dinero a la caja ${tipo} del asistente.`,
      saldo_restaurado: nuevoTotal,
      monto_revertido: montoTransferencia,
      observacion: observacion
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Rechazar transferencia (alias de observar) - ANULAR EGRESO Y DEVOLVER DINERO A LA CAJA DEL ASISTENTE
exports.rechazarTransferencia = async (idtransferencia, idusuario_aprobador, motivo) => {
  return exports.observarTransferencia(idtransferencia, idusuario_aprobador, motivo);
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
        c_origen.idbodega as bodega_origen
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
        c_origen.tipo as tipo_origen,
        c_origen.idbodega as bodega_origen
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
        c_origen.tipo as tipo_origen,
        c_origen.idbodega as bodega_origen
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