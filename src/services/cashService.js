// src/services/cashService.js
const { query, pool } = require("../../db");

exports.getCashStatus = async (userId) => {
  try {
    // MODIFICADO: Obtener el último estado de caja sin importar el usuario
    const result = await query(
      `
      SELECT 
        ec.estado,
        ec.monto_final
      FROM estado_caja ec
      ORDER BY ec.idestado_caja DESC
      LIMIT 1
      `
    );

    if (result.rows.length === 0) {
      return {
        estado: "cerrada",
        monto_final: "0.00"
      };
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error in getCashStatus service:", error);
    return {
      estado: "cerrada",
      monto_final: "0.00"
    };
  }
};

exports.getUserTransactions = async (userId) => {
  try {
    // Mantener solo transacciones de hoy para el usuario actual
    const result = await query(
      `
      SELECT 
        tc.idtransaccion,
        tc.tipo_movimiento,
        tc.descripcion,
        tc.monto,
        tc.fecha,
        tc.idusuario,
        CONCAT(u.nombres, ' ', u.apellidos) as nombre_usuario
      FROM transacciones_caja tc
      INNER JOIN usuarios u ON tc.idusuario = u.idusuario
      WHERE tc.idusuario = $1
        AND DATE(tc.fecha) = CURRENT_DATE
      ORDER BY tc.fecha DESC
      LIMIT 50
      `,
      [userId]
    );
    
    return result.rows;
  } catch (error) {
    console.error("Error in getUserTransactions service:", error);
    return [];
  }
};

exports.createTransaction = async ({ tipoMovimiento, descripcion, monto, userId }) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Obtener el último estado de caja global (sin filtrar por usuario)
    const estadoCajaQuery = `
      SELECT idestado_caja, estado, monto_final, idusuario
      FROM estado_caja 
      ORDER BY idestado_caja DESC 
      LIMIT 1
    `;
    
    const estadoCajaResult = await client.query(estadoCajaQuery);
    
    if (estadoCajaResult.rows.length === 0) {
      throw new Error("No se encontró estado de caja");
    }
    
    const estadoCajaActual = estadoCajaResult.rows[0];
    
    if (estadoCajaActual.estado !== 'abierta') {
      throw new Error("La caja no está abierta para realizar transacciones");
    }
    
    const idestado_caja = estadoCajaActual.idestado_caja;
    
    // 2. Insertar transacción con el usuario actual
    const result = await client.query(
      `
      INSERT INTO transacciones_caja (tipo_movimiento, descripcion, monto, fecha, idestado_caja, idusuario)
      VALUES ($1, $2, $3, TIMEZONE('America/La_Paz', NOW()), $4, $5)
      RETURNING *
      `,
      [tipoMovimiento, descripcion, monto, idestado_caja, userId]
    );

    // 3. Actualizar monto final en estado_caja (mismo registro para todos)
    if (tipoMovimiento === 'Ingreso') {
      await client.query(
        `UPDATE estado_caja SET monto_final = monto_final + $1 WHERE idestado_caja = $2`,
        [monto, idestado_caja]
      );
    } else if (tipoMovimiento === 'Egreso') {
      await client.query(
        `UPDATE estado_caja SET monto_final = monto_final - $1 WHERE idestado_caja = $2`,
        [monto, idestado_caja]
      );
    }

    // 4. Obtener información completa de la transacción
    const transactionResult = await client.query(
      `
      SELECT 
        tc.idtransaccion,
        tc.tipo_movimiento,
        tc.descripcion,
        tc.monto,
        tc.fecha,
        tc.idusuario,
        CONCAT(u.nombres, ' ', u.apellidos) as nombre_usuario
      FROM transacciones_caja tc
      INNER JOIN usuarios u ON tc.idusuario = u.idusuario
      WHERE tc.idtransaccion = $1
      `,
      [result.rows[0].idtransaccion]
    );

    await client.query('COMMIT');
    return transactionResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error in createTransaction service:", error);
    throw error;
  } finally {
    client.release();
  }
};

exports.openCash = async ({ montoInicial, userId }) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Verificar si ya existe un estado abierto (sin importar usuario)
    const estadoActualQuery = `
      SELECT estado FROM estado_caja 
      ORDER BY idestado_caja DESC 
      LIMIT 1
    `;
    
    const estadoActualResult = await client.query(estadoActualQuery);
    
    if (estadoActualResult.rows.length > 0 && estadoActualResult.rows[0].estado === 'abierta') {
      throw new Error("La caja ya está abierta");
    }
    
    // Crear nuevo estado de caja con el usuario actual
    const estadoCajaResult = await client.query(
      `
      INSERT INTO estado_caja (estado, monto_inicial, monto_final, idusuario)
      VALUES ('abierta', $1, $1, $2)
      RETURNING idestado_caja
      `,
      [montoInicial, userId]
    );
    
    const idestado_caja = estadoCajaResult.rows[0].idestado_caja;
    
    // Crear transacción de apertura
    await client.query(
      `
      INSERT INTO transacciones_caja (tipo_movimiento, descripcion, monto, fecha, idestado_caja, idusuario)
      VALUES ('Apertura', 'Apertura de caja', $1, TIMEZONE('America/La_Paz', NOW()), $2, $3)
      `,
      [montoInicial, idestado_caja, userId]
    );
    
    await client.query('COMMIT');
    return { success: true, message: "Caja abierta correctamente" };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error in openCash service:", error);
    throw error;
  } finally {
    client.release();
  }
};

exports.closeCash = async ({ userId }) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Obtener el último estado de caja (sin importar quién lo abrió)
    const estadoCajaQuery = `
      SELECT idestado_caja, monto_final, estado
      FROM estado_caja 
      ORDER BY idestado_caja DESC 
      LIMIT 1
    `;
    
    const estadoCajaResult = await client.query(estadoCajaQuery);
    
    if (estadoCajaResult.rows.length === 0) {
      throw new Error("No se encontró estado de caja");
    }
    
    const estadoCajaActual = estadoCajaResult.rows[0];
    
    if (estadoCajaActual.estado !== 'abierta') {
      throw new Error("La caja no está abierta");
    }
    
    const montoCierre = parseFloat(estadoCajaActual.monto_final);
    const idestado_caja = estadoCajaActual.idestado_caja;
    
    // Actualizar estado de caja (cualquier usuario puede cerrarla)
    await client.query(
      `
      UPDATE estado_caja 
      SET estado = 'cerrada'
      WHERE idestado_caja = $1
      `,
      [idestado_caja]
    );
    
    // Crear transacción de cierre con el usuario actual
    await client.query(
      `
      INSERT INTO transacciones_caja (tipo_movimiento, descripcion, monto, fecha, idestado_caja, idusuario)
      VALUES ('Cierre', 'Cierre de caja', $1, TIMEZONE('America/La_Paz', NOW()), $2, $3)
      `,
      [montoCierre, idestado_caja, userId]
    );
    
    await client.query('COMMIT');
    return { success: true, message: "Caja cerrada correctamente" };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error in closeCash service:", error);
    throw error;
  } finally {
    client.release();
  }
};