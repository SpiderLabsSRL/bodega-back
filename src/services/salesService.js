// src/services/salesService.js
const { query, pool } = require("../../db");

// ============================================
// BÚSQUEDA DE PRODUCTOS
// ============================================
const searchProducts = async (searchQuery, withoutStock = true, idbodega = null) => {
  if (!searchQuery || searchQuery.trim() === "") {
    return [];
  }

  if (!idbodega) {
    console.log("⚠️ No se proporcionó idbodega, no se pueden buscar productos");
    return [];
  }

  // 🔑 1. Normalizar: minúsculas, reemplazar guiones/underscores por espacios
  const normalized = searchQuery
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .trim();

  // 🔑 2. Tokenizar: dividir por espacios
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return [];
  }

  // 🔑 3. Cada token debe aparecer (sin acentos) en nombre, descripcion o codigo_barras
  const tokenConditions = tokens
    .map((_, i) => {
      const p = `$${i + 1}`;
      return `(
        LOWER(unaccent(p.nombre)) ILIKE ${p}
        OR LOWER(unaccent(COALESCE(p.descripcion, ''))) ILIKE ${p}
        OR LOWER(unaccent(COALESCE(p.codigo_barras, ''))) ILIKE ${p}
      )`;
    })
    .join(" AND ");

  // 🔑 4. Índices de parámetros
  const fullQueryParamIndex = tokens.length + 1;
  const idbodegaParamIndex = tokens.length + 2;

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
    INNER JOIN producto_bodega pb 
      ON p.idproducto = pb.idproducto 
      AND pb.idbodega = $${idbodegaParamIndex}
    WHERE p.estado = 0 
      AND pb.idbodega IS NOT NULL
      AND (${tokenConditions})
  `;

  // 🔑 5. Parámetros: %token% por cada token, luego el query completo normalizado, luego idbodega
  const params = [
    ...tokens.map((t) => `%${t}%`),
    `%${normalized}%`,
    idbodega,
  ];

  if (withoutStock) {
    productsSql += ` AND COALESCE(pb.stock, 0) > 0`;
  }

  productsSql += `
    GROUP BY p.idproducto, pb.stock, pb.idbodega
    ORDER BY 
      -- 🔑 Ranking:
      --   0: empieza con el query completo
      --   1: contiene el query como palabra (con espacio antes)
      --   2: contiene el query en cualquier parte
      --   3: resto
      CASE 
        WHEN LOWER(unaccent(p.nombre)) LIKE $${fullQueryParamIndex} || '%' THEN 0
        WHEN LOWER(unaccent(p.nombre)) LIKE '% ' || $${fullQueryParamIndex} || '%' THEN 1
        WHEN LOWER(unaccent(p.nombre)) LIKE $${fullQueryParamIndex} THEN 2
        ELSE 3
      END,
      -- 🔑 Desempate por similitud trigram (más parecidos primero)
      similarity(LOWER(unaccent(p.nombre)), $${fullQueryParamIndex}) DESC,
      -- 🔑 Desempate final alfabético
      p.nombre
    LIMIT 20;
  `;

  try {
    console.log("📝 SQL Query:", productsSql);
    console.log("📝 Params:", params);
    const productsResult = await query(productsSql, params);

    const productosFiltrados = productsResult.rows.map((producto) => {
      let ubicaciones = producto.ubicaciones || [];

      if (Array.isArray(ubicaciones)) {
        ubicaciones = ubicaciones.filter((u) => u && u.idubicacion !== null);
        if (idbodega) {
          ubicaciones = ubicaciones.filter(
            (u) => u.idbodega === parseInt(idbodega)
          );
        }
      }

      return {
        ...producto,
        ubicaciones: ubicaciones,
      };
    });

    return productosFiltrados;
  } catch (error) {
    console.error("Error in searchProducts SQL query:", error);
    throw error;
  }
};

// ============================================
// BÚSQUEDA DE CLIENTES
// ============================================
const searchClientes = async (searchQuery) => {
  console.log("searchClientes called with:", searchQuery);

  if (!searchQuery || searchQuery.trim().length < 2) {
    console.log("Query too short, returning empty");
    return [];
  }

  // Normalizar y tokenizar
  const normalized = searchQuery.toLowerCase().replace(/[-_]/g, " ").trim();
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return [];
  }

  // Cada token debe aparecer en nombres, apellidos, carnet o celular
  const tokenConditions = tokens
    .map((_, i) => {
      const p = `$${i + 1}`;
      return `(
        LOWER(unaccent(nombres)) ILIKE ${p}
        OR LOWER(unaccent(apellidos)) ILIKE ${p}
        OR LOWER(unaccent(COALESCE(carnet, ''))) ILIKE ${p}
        OR LOWER(unaccent(COALESCE(celular, ''))) ILIKE ${p}
      )`;
    })
    .join(" AND ");

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
      AND (${tokenConditions})
    ORDER BY nombres, apellidos
    LIMIT 10;
  `;

  const params = tokens.map((t) => `%${t}%`);

  try {
    console.log("Executing SQL:", sql);
    console.log("Params:", params);
    const result = await query(sql, params);
    console.log("SQL result rows:", result.rows.length);

    const mapped = result.rows.map((row) => ({
      id: row.idcliente,
      nombres: row.nombres,
      apellidos: row.apellidos,
      carnet: row.carnet,
      celular: row.celular,
      nota: row.nota || "",
      estado: row.estado === 0,
    }));

    return mapped;
  } catch (error) {
    console.error("Error in searchClientes SQL query:", error);
    throw error;
  }
};

// ============================================
// CAJA: verificar / obtener / crear / movimientos
// ============================================
const verificarCajaAbierta = async (client, idcaja) => {
  const result = await client.query(
    `SELECT estado_caja FROM caja WHERE idcaja = $1`,
    [idcaja]
  );

  if (result.rows.length === 0) {
    throw new Error("No se encontró la caja");
  }

  if (result.rows[0].estado_caja !== "abierta") {
    throw new Error("La caja está cerrada. No se pueden realizar ventas.");
  }

  return result.rows[0].estado_caja;
};

const getEstadoCaja = async (idbodega, tipo) => {
  try {
    const result = await query(
      `SELECT estado_caja FROM caja WHERE idbodega = $1 AND tipo = $2`,
      [idbodega, tipo]
    );

    if (result.rows.length === 0) {
      return "cerrada";
    }

    return result.rows[0].estado_caja;
  } catch (error) {
    console.error("Error getting caja estado:", error);
    return "cerrada";
  }
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

  const nombre = tipo === "Efectivo" ? "Caja Efectivo" : "Caja QR";
  const newCaja = await client.query(
    `INSERT INTO caja (nombre, tipo, estado_caja, total, idbodega) 
     VALUES ($1, $2, 'cerrada', 0, $3) 
     RETURNING idcaja, total, estado_caja`,
    [nombre, tipo, idbodega]
  );

  return newCaja.rows[0];
};

const registrarMovimientoCaja = async (
  client,
  idcaja,
  idusuario,
  monto,
  tipo,
  descripcion,
  idventa = null
) => {
  const cajaActual = await client.query(
    `SELECT total FROM caja WHERE idcaja = $1`,
    [idcaja]
  );

  const montoAnterior =
    cajaActual.rows.length > 0 ? parseFloat(cajaActual.rows[0].total) : 0;
  let montoActual = montoAnterior;

  if (tipo === "ingreso" || tipo === "apertura") {
    montoActual = montoAnterior + monto;
  } else if (tipo === "egreso" || tipo === "cierre") {
    montoActual = montoAnterior - monto;
  }

  await client.query(
    `INSERT INTO movimiento_caja 
     (idcaja, idusuario, monto, tipo, descripcion, monto_anterior, monto_actual, idventa) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      idcaja,
      idusuario,
      monto,
      tipo,
      descripcion,
      montoAnterior,
      montoActual,
      idventa,
    ]
  );

  await client.query(
    `UPDATE caja SET total = $1 WHERE idcaja = $2`,
    [montoActual, idcaja]
  );

  return { montoAnterior, montoActual };
};

// ============================================
// PROCESAR VENTA
// ============================================
const processSale = async (saleData, userId, idbodega = null) => {
  console.log("🏪 processSale called with:", { userId, idbodega, saleData });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verificar usuario
    const userCheck = await client.query(
      "SELECT idusuario, idbodega FROM usuarios WHERE idusuario = $1 AND estado = 0",
      [userId]
    );

    if (userCheck.rows.length === 0) {
      throw new Error("Usuario no válido o inactivo");
    }

    if (!idbodega) {
      idbodega = userCheck.rows[0].idbodega;
      console.log("📦 Usando bodega del usuario:", idbodega);

      if (!idbodega) {
        throw new Error("El usuario no tiene una bodega asignada");
      }
    }

    console.log("🏢 Bodega final para la venta:", idbodega);

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
          `El producto ${item.idproducto} no existe o está inactivo`
        );
      }

      const stockDisponible = stockCheck.rows[0].stock || 0;
      if (stockDisponible < item.cantidad) {
        const productName = stockCheck.rows[0].nombre || "Producto";
        throw new Error(
          `Stock insuficiente para ${productName}. Stock disponible: ${stockDisponible}`
        );
      }
    }

    // Verificar caja según método de pago
    const metodoPago = saleData.metodo_pago || "Efectivo";
    console.log(`💰 Verificando caja ${metodoPago} para bodega ${idbodega}`);

    const caja = await getOrCreateCaja(client, idbodega, metodoPago);
    console.log(`📦 Caja ${metodoPago} encontrada:`, caja);

    await verificarCajaAbierta(client, caja.idcaja);
    console.log(`✅ Caja ${metodoPago} está abierta`);

    // Insertar venta
    const saleResult = await client.query(
      `INSERT INTO ventas (fecha_hora, idusuario, idbodega, idcliente, descripcion, sub_total, descuento, total, metodo_pago, descripcion_descuento) 
       VALUES (TIMEZONE('America/La_Paz', NOW()), $1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING idventa`,
      [
        userId,
        idbodega,
        saleData.idcliente || null,
        saleData.descripcion || "",
        saleData.sub_total || 0,
        saleData.descuento || 0,
        saleData.total || 0,
        saleData.metodo_pago || "Efectivo",
        saleData.descripcion_descuento || "",
      ]
    );

    const saleId = saleResult.rows[0].idventa;
    console.log("✅ Venta creada con ID:", saleId);

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
        ]
      );

      const updateStockResult = await client.query(
        `UPDATE producto_bodega 
         SET stock = stock - $1 
         WHERE idproducto = $2 AND idbodega = $3
         RETURNING stock`,
        [item.cantidad, item.idproducto, idbodega]
      );

      if (updateStockResult.rows.length === 0) {
        await client.query(
          `INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo)
           VALUES ($1, $2, -$3, 0)`,
          [item.idproducto, idbodega, item.cantidad]
        );
      }

      console.log(
        `📦 Stock actualizado para producto ${item.idproducto} en bodega ${idbodega}`
      );
    }

    // Registrar movimiento en caja
    const totalVenta = parseFloat(saleData.total) || 0;
    console.log(
      `💰 Registrando venta en caja ${metodoPago} por Bs ${totalVenta}`
    );

    const descripcionMovimiento =
      saleData.descripcion || "Venta de productos";

    await registrarMovimientoCaja(
      client,
      caja.idcaja,
      userId,
      totalVenta,
      "ingreso",
      descripcionMovimiento,
      saleId
    );

    console.log(`✅ Movimiento de caja registrado para venta #${saleId}`);

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
  getEstadoCaja,
};