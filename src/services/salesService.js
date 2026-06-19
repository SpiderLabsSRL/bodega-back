const { query, pool } = require("../../db");

const searchProducts = async (searchQuery, withoutStock = true, idbodega = null) => {
  if (!searchQuery || searchQuery.trim() === "") {
    return [];
  }

  // Consulta principal con productos similares y filtro por bodega
  let productsSql = `
    SELECT 
      p.idproducto,
      p.nombre,
      p.descripcion,
      p.estado,
      p.idubicacion,
      u.nombre as nombre_ubicacion,
      p.imagen,
      p.precio_venta,
      COALESCE(pb.stock, 0) as stock,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'idproducto', ps.idproducto_similar,
            'nombre', ps2.nombre
          )
        )
        FROM productos_similares ps
        JOIN productos ps2 ON ps.idproducto_similar = ps2.idproducto
        WHERE ps.idproducto = p.idproducto AND ps2.estado = 0
        ), '[]'::json
      ) as productos_similares
    FROM productos p
    LEFT JOIN ubicaciones u ON p.idubicacion = u.idubicacion
    LEFT JOIN producto_bodega pb ON p.idproducto = pb.idproducto
    WHERE p.estado = 0 
      AND (p.nombre ILIKE $1 OR p.descripcion ILIKE $1 OR p.codigo_barras ILIKE $1)
  `;

  const params = [`%${searchQuery}%`];

  // Filtrar por bodega si se proporciona
  if (idbodega) {
    productsSql += ` AND pb.idbodega = $2`;
    params.push(idbodega);
  }

  // Si withoutStock es true, solo mostrar productos con stock > 0
  if (withoutStock) {
    const stockCondition = idbodega 
      ? ` AND COALESCE(pb.stock, 0) > 0` 
      : ` AND p.stock > 0`;
    productsSql += stockCondition;
  }

  productsSql += `
    GROUP BY p.idproducto, u.nombre, u.idubicacion, pb.stock
    ORDER BY p.nombre
    LIMIT 10;
  `;

  try {
    const productsResult = await query(productsSql, params);
    
    // Si no se filtró por bodega, usar el stock de la tabla productos
    if (!idbodega) {
      return productsResult.rows;
    }
    
    // Si se filtró por bodega, ya tenemos el stock de producto_bodega
    return productsResult.rows;
  } catch (error) {
    console.error("Error in searchProducts SQL query:", error);
    throw error;
  }
};

const getCurrentCashStatus = async (idbodega = null) => {
  let sql = `
    SELECT ec.*, u.usuario
    FROM estado_caja ec
    INNER JOIN usuarios u ON ec.idusuario = u.idusuario
  `;
  
  const params = [];
  
  if (idbodega) {
    sql += ` WHERE ec.idbodega = $1`;
    params.push(idbodega);
  }
  
  sql += ` ORDER BY ec.idestado_caja DESC LIMIT 1`;

  const result = await query(sql, params);

  if (result.rows.length === 0) {
    throw new Error("No hay registro de caja para esta bodega");
  }

  return result.rows[0];
};

const processSale = async (saleData, userId, idbodega = null) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verificar que la caja esté abierta para esta bodega
    if (saleData.metodo_pago === "Efectivo") {
      let cashStatusCheckSql = `
        SELECT * FROM estado_caja 
        ORDER BY idestado_caja DESC 
        LIMIT 1
      `;
      const params = [];
      
      if (idbodega) {
        cashStatusCheckSql = `
          SELECT * FROM estado_caja 
          WHERE idbodega = $1
          ORDER BY idestado_caja DESC 
          LIMIT 1
        `;
        params.push(idbodega);
      }
      
      const cashStatusCheck = await client.query(cashStatusCheckSql, params);

      if (
        cashStatusCheck.rows.length === 0 ||
        cashStatusCheck.rows[0].estado === "cerrada"
      ) {
        throw new Error(
          "La caja está cerrada. No se puede procesar la venta en efectivo.",
        );
      }
    }

    const userCheck = await client.query(
      "SELECT idusuario FROM usuarios WHERE idusuario = $1 AND estado = 0",
      [userId],
    );

    if (userCheck.rows.length === 0) {
      throw new Error("Usuario no válido o inactivo");
    }

    // Verificar stock para cada producto
    for (const item of saleData.items) {
      let stockCheckSql = `
        SELECT COALESCE(pb.stock, p.stock) as stock, p.nombre 
        FROM productos p
        LEFT JOIN producto_bodega pb ON p.idproducto = pb.idproducto
        WHERE p.idproducto = $1 AND p.estado = 0
      `;
      const params = [item.idproducto];
      
      if (idbodega) {
        stockCheckSql += ` AND (pb.idbodega = $2 OR pb.idbodega IS NULL)`;
        params.push(idbodega);
      }
      
      const stockCheck = await client.query(stockCheckSql, params);

      if (stockCheck.rows.length === 0) {
        throw new Error(
          `El producto ${item.idproducto} no existe o está inactivo`,
        );
      }

      const stockDisponible = stockCheck.rows[0].stock || 0;
      if (stockDisponible < item.cantidad) {
        const productName = stockCheck.rows[0].nombre || "Producto";
        throw new Error(
          `Stock insuficiente para ${productName}. Stock disponible: ${stockDisponible}`,
        );
      }
    }

    // Insertar venta con idbodega
    const saleResult = await client.query(
      `INSERT INTO ventas (fecha_hora, idusuario, idbodega, descripcion, sub_total, descuento, total, metodo_pago, descripcion_descuento) 
       VALUES (TIMEZONE('America/La_Paz', NOW()), $1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING idventa`,
      [
        userId,
        idbodega,
        saleData.descripcion,
        saleData.sub_total,
        saleData.descuento,
        saleData.total,
        saleData.metodo_pago,
        saleData.descripcion_descuento || '',
      ],
    );

    const saleId = saleResult.rows[0].idventa;

    // Insertar detalle de venta y actualizar stock
    for (const item of saleData.items) {
      await client.query(
        `INSERT INTO detalle_ventas (idventa, idproducto, idbodega, cantidad, precio_unitario, subtotal_linea) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          saleId,
          item.idproducto,
          idbodega,
          item.cantidad,
          item.precio_unitario,
          item.subtotal_linea,
        ],
      );

      // Actualizar stock en producto_bodega
      if (idbodega) {
        await client.query(
          `INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (idproducto, idbodega) 
           DO UPDATE SET stock = producto_bodega.stock - $3`,
          [item.idproducto, idbodega, item.cantidad],
        );
      } else {
        // Si no hay bodega, actualizar stock directamente en productos
        await client.query(
          "UPDATE productos SET stock = stock - $1 WHERE idproducto = $2",
          [item.cantidad, item.idproducto],
        );
      }
    }

    // Registrar transacción de caja
    if (saleData.metodo_pago === "Efectivo") {
      let lastMontoFinalResult;
      if (idbodega) {
        lastMontoFinalResult = await client.query(
          "SELECT monto_final FROM estado_caja WHERE idbodega = $1 ORDER BY idestado_caja DESC LIMIT 1",
          [idbodega],
        );
      } else {
        lastMontoFinalResult = await client.query(
          "SELECT monto_final FROM estado_caja ORDER BY idestado_caja DESC LIMIT 1",
        );
      }
      
      const lastMontoFinal = lastMontoFinalResult.rows[0]?.monto_final || 0;
      const nuevoMontoFinal = parseFloat(lastMontoFinal) + parseFloat(saleData.total);

      const newCashStatusResult = await client.query(
        `INSERT INTO estado_caja (estado, monto_inicial, monto_final, idusuario, idbodega) 
         VALUES ('abierta', $1, $2, $3, $4) 
         RETURNING idestado_caja`,
        [lastMontoFinal, nuevoMontoFinal, userId, idbodega],
      );

      const newCashStatusId = newCashStatusResult.rows[0].idestado_caja;

      await client.query(
        `INSERT INTO transacciones_caja (idestado_caja, tipo_movimiento, descripcion, monto, fecha, idusuario, idventa, idbodega) 
         VALUES ($1, 'Ingreso', $2, $3, TIMEZONE('America/La_Paz', NOW()), $4, $5, $6)`,
        [
          newCashStatusId,
          `Venta: ${saleData.descripcion}`,
          saleData.total,
          userId,
          saleId,
          idbodega,
        ],
      );
    }

    await client.query("COMMIT");

    return { idventa: saleId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  searchProducts,
  getCurrentCashStatus,
  processSale,
};