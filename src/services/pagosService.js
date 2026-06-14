const { query, pool } = require("../../db");

exports.obtenerPagosPendientes = async () => {
  try {
    const result = await query(`
      SELECT 
        c.idcotizacion,
        TO_CHAR(TIMEZONE('America/La_Paz', c.fecha_creacion), 'YYYY-MM-DD') as fecha,
        c.cliente_nombre,
        c.cliente_telefono,
        c.tipo_pago,
        c.total,
        c.abono,
        c.saldo,
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
      LEFT JOIN productos_pendientes_cotizacion ppc ON c.idcotizacion = ppc.idcotizacion AND p.idproducto = ppc.idproducto
      WHERE c.estado = 0 
        AND (c.saldo > 0 OR EXISTS (
          SELECT 1 FROM productos_pendientes_cotizacion ppc2 
          WHERE ppc2.idcotizacion = c.idcotizacion AND ppc2.cantidad_pendiente > 0
        ))
      GROUP BY c.idcotizacion, c.cliente_nombre, c.cliente_telefono, c.tipo_pago, c.total, c.abono, c.saldo, c.fecha_creacion
      ORDER BY c.fecha_creacion DESC, c.idcotizacion DESC
    `);

    console.log("Pagos pendientes encontrados:", result.rows.length);
    
    // Log para debug con fecha real
    result.rows.forEach(row => {
      console.log(`COT-${row.idcotizacion}: Fecha=${row.fecha}, Saldo=${row.saldo}, Productos pendientes=${row.productos.some(p => p.cantidad_pendiente > 0)}`);
    });
    
    return result.rows;
  } catch (error) {
    console.error("Error en obtenerPagosPendientes:", error);
    throw error;
  }
};

exports.procesarPagoCotizacion = async ({ idcotizacion, monto, metodoPago, idusuario }) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // 1. Verificar que la cotización existe y tiene saldo pendiente
    const cotizacionResult = await client.query(
      'SELECT saldo, total FROM cotizaciones WHERE idcotizacion = $1 AND estado = 0',
      [idcotizacion]
    );

    if (cotizacionResult.rows.length === 0) {
      throw new Error("Cotización no encontrada");
    }

    const cotizacion = cotizacionResult.rows[0];
    const saldoPendiente = parseFloat(cotizacion.saldo);

    if (monto > saldoPendiente) {
      throw new Error("El monto a pagar excede el saldo pendiente");
    }

    // 2. Actualizar saldo y abono en la cotización
    const nuevoSaldo = saldoPendiente - monto;
    const nuevoAbono = parseFloat(cotizacion.total) - nuevoSaldo;

    await client.query(
      'UPDATE cotizaciones SET saldo = $1, abono = $2 WHERE idcotizacion = $3',
      [nuevoSaldo, nuevoAbono, idcotizacion]
    );

    // 3. Solo registrar en caja si el método de pago es efectivo
    if (metodoPago === 'efectivo') {
      // Obtener el último estado de caja del usuario
      const estadoCajaQuery = `
        SELECT idestado_caja, estado, monto_final
        FROM estado_caja 
        WHERE idusuario = $1 
        ORDER BY idestado_caja DESC 
        LIMIT 1
      `;
      
      const estadoCajaResult = await client.query(estadoCajaQuery, [idusuario]);
      
      if (estadoCajaResult.rows.length === 0 || estadoCajaResult.rows[0].estado !== 'abierta') {
        throw new Error("La caja no está abierta para realizar transacciones");
      }
      
      const idestado_caja = estadoCajaResult.rows[0].idestado_caja;

      // Registrar transacción en caja
      await client.query(
        `
        INSERT INTO transacciones_caja (tipo_movimiento, descripcion, monto, fecha, idestado_caja, idusuario)
        VALUES ('Ingreso', 'Pago de cotización COT-${idcotizacion}', $1, TIMEZONE('America/La_Paz', NOW()), $2, $3)
        `,
        [monto, idestado_caja, idusuario]
      );

      // Actualizar monto final en estado_caja
      await client.query(
        `UPDATE estado_caja SET monto_final = monto_final + $1 WHERE idestado_caja = $2`,
        [monto, idestado_caja]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error en procesarPagoCotizacion:", error);
    throw error;
  } finally {
    client.release();
  }
};

exports.actualizarEntregasProductos = async ({ idcotizacion, productos, montoPago, metodoPago, idusuario }) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log('Iniciando proceso para cotización:', idcotizacion);
    console.log('Productos recibidos:', productos);
    console.log('Monto pago:', montoPago);
    console.log('Método pago:', metodoPago);
    console.log('Usuario:', idusuario);

    // Obtener información de la cotización
    const cotizacionInfo = await client.query(
      'SELECT cliente_nombre, saldo, total FROM cotizaciones WHERE idcotizacion = $1 AND estado = 0',
      [idcotizacion]
    );

    if (cotizacionInfo.rows.length === 0) {
      throw new Error("Cotización no encontrada o ya fue eliminada");
    }

    const clienteNombre = cotizacionInfo.rows[0].cliente_nombre;
    const saldoActual = parseFloat(cotizacionInfo.rows[0].saldo);
    const totalCotizacion = parseFloat(cotizacionInfo.rows[0].total);

    console.log('Saldo actual:', saldoActual, 'Total cotización:', totalCotizacion);

    // Validar monto de pago
    if (montoPago > 0 && montoPago > saldoActual) {
      throw new Error(`El monto a pagar (Bs ${montoPago}) excede el saldo pendiente (Bs ${saldoActual})`);
    }

    let productosEntregados = false;
    const itemsVenta = [];
    const descripcionItems = [];

    // 1. Procesar entregas de productos (si hay cantidades > 0)
    for (const producto of productos) {
      const { idproducto, cantidadEntregada } = producto;

      // Si no hay cantidad entregada, continuar con el siguiente producto
      if (!cantidadEntregada || cantidadEntregada <= 0) continue;

      productosEntregados = true;

      console.log(`Procesando entrega: producto ${idproducto}, cantidad: ${cantidadEntregada}`);

      // Verificar stock
      const stockResult = await client.query(
        'SELECT stock, nombre FROM productos WHERE idproducto = $1',
        [idproducto]
      );

      if (stockResult.rows.length === 0) {
        throw new Error(`El producto ${idproducto} no existe`);
      }

      const stockActual = stockResult.rows[0].stock;
      const nombreProducto = stockResult.rows[0].nombre;

      if (cantidadEntregada > stockActual) {
        throw new Error(`Stock insuficiente para ${nombreProducto}. Stock disponible: ${stockActual}`);
      }

      // Obtener información del producto y cantidad pendiente
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

      // Actualizar o insertar en productos_pendientes_cotizacion
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

      // Actualizar stock del producto
      await client.query(
        'UPDATE productos SET stock = stock - $1 WHERE idproducto = $2',
        [cantidadEntregada, idproducto]
      );

      console.log(`Stock actualizado para ${productoNombre}: -${cantidadEntregada} unidades`);

      // Agregar item para la venta (solo para registrar los productos entregados)
      itemsVenta.push({
        idproducto: idproducto,
        cantidad: cantidadEntregada,
        precio_unitario: precioUnitario,
        subtotal_linea: precioUnitario * cantidadEntregada
      });

      // Agregar a descripción
      descripcionItems.push(`${cantidadEntregada} ${productoNombre}`);
    }

    console.log('Productos procesados. Entregados:', productosEntregados);

    // 2. SIEMPRE CREAR VENTA SI HAY MONTO DE PAGO O PRODUCTOS ENTREGADOS
    let idventa = null;

    if (montoPago > 0 || productosEntregados) {
      // Construir descripción - SIEMPRE incluir información de la cotización
      let descripcionVenta = '';
      const baseDescripcion = `(cotización COT-${idcotizacion} - ${clienteNombre})`;
      
      if (productosEntregados && montoPago > 0) {
        // Caso: Hay entregas Y pago
        descripcionVenta = `${descripcionItems.join(', ')} - Pago de Bs ${montoPago.toFixed(2)} ${baseDescripcion}`;
      } else if (productosEntregados && montoPago === 0) {
        // Caso: Solo entregas sin pago
        descripcionVenta = `${descripcionItems.join(', ')} - Sin pago ${baseDescripcion}`;
      } else if (!productosEntregados && montoPago > 0) {
        // Caso: Solo pago sin entregas
        descripcionVenta = `Pago de Bs ${montoPago.toFixed(2)} ${baseDescripcion}`;
      }

      console.log('Creando venta. Descripción:', descripcionVenta, 'Monto:', montoPago);

      // Insertar venta - EL MONTO ES EXACTAMENTE EL QUE SE INGRESÓ
      const ventaResult = await client.query(
        `INSERT INTO ventas (fecha_hora, idusuario, descripcion, sub_total, descuento, total, metodo_pago) 
         VALUES (TIMEZONE('America/La_Paz', NOW()), $1, $2, $3, $4, $5, $6) 
         RETURNING idventa`,
        [idusuario, descripcionVenta, montoPago, 0, montoPago, metodoPago === 'efectivo' ? 'Efectivo' : 'QR']
      );
      
      idventa = ventaResult.rows[0].idventa;
      console.log('Venta creada con ID:', idventa);

      // Insertar detalles de venta solo si hay productos entregados
      if (productosEntregados && itemsVenta.length > 0) {
        for (const item of itemsVenta) {
          await client.query(
            `INSERT INTO detalle_ventas (idventa, idproducto, cantidad, precio_unitario, subtotal_linea) 
             VALUES ($1, $2, $3, $4, $5)`,
            [idventa, item.idproducto, item.cantidad, item.precio_unitario, item.subtotal_linea]
          );
        }
        console.log('Detalles de venta insertados:', itemsVenta.length, 'items');
      }

      // Registrar en caja solo si es efectivo y hay monto
      if (metodoPago === 'efectivo' && montoPago > 0) {
        const estadoCajaQuery = `
          SELECT idestado_caja, estado, monto_final
          FROM estado_caja 
          WHERE idusuario = $1 
          ORDER BY idestado_caja DESC 
          LIMIT 1
        `;
        
        const estadoCajaResult = await client.query(estadoCajaQuery, [idusuario]);
        
        if (estadoCajaResult.rows.length > 0 && estadoCajaResult.rows[0].estado === 'abierta') {
          const idestado_caja = estadoCajaResult.rows[0].idestado_caja;

          // MISMA DESCRIPCIÓN QUE EN VENTAS Y MISMO MONTO
          await client.query(
            `INSERT INTO transacciones_caja (idestado_caja, tipo_movimiento, descripcion, monto, fecha, idusuario, idventa)
             VALUES ($1, 'Ingreso', $2, $3, TIMEZONE('America/La_Paz', NOW()), $4, $5)`,
            [idestado_caja, descripcionVenta, montoPago, idusuario, idventa]
          );

          // Actualizar monto final en estado_caja
          await client.query(
            `UPDATE estado_caja SET monto_final = monto_final + $1 WHERE idestado_caja = $2`,
            [montoPago, idestado_caja]
          );

          console.log('Transacción de caja registrada. Monto:', montoPago);
        } else {
          throw new Error("La caja no está abierta para registrar pagos en efectivo");
        }
      }
    } else {
      // Este caso no debería ocurrir porque el frontend valida que haya al menos productos o monto
      console.log('No hay productos entregados ni monto de pago - no se crea venta');
    }

    // 3. Actualizar saldo de la cotización si hay pago
    if (montoPago > 0) {
      const nuevoSaldo = saldoActual - montoPago;
      const nuevoAbono = totalCotizacion - nuevoSaldo;

      await client.query(
        'UPDATE cotizaciones SET saldo = $1, abono = $2 WHERE idcotizacion = $3',
        [nuevoSaldo, nuevoAbono, idcotizacion]
      );

      console.log('Saldo de cotización actualizado. Nuevo saldo:', nuevoSaldo);
    }

    await client.query('COMMIT');
    
    console.log(`Proceso completado exitosamente para cotización COT-${idcotizacion}`);
    console.log(`- Productos entregados: ${productosEntregados ? 'Sí' : 'No'}`);
    console.log(`- Monto registrado: Bs ${montoPago}`);
    console.log(`- Método pago: ${metodoPago}`);
    console.log(`- Stock actualizado: ${productosEntregados ? 'Sí' : 'No'}`);
    console.log(`- Venta creada: ${idventa ? 'Sí (ID: ' + idventa + ')' : 'No'}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error en actualizarEntregasProductos:", error);
    console.error("Detalles del error:", error.message);
    console.error("Stack trace:", error.stack);
    throw error;
  } finally {
    client.release();
  }
};

exports.marcarCotizacionEntregada = async (idcotizacion) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Verificar que todos los productos estén completamente entregados
    const pendientesResult = await client.query(
      `SELECT COUNT(*) as pendientes 
       FROM productos_pendientes_cotizacion 
       WHERE idcotizacion = $1 AND cantidad_pendiente > 0`,
      [idcotizacion]
    );

    if (parseInt(pendientesResult.rows[0].pendientes) > 0) {
      throw new Error("No se puede marcar como entregada: existen productos pendientes");
    }

    // Verificar que no hay saldo pendiente
    const saldoResult = await client.query(
      'SELECT saldo FROM cotizaciones WHERE idcotizacion = $1',
      [idcotizacion]
    );

    if (saldoResult.rows.length > 0 && parseFloat(saldoResult.rows[0].saldo) > 0) {
      throw new Error("No se puede marcar como entregada: existe saldo pendiente");
    }

    // Aquí podrías agregar lógica adicional si necesitas marcar algo específico
    console.log(`Cotización ${idcotizacion} verificada como completamente entregada`);
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error en marcarCotizacionEntregada:", error);
    throw error;
  } finally {
    client.release();
  }
};

exports.eliminarCotizacion = async (idcotizacion) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Verificar que la cotización existe
    const cotizacionResult = await client.query(
      'SELECT estado FROM cotizaciones WHERE idcotizacion = $1',
      [idcotizacion]
    );

    if (cotizacionResult.rows.length === 0) {
      throw new Error("Cotización no encontrada");
    }

    // Actualizar estado a 1 (eliminado)
    await client.query(
      'UPDATE cotizaciones SET estado = 1 WHERE idcotizacion = $1',
      [idcotizacion]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error en eliminarCotizacion:", error);
    throw error;
  } finally {
    client.release();
  }
};