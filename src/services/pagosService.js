const { query, pool } = require("../../db");

// ============================================
// FUNCIONES DE CAJA
// ============================================

const verificarCajaAbierta = async (client, idbodega, tipo) => {
  if (tipo !== 'Efectivo') {
    return true;
  }
  
  const result = await client.query(
    `SELECT estado_caja FROM caja WHERE idbodega = $1 AND tipo = $2`,
    [idbodega, tipo]
  );
  
  if (result.rows.length === 0) {
    throw new Error(`No se encontró la caja de ${tipo} para esta bodega`);
  }
  
  if (result.rows[0].estado_caja !== 'abierta') {
    throw new Error(`La caja de ${tipo} está cerrada. No se pueden procesar pagos.`);
  }
  
  return result.rows[0];
};

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

const registrarMovimientoCaja = async (client, idcaja, idusuario, monto, tipo, descripcion, idventa = null) => {
  const cajaActual = await client.query(
    `SELECT total FROM caja WHERE idcaja = $1`,
    [idcaja]
  );

  const montoAnterior = cajaActual.rows.length > 0 ? parseFloat(cajaActual.rows[0].total) : 0;
  let montoActual = montoAnterior;

  if (tipo === 'ingreso' || tipo === 'apertura') {
    montoActual = montoAnterior + monto;
  } else if (tipo === 'egreso' || tipo === 'cierre') {
    montoActual = montoAnterior - monto;
  }

  await client.query(
    `INSERT INTO movimiento_caja 
     (idcaja, idusuario, monto, tipo, descripcion, monto_anterior, monto_actual, idventa) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [idcaja, idusuario, monto, tipo, descripcion, montoAnterior, montoActual, idventa]
  );

  await client.query(
    `UPDATE caja SET total = $1 WHERE idcaja = $2`,
    [montoActual, idcaja]
  );

  return { montoAnterior, montoActual };
};

// ============================================
// FUNCIONES DE PAGOS PENDIENTES
// ============================================

exports.obtenerPagosPendientes = async (idusuario = null, idbodega = null, rol = null) => {
  try {
    console.log("🔍 Obteniendo pagos pendientes - Usuario:", idusuario, "Bodega:", idbodega, "Rol:", rol);
    
    let sql = `
      SELECT 
        c.idcotizacion,
        TO_CHAR(TIMEZONE('America/La_Paz', c.fecha_creacion), 'YYYY-MM-DD') as fecha,
        c.cliente_nombre,
        c.cliente_telefono,
        c.tipo_pago,
        c.total,
        c.abono,
        c.saldo,
        c.idbodega,
        c.idcliente,
        b.nombre as bodega_nombre,
        u.nombres || ' ' || u.apellidos as usuario_nombre,
        u.usuario as usuario_login,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'idproducto', p.idproducto,
              'nombre', p.nombre,
              'precio_unitario', dc.precio_unitario,
              'cantidad', dc.cantidad,
              'cantidad_pendiente', COALESCE(ppc.cantidad_pendiente, dc.cantidad),
              'imagen', (
                SELECT 
                  CASE 
                    WHEN p.imagen IS NOT NULL THEN 
                      'data:image/jpeg;base64,' || encode(p.imagen, 'base64')
                    ELSE NULL
                  END
                LIMIT 1
              )
            )
          ) FILTER (WHERE p.idproducto IS NOT NULL),
          '[]'::json
        ) as productos
      FROM cotizaciones c
      INNER JOIN detalle_cotizaciones dc ON c.idcotizacion = dc.idcotizacion
      INNER JOIN productos p ON dc.idproducto = p.idproducto
      INNER JOIN usuarios u ON c.idusuario = u.idusuario
      LEFT JOIN productos_pendientes_cotizacion ppc ON c.idcotizacion = ppc.idcotizacion AND p.idproducto = ppc.idproducto
      LEFT JOIN bodegas b ON c.idbodega = b.idbodega
      WHERE c.estado = 0 
        AND (c.saldo > 0 OR EXISTS (
          SELECT 1 FROM productos_pendientes_cotizacion ppc2 
          WHERE ppc2.idcotizacion = c.idcotizacion AND ppc2.cantidad_pendiente > 0
        ))
    `;

    const params = [];
    let paramCount = 1;
    
    if (rol && rol === 'Admin') {
      console.log("👑 Admin: viendo TODAS las cotizaciones de TODAS las bodegas");
    } else {
      sql += ` AND c.idbodega = $${paramCount}`;
      params.push(idbodega);
      paramCount++;
      console.log("👤 Asistente: viendo cotizaciones de su bodega:", idbodega);
    }

    sql += `
      GROUP BY c.idcotizacion, c.cliente_nombre, c.cliente_telefono, c.tipo_pago, c.total, c.abono, c.saldo, c.fecha_creacion, c.idbodega, c.idcliente, b.nombre, u.nombres, u.apellidos, u.usuario
      ORDER BY c.fecha_creacion DESC, c.idcotizacion DESC
    `;

    console.log("📝 SQL Query:", sql);
    console.log("📝 Params:", params);

    const result = await query(sql, params);

    console.log("✅ Pagos pendientes encontrados:", result.rows.length);
    
    return result.rows;
  } catch (error) {
    console.error("❌ Error en obtenerPagosPendientes:", error);
    throw error;
  }
};

exports.procesarPagoCotizacion = async ({ idcotizacion, monto, metodoPago, idusuario, idbodegaUsuario, rol }) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log("💳 Procesando pago - Cotización:", idcotizacion, "Monto:", monto, "Método:", metodoPago);
    console.log("👤 Usuario:", idusuario, "Bodega del usuario:", idbodegaUsuario, "Rol:", rol);

    // Obtener información de la cotización incluyendo idcliente y productos
    const cotizacionResult = await client.query(
      `SELECT saldo, total, idbodega, cliente_nombre, idcliente, sub_total
       FROM cotizaciones 
       WHERE idcotizacion = $1 AND estado = 0`,
      [idcotizacion]
    );

    if (cotizacionResult.rows.length === 0) {
      throw new Error("Cotización no encontrada");
    }

    const cotizacion = cotizacionResult.rows[0];
    const saldoPendiente = parseFloat(cotizacion.saldo);
    const idbodegaCotizacion = cotizacion.idbodega;
    const clienteNombre = cotizacion.cliente_nombre;
    const idcliente = cotizacion.idcliente;
    const subTotal = parseFloat(cotizacion.sub_total) || 0;

    // VALIDAR: Solo puede pagar cotizaciones de su bodega
    if (idbodegaCotizacion !== idbodegaUsuario) {
      throw new Error(`No tiene permisos para procesar pagos de esta bodega. Solo puede procesar pagos de la bodega: ${idbodegaUsuario}`);
    }

    if (monto > saldoPendiente) {
      throw new Error(`El monto a pagar (Bs ${monto}) excede el saldo pendiente (Bs ${saldoPendiente})`);
    }

    // Obtener los productos de la cotización
    const productosCotizacion = await client.query(
      `SELECT idproducto, cantidad, precio_unitario 
       FROM detalle_cotizaciones 
       WHERE idcotizacion = $1`,
      [idcotizacion]
    );

    const tipo = metodoPago === 'efectivo' ? 'Efectivo' : 'QR';
    const caja = await getOrCreateCaja(client, idbodegaCotizacion, tipo);
    
    if (tipo === 'Efectivo') {
      await verificarCajaAbierta(client, idbodegaCotizacion, tipo);
    }

    const nuevoSaldo = saldoPendiente - monto;
    const nuevoAbono = parseFloat(cotizacion.total) - nuevoSaldo;

    await client.query(
      'UPDATE cotizaciones SET saldo = $1, abono = $2 WHERE idcotizacion = $3',
      [nuevoSaldo, nuevoAbono, idcotizacion]
    );

    const descripcionVenta = `Pago de cotización - ${clienteNombre}`;
    const descuento = subTotal - parseFloat(cotizacion.total);
    
    // INSERTAR VENTA CON CLIENTE
    const ventaResult = await client.query(
      `INSERT INTO ventas (fecha_hora, idusuario, idbodega, idcliente, descripcion, sub_total, descuento, total, metodo_pago, descripcion_descuento) 
       VALUES (TIMEZONE('America/La_Paz', NOW()), $1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING idventa`,
      [idusuario, idbodegaCotizacion, idcliente, descripcionVenta, monto, 0, monto, tipo, `Pago de cotización COT-${idcotizacion}`]
    );
    
    const idventa = ventaResult.rows[0].idventa;
    console.log("✅ Venta creada con ID:", idventa, "Cliente ID:", idcliente);

    // INSERTAR DETALLE DE VENTA con los productos de la cotización
    for (const item of productosCotizacion.rows) {
      await client.query(
        `INSERT INTO detalle_ventas (idventa, idproducto, idbodega, cantidad, precio_unitario, subtotal_linea) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [idventa, item.idproducto, idbodegaCotizacion, item.cantidad, parseFloat(item.precio_unitario), parseFloat(item.precio_unitario) * item.cantidad]
      );
    }
    console.log(`✅ Detalles de venta insertados: ${productosCotizacion.rows.length} productos`);

    await registrarMovimientoCaja(
      client,
      caja.idcaja,
      idusuario,
      monto,
      'ingreso',
      descripcionVenta,
      idventa
    );

    console.log(`✅ Pago procesado exitosamente para cotización COT-${idcotizacion}`);
    console.log(`💰 Caja ${tipo} actualizada con +${monto}`);

    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Error en procesarPagoCotizacion:", error);
    throw error;
  } finally {
    client.release();
  }
};

exports.actualizarEntregasProductos = async ({ idcotizacion, productos, montoPago, metodoPago, idusuario, idbodegaUsuario, rol }) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('📦 Iniciando proceso para cotización:', idcotizacion);
    console.log('📦 Productos recibidos:', productos);
    console.log('💰 Monto pago:', montoPago);
    console.log('💳 Método pago:', metodoPago);
    console.log('👤 Usuario:', idusuario);
    console.log('🏢 Bodega del usuario:', idbodegaUsuario);

    // Obtener información de la cotización incluyendo idcliente
    const cotizacionInfo = await client.query(
      `SELECT cliente_nombre, saldo, total, idbodega, idcliente, sub_total
       FROM cotizaciones 
       WHERE idcotizacion = $1 AND estado = 0`,
      [idcotizacion]
    );

    if (cotizacionInfo.rows.length === 0) {
      throw new Error("Cotización no encontrada o ya fue eliminada");
    }

    const clienteNombre = cotizacionInfo.rows[0].cliente_nombre;
    const saldoActual = parseFloat(cotizacionInfo.rows[0].saldo);
    const totalCotizacion = parseFloat(cotizacionInfo.rows[0].total);
    const idbodegaCotizacion = cotizacionInfo.rows[0].idbodega;
    const idcliente = cotizacionInfo.rows[0].idcliente;
    const subTotal = parseFloat(cotizacionInfo.rows[0].sub_total) || 0;

    // VALIDAR: Solo puede actualizar entregas de su bodega
    if (idbodegaCotizacion !== idbodegaUsuario) {
      throw new Error(`No tiene permisos para actualizar entregas de esta bodega. Solo puede actualizar entregas de la bodega: ${idbodegaUsuario}`);
    }

    console.log('Saldo actual:', saldoActual, 'Total cotización:', totalCotizacion);
    console.log('Bodega:', idbodegaCotizacion);
    console.log('Cliente ID:', idcliente);

    if (montoPago > 0 && montoPago > saldoActual) {
      throw new Error(`El monto a pagar (Bs ${montoPago}) excede el saldo pendiente (Bs ${saldoActual})`);
    }

    let idventa = null;
    const descuento = subTotal - totalCotizacion;

    if (montoPago > 0) {
      const tipo = metodoPago === 'efectivo' ? 'Efectivo' : 'QR';
      const caja = await getOrCreateCaja(client, idbodegaCotizacion, tipo);
      
      if (tipo === 'Efectivo') {
        await verificarCajaAbierta(client, idbodegaCotizacion, tipo);
      }
      
      const descripcionVenta = `Pago de cotización - ${clienteNombre}`;
      
      // INSERTAR VENTA CON CLIENTE
      const ventaResult = await client.query(
        `INSERT INTO ventas (fecha_hora, idusuario, idbodega, idcliente, descripcion, sub_total, descuento, total, metodo_pago, descripcion_descuento) 
         VALUES (TIMEZONE('America/La_Paz', NOW()), $1, $2, $3, $4, $5, $6, $7, $8, $9) 
         RETURNING idventa`,
        [idusuario, idbodegaCotizacion, idcliente, descripcionVenta, montoPago, 0, montoPago, tipo, `Pago de cotización COT-${idcotizacion}`]
      );
      
      idventa = ventaResult.rows[0].idventa;
      console.log('✅ Venta creada con ID:', idventa, 'Cliente ID:', idcliente);
      
      await registrarMovimientoCaja(
        client,
        caja.idcaja,
        idusuario,
        montoPago,
        'ingreso',
        descripcionVenta,
        idventa
      );
      
      console.log(`💰 Pago registrado en caja ${tipo}: +${montoPago}`);
    }

    let productosEntregados = false;
    const itemsVenta = [];
    const descripcionItems = [];

    for (const producto of productos) {
      const { idproducto, cantidadEntregada } = producto;

      if (!cantidadEntregada || cantidadEntregada <= 0) continue;

      productosEntregados = true;

      console.log(`📦 Procesando entrega: producto ${idproducto}, cantidad: ${cantidadEntregada}`);

      const stockResult = await client.query(
        `SELECT pb.stock, p.nombre 
         FROM productos p
         LEFT JOIN producto_bodega pb ON p.idproducto = pb.idproducto AND pb.idbodega = $2
         WHERE p.idproducto = $1`,
        [idproducto, idbodegaCotizacion]
      );

      if (stockResult.rows.length === 0) {
        throw new Error(`El producto ${idproducto} no existe`);
      }

      const stockActual = stockResult.rows[0].stock || 0;
      const nombreProducto = stockResult.rows[0].nombre;

      if (cantidadEntregada > stockActual) {
        throw new Error(`Stock insuficiente para ${nombreProducto}. Stock disponible: ${stockActual}`);
      }

      const detalleResult = await client.query(
        `SELECT dc.cantidad, dc.precio_unitario, 
                COALESCE(ppc.cantidad_pendiente, dc.cantidad) as cantidad_pendiente,
                p.nombre as producto_nombre
         FROM detalle_cotizaciones dc
         INNER JOIN productos p ON dc.idproducto = p.idproducto
         LEFT JOIN productos_pendientes_cotizacion ppc ON dc.idcotizacion = ppc.idcotizacion AND dc.idproducto = ppc.idproducto
         WHERE dc.idcotizacion = $1 AND dc.idproducto = $2`,
        [idcotizacion, idproducto]
      );

      if (detalleResult.rows.length === 0) {
        throw new Error(`Producto ${idproducto} no encontrado en la cotización`);
      }

      const detalle = detalleResult.rows[0];
      const cantidadPendienteActual = parseInt(detalle.cantidad_pendiente);
      const precioUnitario = parseFloat(detalle.precio_unitario);
      const productoNombre = detalle.producto_nombre;

      console.log(`Producto: ${productoNombre}, Pendiente: ${cantidadPendienteActual}, Precio: ${precioUnitario}`);

      if (cantidadEntregada > cantidadPendienteActual) {
        throw new Error(`La cantidad a entregar (${cantidadEntregada}) excede lo pendiente (${cantidadPendienteActual}) para ${productoNombre}`);
      }

      const nuevaCantidadPendiente = cantidadPendienteActual - cantidadEntregada;

      const pendienteExistente = await client.query(
        'SELECT 1 FROM productos_pendientes_cotizacion WHERE idcotizacion = $1 AND idproducto = $2',
        [idcotizacion, idproducto]
      );

      if (pendienteExistente.rows.length > 0) {
        await client.query(
          'UPDATE productos_pendientes_cotizacion SET cantidad_pendiente = $1 WHERE idcotizacion = $2 AND idproducto = $3',
          [nuevaCantidadPendiente, idcotizacion, idproducto]
        );
      } else {
        await client.query(
          'INSERT INTO productos_pendientes_cotizacion (idcotizacion, idproducto, cantidad_pendiente) VALUES ($1, $2, $3)',
          [idcotizacion, idproducto, nuevaCantidadPendiente]
        );
      }

      const cantidad = parseInt(cantidadEntregada) || 0;
      
      if (cantidad > 0) {
        const existeRegistro = await client.query(
          'SELECT 1 FROM producto_bodega WHERE idproducto = $1 AND idbodega = $2',
          [idproducto, idbodegaCotizacion]
        );

        if (existeRegistro.rows.length > 0) {
          await client.query(
            'UPDATE producto_bodega SET stock = stock - $1 WHERE idproducto = $2 AND idbodega = $3',
            [cantidad, idproducto, idbodegaCotizacion]
          );
        } else {
          await client.query(
            'INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo) VALUES ($1, $2, $3, 0)',
            [idproducto, idbodegaCotizacion, -cantidad]
          );
        }
      }

      console.log(`✅ Stock actualizado para ${productoNombre}: -${cantidadEntregada} unidades en bodega ${idbodegaCotizacion}`);

      itemsVenta.push({
        idproducto: idproducto,
        cantidad: cantidadEntregada,
        precio_unitario: precioUnitario,
        subtotal_linea: precioUnitario * cantidadEntregada
      });

      descripcionItems.push(`${cantidadEntregada} ${productoNombre}`);
    }

    console.log('Productos procesados. Entregados:', productosEntregados);

    // Si hay productos entregados Y hay una venta creada, agregar detalles
    if (idventa && productosEntregados && itemsVenta.length > 0) {
      for (const item of itemsVenta) {
        await client.query(
          `INSERT INTO detalle_ventas (idventa, idproducto, idbodega, cantidad, precio_unitario, subtotal_linea) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [idventa, item.idproducto, idbodegaCotizacion, item.cantidad, item.precio_unitario, item.subtotal_linea]
        );
      }
      console.log('✅ Detalles de venta insertados:', itemsVenta.length, 'items');
    }

    if (montoPago > 0) {
      const nuevoSaldo = saldoActual - montoPago;
      const nuevoAbono = totalCotizacion - nuevoSaldo;

      await client.query(
        'UPDATE cotizaciones SET saldo = $1, abono = $2 WHERE idcotizacion = $3',
        [nuevoSaldo, nuevoAbono, idcotizacion]
      );

      console.log('✅ Saldo de cotización actualizado. Nuevo saldo:', nuevoSaldo);
    }

    await client.query('COMMIT');
    
    console.log(`✅ Proceso completado exitosamente para cotización COT-${idcotizacion}`);
    
    return { success: true, idventa };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Error en actualizarEntregasProductos:", error);
    console.error("Detalles del error:", error.message);
    console.error("Stack trace:", error.stack);
    throw error;
  } finally {
    client.release();
  }
};

exports.marcarCotizacionEntregada = async (idcotizacion, idbodegaUsuario, rol) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const cotizacionResult = await client.query(
      'SELECT idbodega FROM cotizaciones WHERE idcotizacion = $1 AND estado = 0',
      [idcotizacion]
    );

    if (cotizacionResult.rows.length === 0) {
      throw new Error("Cotización no encontrada");
    }

    const idbodegaCotizacion = cotizacionResult.rows[0].idbodega;

    if (idbodegaCotizacion !== idbodegaUsuario) {
      throw new Error(`No tiene permisos para marcar entregada esta cotización. Solo puede marcar entregadas cotizaciones de la bodega: ${idbodegaUsuario}`);
    }

    const pendientesResult = await client.query(
      `SELECT COUNT(*) as pendientes 
       FROM productos_pendientes_cotizacion 
       WHERE idcotizacion = $1 AND cantidad_pendiente > 0`,
      [idcotizacion]
    );

    if (parseInt(pendientesResult.rows[0].pendientes) > 0) {
      throw new Error("No se puede marcar como entregada: existen productos pendientes");
    }

    const saldoResult = await client.query(
      'SELECT saldo FROM cotizaciones WHERE idcotizacion = $1',
      [idcotizacion]
    );

    if (saldoResult.rows.length > 0 && parseFloat(saldoResult.rows[0].saldo) > 0) {
      throw new Error("No se puede marcar como entregada: existe saldo pendiente");
    }

    console.log(`✅ Cotización ${idcotizacion} verificada como completamente entregada`);
    
    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Error en marcarCotizacionEntregada:", error);
    throw error;
  } finally {
    client.release();
  }
};

exports.eliminarCotizacion = async (idcotizacion, idbodegaUsuario, rol) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const cotizacionResult = await client.query(
      'SELECT estado, idbodega FROM cotizaciones WHERE idcotizacion = $1',
      [idcotizacion]
    );

    if (cotizacionResult.rows.length === 0) {
      throw new Error("Cotización no encontrada");
    }

    const idbodegaCotizacion = cotizacionResult.rows[0].idbodega;

    if (idbodegaCotizacion !== idbodegaUsuario) {
      throw new Error(`No tiene permisos para eliminar esta cotización. Solo puede eliminar cotizaciones de la bodega: ${idbodegaUsuario}`);
    }

    await client.query(
      'UPDATE cotizaciones SET estado = 1 WHERE idcotizacion = $1',
      [idcotizacion]
    );

    await client.query('COMMIT');
    console.log(`✅ Cotización ${idcotizacion} eliminada exitosamente`);
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Error en eliminarCotizacion:", error);
    throw error;
  } finally {
    client.release();
  }
};