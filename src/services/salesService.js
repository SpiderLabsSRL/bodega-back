const { query, pool } = require("../../db");

const searchProducts = async (searchQuery, withoutStock = true, idbodega = null) => {
  if (!searchQuery || searchQuery.trim() === "") {
    return [];
  }

  // Si no se proporciona idbodega, no devolvemos productos
  if (!idbodega) {
    console.log("⚠️ No se proporcionó idbodega, no se pueden buscar productos");
    return [];
  }

  // CAMBIAR DE const A let - ESTA ES LA LÍNEA CRÍTICA
  let productsSql = `
    SELECT 
      p.idproducto,
      p.nombre,
      p.descripcion,
      p.estado,
      p.imagen,
      p.precio_venta,
      COALESCE(pb.stock, 0) as stock,
      (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'idubicacion', u.idubicacion,
              'nombre_ubicacion', u.nombre,
              'idbodega', u.idbodega
            )
          ),
          '[]'::json
        )
        FROM producto_ubicacion_bodega pub
        JOIN ubicaciones u ON pub.idubicacion = u.idubicacion
        WHERE pub.idproducto = p.idproducto 
          AND pub.idbodega = pb.idbodega
          AND u.estado = 0
      ) as ubicaciones,
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
    INNER JOIN producto_bodega pb ON p.idproducto = pb.idproducto AND pb.idbodega = $2
    WHERE p.estado = 0 
      AND (
        p.nombre ILIKE $1 
        OR p.descripcion ILIKE $1 
        OR p.codigo_barras ILIKE $1
      )
      AND pb.idbodega IS NOT NULL
  `;

  const params = [`%${searchQuery}%`, idbodega];

  if (withoutStock) {
    // AHORA productsSql es let, esto funciona
    productsSql += ` AND COALESCE(pb.stock, 0) > 0`;
  }

  productsSql += `
    GROUP BY p.idproducto, pb.stock, pb.idbodega
    ORDER BY p.nombre
    LIMIT 10;
  `;

  try {
    console.log("📝 SQL Query:", productsSql);
    console.log("📝 Params:", params);
    const productsResult = await query(productsSql, params);
    
    // FILTRAR UBICACIONES POR BODEGA EN JAVASCRIPT (igual que en productsService)
    const productosFiltrados = productsResult.rows.map(producto => {
      let ubicaciones = producto.ubicaciones || [];
      
      // Filtrar ubicaciones nulas y solo las de la bodega del usuario
      if (Array.isArray(ubicaciones)) {
        ubicaciones = ubicaciones.filter(u => u && u.idubicacion !== null);
        // Filtrar por bodega
        if (idbodega) {
          ubicaciones = ubicaciones.filter(u => u.idbodega === parseInt(idbodega));
        }
      }
      
      return {
        ...producto,
        ubicaciones: ubicaciones
      };
    });
    
    return productosFiltrados;
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
  console.log("🏪 processSale called with:", { userId, idbodega, saleData });
  
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verificar usuario
    const userCheck = await client.query(
      "SELECT idusuario, idbodega FROM usuarios WHERE idusuario = $1 AND estado = 0",
      [userId],
    );

    if (userCheck.rows.length === 0) {
      throw new Error("Usuario no válido o inactivo");
    }

    // Si no se proporcionó idbodega, usar la del usuario
    if (!idbodega) {
      idbodega = userCheck.rows[0].idbodega;
      console.log("📦 Usando bodega del usuario:", idbodega);
      
      if (!idbodega) {
        throw new Error("El usuario no tiene una bodega asignada");
      }
    }

    console.log("🏢 Bodega final para la venta:", idbodega);

    // Verificar stock para cada producto en la bodega específica
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
        saleData.descripcion || '',
        saleData.sub_total || 0,
        saleData.descuento || 0,
        saleData.total || 0,
        saleData.metodo_pago || 'Efectivo',
        saleData.descripcion_descuento || '',
      ],
    );

    const saleId = saleResult.rows[0].idventa;
    console.log("✅ Venta creada con ID:", saleId);

    // Insertar detalle de venta y actualizar stock
    for (const item of saleData.items) {
      // Insertar detalle
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
      const updateStockResult = await client.query(
        `UPDATE producto_bodega 
         SET stock = stock - $1 
         WHERE idproducto = $2 AND idbodega = $3
         RETURNING stock`,
        [item.cantidad, item.idproducto, idbodega],
      );

      if (updateStockResult.rows.length === 0) {
        // Si no existe el registro, crearlo con stock negativo (no debería pasar)
        await client.query(
          `INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo)
           VALUES ($1, $2, -$3, 0)`,
          [item.idproducto, idbodega, item.cantidad],
        );
      }

      console.log(`📦 Stock actualizado para producto ${item.idproducto} en bodega ${idbodega}`);
    }

    await client.query("COMMIT");
    console.log("✅ Venta completada exitosamente");

    return { idventa: saleId };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error en processSale:", error);
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