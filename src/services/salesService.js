const { query, pool } = require("../../db");

const searchProducts = async (searchQuery, withoutStock = true, idbodega = null) => {
  if (!searchQuery || searchQuery.trim() === "") {
    return [];
  }

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

  if (idbodega) {
    productsSql += ` AND pb.idbodega = $2`;
    params.push(idbodega);
  }

  if (withoutStock) {
    const stockCondition = idbodega 
      ? ` AND COALESCE(pb.stock, 0) > 0` 
      : ` AND COALESCE(pb.stock, 0) > 0`;
    productsSql += stockCondition;
  }

  productsSql += `
    GROUP BY p.idproducto, u.nombre, u.idubicacion, pb.stock
    ORDER BY p.nombre
    LIMIT 10;
  `;

  try {
    const productsResult = await query(productsSql, params);
    return productsResult.rows;
  } catch (error) {
    console.error("Error in searchProducts SQL query:", error);
    throw error;
  }
};

const searchClientes = async (searchQuery) => {
  console.log("searchClientes called with:", searchQuery);
  
  if (!searchQuery || searchQuery.trim().length < 2) {
    console.log("Query too short, returning empty");
    return [];
  }

  const sql = `
    SELECT 
      idcliente,
      nombres,
      apellidos,
      carnet,
      celular,
      nota,
      estado
    FROM clientes
    WHERE estado = 0
      AND (
        nombres ILIKE $1 OR 
        apellidos ILIKE $1 OR 
        carnet ILIKE $1 OR 
        celular ILIKE $1
      )
    ORDER BY nombres
    LIMIT 10;
  `;

  try {
    console.log("Executing SQL:", sql);
    const result = await query(sql, [`%${searchQuery}%`]);
    console.log("SQL result rows:", result.rows.length);
    
    const mapped = result.rows.map(row => ({
      id: row.idcliente,
      nombres: row.nombres,
      apellidos: row.apellidos,
      carnet: row.carnet,
      celular: row.celular,
      nota: row.nota || "",
      estado: row.estado === 0
    }));
    
    console.log("Mapped clients:", mapped);
    return mapped;
  } catch (error) {
    console.error("Error in searchClientes SQL query:", error);
    throw error;
  }
};

const processSale = async (saleData, userId, idbodega = null) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verificar usuario
    const userCheck = await client.query(
      "SELECT idusuario FROM usuarios WHERE idusuario = $1 AND estado = 0",
      [userId],
    );

    if (userCheck.rows.length === 0) {
      throw new Error("Usuario no válido o inactivo");
    }

    // Si no hay idbodega, obtener la bodega del usuario
    if (!idbodega) {
      const userBodegaResult = await client.query(
        "SELECT idbodega FROM usuarios WHERE idusuario = $1",
        [userId]
      );
      if (userBodegaResult.rows.length > 0 && userBodegaResult.rows[0].idbodega) {
        idbodega = userBodegaResult.rows[0].idbodega;
        console.log("Using user's bodega:", idbodega);
      } else {
        throw new Error("No se pudo determinar la bodega para la venta");
      }
    }

    // Verificar stock para cada producto
    for (const item of saleData.items) {
      const stockCheckSql = `
        SELECT COALESCE(pb.stock, 0) as stock, p.nombre 
        FROM productos p
        LEFT JOIN producto_bodega pb ON p.idproducto = pb.idproducto AND pb.idbodega = $2
        WHERE p.idproducto = $1 AND p.estado = 0
      `;
      const params = [item.idproducto, idbodega];
      
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

    // Insertar venta
    const saleResult = await client.query(
      `INSERT INTO ventas (fecha_hora, idusuario, idbodega, idcliente, descripcion, sub_total, descuento, total, metodo_pago, descripcion_descuento) 
       VALUES (TIMEZONE('America/La_Paz', NOW()), $1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING idventa`,
      [
        userId,
        idbodega,
        saleData.idcliente || null,
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
      await client.query(
        `INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (idproducto, idbodega) 
         DO UPDATE SET stock = producto_bodega.stock - $3`,
        [item.idproducto, idbodega, item.cantidad],
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
  searchClientes,
  processSale,
};