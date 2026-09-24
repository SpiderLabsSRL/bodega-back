// src/services/productsService.js
const { query, pool } = require("../../db");

// ============================================
// CACHE SIMPLE EN MEMORIA (TTL corto)
// ============================================
const cache = new Map();
const CACHE_TTL = 30 * 1000; // 30 segundos

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(key, value) {
  cache.set(key, { value, ts: Date.now() });
}

function invalidateCache(prefix = "") {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

const productsService = {
  // ============================================
  // OPCIONES DE SELECCIÓN - FILTRADO POR BODEGA
  // ============================================
  getUbicaciones: async (idbodega) => {
    let sql = "SELECT idubicacion, nombre, estado, idbodega FROM ubicaciones WHERE estado = 0";
    const params = [];

    if (idbodega) {
      sql += " AND idbodega = $1";
      params.push(idbodega);
    }

    sql += " ORDER BY nombre";

    const result = await query(sql, params);
    return result.rows;
  },

  getCategorias: async () => {
    const result = await query(
      "SELECT idcategoria, nombre, estado FROM categorias WHERE estado = 0 ORDER BY nombre"
    );
    return result.rows;
  },

  getTodosProductosSelect: async (idbodega) => {
    let sql = `
      SELECT p.idproducto, p.nombre 
      FROM productos p
      WHERE p.estado = 0
    `;
    const params = [];

    if (idbodega) {
      sql += ` AND EXISTS (
        SELECT 1 FROM producto_bodega pb 
        WHERE pb.idproducto = p.idproducto 
        AND pb.idbodega = $1
      )`;
      params.push(idbodega);
    }

    sql += " ORDER BY p.nombre";

    const result = await query(sql, params);
    return result.rows;
  },

  // ============================================
  // HELPER: obtener productos similares en UNA SOLA QUERY
  // ============================================
  _getSimilaresMap: async (productoIds) => {
    if (!productoIds || productoIds.length === 0) return {};

    const result = await query(
      `
      SELECT 
        ps.idproducto,
        ps.idproducto_similar,
        p2.nombre AS similar_nombre
      FROM productos_similares ps
      JOIN productos p2 ON ps.idproducto_similar = p2.idproducto
      WHERE ps.idproducto = ANY($1::int[])
        AND p2.estado = 0
      `,
      [productoIds]
    );

    const map = {};
    for (const row of result.rows) {
      if (!map[row.idproducto]) map[row.idproducto] = [];
      map[row.idproducto].push({
        idproducto: row.idproducto_similar,
        nombre: row.similar_nombre,
      });
    }
    return map;
  },

  // ============================================
  // HELPER: convertir buffer a base64 (rápido)
  // ============================================
  _toBase64: (buffer) => {
    if (!buffer) return "";
    try {
      // Si ya es string (base64 guardado como texto)
      if (typeof buffer === "string") {
        if (buffer.startsWith("data:image")) return buffer;
        if (buffer.startsWith("http")) return buffer;
        // intentar base64 directo
        return `data:image/jpeg;base64,${buffer}`;
      }
      // Buffer de Postgres (bytea)
      if (Buffer.isBuffer(buffer)) {
        return `data:image/jpeg;base64,${buffer.toString("base64")}`;
      }
      // Uint8Array u objeto {type: 'Buffer', data: [...]}
      if (buffer.data && Array.isArray(buffer.data)) {
        return `data:image/jpeg;base64,${Buffer.from(buffer.data).toString("base64")}`;
      }
      if (Array.isArray(buffer)) {
        return `data:image/jpeg;base64,${Buffer.from(buffer).toString("base64")}`;
      }
      return "";
    } catch (e) {
      console.error("Error convirtiendo imagen:", e);
      return "";
    }
  },

  // ============================================
  // HELPER: mapear row a producto final
  // ============================================
  _mapProducto: (row, similaresMap, idbodega) => {
    let ubicaciones = row.ubicaciones || [];
    if (Array.isArray(ubicaciones)) {
      ubicaciones = ubicaciones.filter((u) => u && u.idubicacion !== null);
      if (idbodega) {
        ubicaciones = ubicaciones.filter(
          (u) => u.idbodega === parseInt(idbodega)
        );
      }
    }

    return {
      idproducto: row.idproducto,
      nombre: row.nombre,
      descripcion: row.descripcion,
      ubicaciones: ubicaciones,
      categorias: (row.categorias || []).filter((c) => c !== null),
      estado: row.estado,
      imagen: productsService._toBase64(row.imagen),
      precio_venta: row.precio_venta,
      precio_compra: row.precio_compra,
      stock: row.stock || 0,
      stock_minimo: row.stock_minimo || 0,
      codigo_barras: row.codigo_barras,
      productos_similares: similaresMap[row.idproducto] || [],
    };
  },

  // ============================================
  // GET TODOS LOS PRODUCTOS (OPTIMIZADO)
  // ============================================
  getTodosProductos: async (idbodega) => {
    const cacheKey = `todos:${idbodega || "all"}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    // UNA SOLA QUERY con subconsultas correlacionadas (evita producto cartesiano)
    let sql = `
      SELECT 
        p.idproducto,
        p.nombre,
        p.descripcion,
        p.estado,
        p.imagen,
        p.precio_venta,
        p.precio_compra,
        p.codigo_barras,
        COALESCE(pb.stock, 0) AS stock,
        COALESCE(pb.stock_minimo, 0) AS stock_minimo,
        COALESCE(
          (SELECT ARRAY_AGG(DISTINCT c.nombre)
           FROM producto_categorias pc
           JOIN categorias c ON pc.idcategoria = c.idcategoria
           WHERE pc.idproducto = p.idproducto AND c.estado = 0),
          ARRAY[]::varchar[]
        ) AS categorias,
        COALESCE(
          (SELECT JSON_AGG(
              jsonb_build_object(
                'idubicacion', u.idubicacion,
                'nombre', u.nombre,
                'idbodega', u.idbodega
              )
            )
           FROM producto_ubicacion_bodega pub
           JOIN ubicaciones u ON pub.idubicacion = u.idubicacion
           WHERE pub.idproducto = p.idproducto 
             AND u.estado = 0
             ${idbodega ? "AND pub.idbodega = $1" : ""}),
          '[]'::json
        ) AS ubicaciones
      FROM productos p
      LEFT JOIN producto_bodega pb 
        ON p.idproducto = pb.idproducto 
        ${idbodega ? "AND pb.idbodega = $1" : ""}
      WHERE p.estado = 0
      ORDER BY p.nombre
    `;

    const params = idbodega ? [idbodega] : [];
    const result = await query(sql, params);

    const ids = result.rows.map((r) => r.idproducto);
    const similaresMap = await productsService._getSimilaresMap(ids);

    const productos = result.rows.map((row) =>
      productsService._mapProducto(row, similaresMap, idbodega)
    );

    setCached(cacheKey, productos);
    return productos;
  },

  // ============================================
  // BUSCAR PRODUCTOS (OPTIMIZADO)
  // ============================================
  buscarProductos: async (termino, idbodega) => {
    const cacheKey = `buscar:${termino}:${idbodega || "all"}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    let sql = `
      SELECT 
        p.idproducto,
        p.nombre,
        p.descripcion,
        p.estado,
        p.imagen,
        p.precio_venta,
        p.precio_compra,
        p.codigo_barras,
        COALESCE(pb.stock, 0) AS stock,
        COALESCE(pb.stock_minimo, 0) AS stock_minimo,
        COALESCE(
          (SELECT ARRAY_AGG(DISTINCT c.nombre)
           FROM producto_categorias pc
           JOIN categorias c ON pc.idcategoria = c.idcategoria
           WHERE pc.idproducto = p.idproducto AND c.estado = 0),
          ARRAY[]::varchar[]
        ) AS categorias,
        COALESCE(
          (SELECT JSON_AGG(
              jsonb_build_object(
                'idubicacion', u.idubicacion,
                'nombre', u.nombre,
                'idbodega', u.idbodega
              )
            )
           FROM producto_ubicacion_bodega pub
           JOIN ubicaciones u ON pub.idubicacion = u.idubicacion
           WHERE pub.idproducto = p.idproducto 
             AND u.estado = 0
             ${idbodega ? "AND pub.idbodega = $2" : ""}),
          '[]'::json
        ) AS ubicaciones
      FROM productos p
      LEFT JOIN producto_bodega pb 
        ON p.idproducto = pb.idproducto 
        ${idbodega ? "AND pb.idbodega = $2" : ""}
      WHERE p.estado = 0
        AND (
          p.nombre ILIKE $1 
          OR p.descripcion ILIKE $1 
          OR p.codigo_barras ILIKE $1
          OR EXISTS (
            SELECT 1 FROM producto_categorias pc2
            JOIN categorias c2 ON pc2.idcategoria = c2.idcategoria
            WHERE pc2.idproducto = p.idproducto 
              AND c2.nombre ILIKE $1 
              AND c2.estado = 0
          )
        )
      ORDER BY p.nombre
      LIMIT 100
    `;

    const params = idbodega
      ? [`%${termino}%`, idbodega]
      : [`%${termino}%`];

    const result = await query(sql, params);

    const ids = result.rows.map((r) => r.idproducto);
    const similaresMap = await productsService._getSimilaresMap(ids);

    const productos = result.rows.map((row) =>
      productsService._mapProducto(row, similaresMap, idbodega)
    );

    setCached(cacheKey, productos);
    return productos;
  },

  // ============================================
  // GET PRODUCTO POR ID
  // ============================================
  getProductoById: async (id, idbodega) => {
    let sql = `
      SELECT 
        p.idproducto,
        p.nombre,
        p.descripcion,
        p.estado,
        p.imagen,
        p.precio_venta,
        p.precio_compra,
        p.codigo_barras,
        COALESCE(pb.stock, 0) AS stock,
        COALESCE(pb.stock_minimo, 0) AS stock_minimo,
        COALESCE(
          (SELECT ARRAY_AGG(DISTINCT c.nombre)
           FROM producto_categorias pc
           JOIN categorias c ON pc.idcategoria = c.idcategoria
           WHERE pc.idproducto = p.idproducto AND c.estado = 0),
          ARRAY[]::varchar[]
        ) AS categorias,
        COALESCE(
          (SELECT JSON_AGG(
              jsonb_build_object(
                'idubicacion', u.idubicacion,
                'nombre', u.nombre,
                'idbodega', u.idbodega
              )
            )
           FROM producto_ubicacion_bodega pub
           JOIN ubicaciones u ON pub.idubicacion = u.idubicacion
           WHERE pub.idproducto = p.idproducto 
             AND u.estado = 0
             ${idbodega ? "AND pub.idbodega = $2" : ""}),
          '[]'::json
        ) AS ubicaciones
      FROM productos p
      LEFT JOIN producto_bodega pb 
        ON p.idproducto = pb.idproducto 
        ${idbodega ? "AND pb.idbodega = $2" : ""}
      WHERE p.idproducto = $1 AND p.estado = 0
    `;

    const params = idbodega ? [id, idbodega] : [id];
    const result = await query(sql, params);

    if (result.rows.length === 0) {
      throw new Error("Producto no encontrado");
    }

    const similaresMap = await productsService._getSimilaresMap([id]);
    return productsService._mapProducto(result.rows[0], similaresMap, idbodega);
  },

  // ============================================
  // RELACIONES TRANSITIVAS (sin cambios)
  // ============================================
  crearRelacionesTransitivas: async (client, productoIds) => {
    if (!productoIds || productoIds.length < 2) return;

    const idsUnicos = [...new Set(productoIds.map((id) => parseInt(id)))];

    for (let i = 0; i < idsUnicos.length; i++) {
      for (let j = i + 1; j < idsUnicos.length; j++) {
        const id1 = idsUnicos[i];
        const id2 = idsUnicos[j];

        if (id1 !== id2) {
          const existe = await client.query(
            "SELECT 1 FROM productos_similares WHERE (idproducto = $1 AND idproducto_similar = $2) OR (idproducto = $2 AND idproducto_similar = $1)",
            [id1, id2]
          );

          if (existe.rows.length === 0) {
            await client.query(
              "INSERT INTO productos_similares (idproducto, idproducto_similar) VALUES ($1, $2), ($2, $1)",
              [id1, id2]
            );
          }
        }
      }
    }
  },

  obtenerGrupoCompleto: async (client, productoId) => {
    const id = parseInt(productoId);

    const result = await client.query(
      `
      SELECT DISTINCT idproducto, idproducto_similar
      FROM productos_similares
      WHERE idproducto = $1 OR idproducto_similar = $1
      `,
      [id]
    );

    const idsRelacionados = new Set();
    idsRelacionados.add(id);

    for (const row of result.rows) {
      idsRelacionados.add(row.idproducto);
      idsRelacionados.add(row.idproducto_similar);
    }

    let hayCambios = true;
    while (hayCambios) {
      hayCambios = false;
      const idsActuales = Array.from(idsRelacionados);

      for (const idActual of idsActuales) {
        const nuevasRelaciones = await client.query(
          `
          SELECT DISTINCT idproducto, idproducto_similar
          FROM productos_similares
          WHERE idproducto = $1 OR idproducto_similar = $1
          `,
          [idActual]
        );

        for (const row of nuevasRelaciones.rows) {
          if (!idsRelacionados.has(row.idproducto)) {
            idsRelacionados.add(row.idproducto);
            hayCambios = true;
          }
          if (!idsRelacionados.has(row.idproducto_similar)) {
            idsRelacionados.add(row.idproducto_similar);
            hayCambios = true;
          }
        }
      }
    }

    return Array.from(idsRelacionados).filter((idItem) => idItem !== id);
  },

  // ============================================
  // CREATE PRODUCTO
  // ============================================
  createProducto: async (productoData, imagenFile) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      let imagenBuffer = null;
      if (imagenFile) {
        if (imagenFile.buffer) {
          imagenBuffer = imagenFile.buffer;
        } else if (imagenFile.data) {
          imagenBuffer = Buffer.from(imagenFile.data);
        } else {
          imagenBuffer = Buffer.from(imagenFile);
        }
      }

      const productoResult = await client.query(
        `INSERT INTO productos (
          nombre, descripcion, imagen, 
          precio_compra, precio_venta, codigo_barras, estado
        ) VALUES ($1, $2, $3, $4, $5, $6, 0) RETURNING *`,
        [
          productoData.nombre,
          productoData.descripcion,
          imagenBuffer,
          productoData.precio_compra,
          productoData.precio_venta,
          productoData.codigo_barras || null,
        ]
      );

      const producto = productoResult.rows[0];

      if (productoData.idbodega) {
        await client.query(
          `INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo) 
           VALUES ($1, $2, $3, $4)`,
          [
            producto.idproducto,
            productoData.idbodega,
            productoData.stock || 0,
            productoData.stock_minimo || 0,
          ]
        );
      }

      if (productoData.ubicaciones && productoData.ubicaciones.length > 0) {
        for (const idubicacion of productoData.ubicaciones) {
          await client.query(
            `INSERT INTO producto_ubicacion_bodega (idproducto, idbodega, idubicacion) 
             VALUES ($1, $2, $3)`,
            [producto.idproducto, productoData.idbodega, idubicacion]
          );
        }
      }

      if (productoData.categorias && productoData.categorias.length > 0) {
        for (const idcategoria of productoData.categorias) {
          await client.query(
            "INSERT INTO producto_categorias (idproducto, idcategoria) VALUES ($1, $2)",
            [producto.idproducto, idcategoria]
          );
        }
      }

      if (
        productoData.productos_similares &&
        productoData.productos_similares.length > 0
      ) {
        const todosIds = [
          producto.idproducto,
          ...productoData.productos_similares,
        ];
        await productsService.crearRelacionesTransitivas(client, todosIds);
      }

      await client.query("COMMIT");

      invalidateCache();

      return await productsService.getProductoById(
        producto.idproducto,
        productoData.idbodega
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  // ============================================
  // UPDATE PRODUCTO
  // ============================================
  updateProducto: async (id, productoData, imagenFile) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const productoExistente = await client.query(
        "SELECT * FROM productos WHERE idproducto = $1 AND estado = 0",
        [id]
      );

      if (productoExistente.rows.length === 0) {
        throw new Error("Producto no encontrado");
      }

      let imagenBuffer = null;
      if (imagenFile) {
        if (imagenFile.buffer) {
          imagenBuffer = imagenFile.buffer;
        } else if (imagenFile.data) {
          imagenBuffer = Buffer.from(imagenFile.data);
        } else {
          imagenBuffer = Buffer.from(imagenFile);
        }
      }

      let updateQuery = `
        UPDATE productos SET 
          nombre = $1, 
          descripcion = $2,
          precio_compra = $3, 
          precio_venta = $4, 
          codigo_barras = $5
      `;

      const queryParams = [
        productoData.nombre,
        productoData.descripcion,
        productoData.precio_compra,
        productoData.precio_venta,
        productoData.codigo_barras || null,
      ];

      if (imagenBuffer) {
        updateQuery += `, imagen = $6 WHERE idproducto = $7`;
        queryParams.push(imagenBuffer, id);
      } else {
        updateQuery += ` WHERE idproducto = $6`;
        queryParams.push(id);
      }

      await client.query(updateQuery, queryParams);

      if (productoData.idbodega) {
        await client.query(
          `INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (idproducto, idbodega) 
           DO UPDATE SET stock = $3, stock_minimo = $4`,
          [
            id,
            productoData.idbodega,
            productoData.stock || 0,
            productoData.stock_minimo || 0,
          ]
        );
      }

      await client.query(
        "DELETE FROM producto_ubicacion_bodega WHERE idproducto = $1",
        [id]
      );
      if (productoData.ubicaciones && productoData.ubicaciones.length > 0) {
        for (const idubicacion of productoData.ubicaciones) {
          await client.query(
            `INSERT INTO producto_ubicacion_bodega (idproducto, idbodega, idubicacion) 
             VALUES ($1, $2, $3)`,
            [id, productoData.idbodega, idubicacion]
          );
        }
      }

      await client.query(
        "DELETE FROM producto_categorias WHERE idproducto = $1",
        [id]
      );
      if (productoData.categorias && productoData.categorias.length > 0) {
        for (const idcategoria of productoData.categorias) {
          await client.query(
            "INSERT INTO producto_categorias (idproducto, idcategoria) VALUES ($1, $2)",
            [id, idcategoria]
          );
        }
      }

      const grupoActual = await productsService.obtenerGrupoCompleto(
        client,
        id
      );
      const todosIdsActuales = [id, ...grupoActual];

      for (const productoId of todosIdsActuales) {
        await client.query(
          "DELETE FROM productos_similares WHERE idproducto = $1 OR idproducto_similar = $1",
          [productoId]
        );
      }

      if (
        productoData.productos_similares &&
        productoData.productos_similares.length > 0
      ) {
        const nuevosIds = [id, ...productoData.productos_similares];
        await productsService.crearRelacionesTransitivas(client, nuevosIds);
      }

      await client.query("COMMIT");

      invalidateCache();

      return await productsService.getProductoById(id, productoData.idbodega);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  deleteProducto: async (id) => {
    const result = await query(
      "UPDATE productos SET estado = 2 WHERE idproducto = $1",
      [id]
    );

    if (result.rowCount === 0) {
      throw new Error("Producto no encontrado");
    }

    invalidateCache();
  },

  updateStockProducto: async (idproducto, cantidad, idbodega) => {
    if (!idbodega) {
      throw new Error("Se requiere ID de bodega para actualizar el stock");
    }

    const result = await query(
      `INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (idproducto, idbodega) 
       DO UPDATE SET stock = producto_bodega.stock + $3
       RETURNING *`,
      [idproducto, idbodega, cantidad]
    );

    if (result.rows.length === 0) {
      throw new Error("Producto no encontrado");
    }

    invalidateCache();

    return await productsService.getProductoById(idproducto, idbodega);
  },
};

module.exports = productsService;