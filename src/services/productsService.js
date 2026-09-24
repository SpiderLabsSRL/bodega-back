// src/services/productsService.js
const { query, pool } = require("../../db");

const productsService = {
  getUbicaciones: async (idbodega) => {
    const params = [];
    let sql = "SELECT idubicacion, nombre, idbodega FROM ubicaciones WHERE estado = 0";
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
      "SELECT idcategoria, nombre FROM categorias WHERE estado = 0 ORDER BY nombre",
    );
    return result.rows;
  },

  getTodosProductosSelect: async (idbodega) => {
    const params = [];
    let sql = `SELECT p.idproducto, p.nombre FROM productos p WHERE p.estado = 0`;
    if (idbodega) {
      sql += ` AND EXISTS (
        SELECT 1 FROM producto_bodega pb 
        WHERE pb.idproducto = p.idproducto AND pb.idbodega = $1
      )`;
      params.push(idbodega);
    }
    sql += " ORDER BY p.nombre";
    const result = await query(sql, params);
    return result.rows;
  },

  // ============================================
  // Obtener todas las relaciones de similares en UNA query
  // ============================================
  _getSimilaresMap: async (productoIds) => {
    if (!productoIds || productoIds.length === 0) return new Map();

    const result = await query(
      `SELECT DISTINCT idproducto, idproducto_similar
       FROM productos_similares
       WHERE idproducto = ANY($1::int[])
          OR idproducto_similar = ANY($1::int[])`,
      [productoIds],
    );

    const grafo = new Map();
    for (const row of result.rows) {
      if (!grafo.has(row.idproducto)) grafo.set(row.idproducto, new Set());
      if (!grafo.has(row.idproducto_similar))
        grafo.set(row.idproducto_similar, new Set());
      grafo.get(row.idproducto).add(row.idproducto_similar);
      grafo.get(row.idproducto_similar).add(row.idproducto);
    }

    const similaresMap = new Map();
    const todosSimilaresIds = new Set();

    for (const id of productoIds) {
      const visitados = new Set([id]);
      const cola = [id];
      while (cola.length > 0) {
        const actual = cola.shift();
        const vecinos = grafo.get(actual);
        if (vecinos) {
          for (const vecino of vecinos) {
            if (!visitados.has(vecino)) {
              visitados.add(vecino);
              cola.push(vecino);
            }
          }
        }
      }
      visitados.delete(id);
      const ids = Array.from(visitados);
      similaresMap.set(id, ids);
      ids.forEach((sid) => todosSimilaresIds.add(sid));
    }

    const nombresMap = new Map();
    if (todosSimilaresIds.size > 0) {
      const nombresResult = await query(
        `SELECT idproducto, nombre FROM productos
         WHERE idproducto = ANY($1::int[]) AND estado = 0`,
        [Array.from(todosSimilaresIds)],
      );
      for (const row of nombresResult.rows) {
        nombresMap.set(row.idproducto, row.nombre);
      }
    }

    const resultado = new Map();
    for (const [id, ids] of similaresMap.entries()) {
      resultado.set(
        id,
        ids
          .filter((sid) => nombresMap.has(sid))
          .map((sid) => ({ idproducto: sid, nombre: nombresMap.get(sid) }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      );
    }
    return resultado;
  },

  // ============================================
  // Mapear fila SIN convertir imagen a base64
  // ============================================
  _mapProductoRow: (producto, similaresMap) => {
    let ubicaciones = producto.ubicaciones || [];
    if (Array.isArray(ubicaciones)) {
      ubicaciones = ubicaciones.filter((u) => u && u.idubicacion !== null);
    }

    // La imagen se sirve por endpoint separado, aquí solo indicamos si existe
    const tieneImagen = !!producto.tiene_imagen;

    return {
      idproducto: producto.idproducto,
      nombre: producto.nombre,
      descripcion: producto.descripcion,
      ubicaciones: ubicaciones,
      categorias: producto.categorias?.filter((c) => c !== null) || [],
      estado: producto.estado,
      tiene_imagen: tieneImagen,
      imagen: tieneImagen
        ? `/api/productos/${producto.idproducto}/imagen`
        : null,
      precio_venta: producto.precio_venta,
      precio_compra: producto.precio_compra,
      stock: producto.stock || 0,
      stock_minimo: producto.stock_minimo || 0,
      codigo_barras: producto.codigo_barras,
      productos_similares: similaresMap.get(producto.idproducto) || [],
    };
  },

  // ============================================
  // Query base optimizada
  // ============================================
  _buildProductosQuery: ({
    whereExtra = "",
    params = [],
    idbodega = null,
    limit = null,
  }) => {
    const finalParams = [...params];
    let bodegaJoinFilter = "";
    let bodegaFilterSql = "TRUE";

    if (idbodega) {
      const paramIndex = finalParams.length + 1;
      bodegaJoinFilter = `AND pb.idbodega = $${paramIndex}`;
      bodegaFilterSql = `u.idbodega = $${paramIndex}`;
      finalParams.push(idbodega);
    }

    const sql = `
      SELECT 
        p.idproducto,
        p.nombre,
        p.descripcion,
        p.estado,
        (p.imagen IS NOT NULL) AS tiene_imagen,
        p.precio_venta,
        p.precio_compra,
        COALESCE(pb.stock, 0) AS stock,
        COALESCE(pb.stock_minimo, 0) AS stock_minimo,
        p.codigo_barras,
        COALESCE(cats.categorias, '[]'::json) AS categorias,
        COALESCE(ubis.ubicaciones, '[]'::json) AS ubicaciones
      FROM productos p
      LEFT JOIN producto_bodega pb 
        ON p.idproducto = pb.idproducto ${bodegaJoinFilter}
      LEFT JOIN LATERAL (
        SELECT json_agg(DISTINCT c.nombre) AS categorias
        FROM producto_categorias pc
        JOIN categorias c ON pc.idcategoria = c.idcategoria
        WHERE pc.idproducto = p.idproducto AND c.estado = 0
      ) cats ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(DISTINCT jsonb_build_object(
          'idubicacion', u.idubicacion,
          'nombre', u.nombre,
          'idbodega', u.idbodega
        )) AS ubicaciones
        FROM producto_ubicacion_bodega pub
        JOIN ubicaciones u ON pub.idubicacion = u.idubicacion
        WHERE pub.idproducto = p.idproducto AND u.estado = 0
          AND ${bodegaFilterSql}
      ) ubis ON TRUE
      WHERE p.estado = 0
        ${whereExtra}
      ORDER BY p.nombre
      ${limit ? `LIMIT ${parseInt(limit)}` : ""}
    `;

    return { sql, params: finalParams };
  },

  getTodosProductos: async (idbodega) => {
    const { sql, params } = productsService._buildProductosQuery({
      idbodega: idbodega ? parseInt(idbodega) : null,
    });
    const result = await query(sql, params);
    if (result.rows.length === 0) return [];

    const productoIds = result.rows.map((p) => p.idproducto);
    const similaresMap = await productsService._getSimilaresMap(productoIds);
    return result.rows.map((p) =>
      productsService._mapProductoRow(p, similaresMap),
    );
  },

  buscarProductos: async (termino, idbodega) => {
    const { sql, params } = productsService._buildProductosQuery({
      whereExtra: `AND (
        p.nombre ILIKE $1 OR 
        p.descripcion ILIKE $1 OR 
        p.codigo_barras ILIKE $1 OR
        EXISTS (
          SELECT 1 FROM producto_categorias pc2
          JOIN categorias c2 ON pc2.idcategoria = c2.idcategoria
          WHERE pc2.idproducto = p.idproducto 
            AND c2.nombre ILIKE $1 
            AND c2.estado = 0
        )
      )`,
      params: [`%${termino}%`],
      idbodega: idbodega ? parseInt(idbodega) : null,
      limit: 100,
    });
    const result = await query(sql, params);
    if (result.rows.length === 0) return [];

    const productoIds = result.rows.map((p) => p.idproducto);
    const similaresMap = await productsService._getSimilaresMap(productoIds);
    return result.rows.map((p) =>
      productsService._mapProductoRow(p, similaresMap),
    );
  },

  getProductoById: async (id, idbodega) => {
    const { sql, params } = productsService._buildProductosQuery({
      whereExtra: `AND p.idproducto = $1`,
      params: [id],
      idbodega: idbodega ? parseInt(idbodega) : null,
    });
    const result = await query(sql, params);
    if (result.rows.length === 0) throw new Error("Producto no encontrado");

    const productoIds = result.rows.map((p) => p.idproducto);
    const similaresMap = await productsService._getSimilaresMap(productoIds);
    return productsService._mapProductoRow(result.rows[0], similaresMap);
  },

  // ============================================
  // Obtener SOLO la imagen (endpoint dedicado, cacheable)
  // ============================================
  getProductoImagen: async (id) => {
    const result = await query(
      "SELECT imagen FROM productos WHERE idproducto = $1 AND estado = 0",
      [id],
    );
    if (result.rows.length === 0 || !result.rows[0].imagen) {
      return null;
    }
    return result.rows[0].imagen;
  },

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
            [id1, id2],
          );
          if (existe.rows.length === 0) {
            await client.query(
              "INSERT INTO productos_similares (idproducto, idproducto_similar) VALUES ($1, $2), ($2, $1)",
              [id1, id2],
            );
          }
        }
      }
    }
  },

  obtenerGrupoCompleto: async (client, productoId) => {
    const id = parseInt(productoId);
    const result = await client.query(
      `SELECT DISTINCT idproducto, idproducto_similar
       FROM productos_similares
       WHERE idproducto = $1 OR idproducto_similar = $1`,
      [id],
    );

    const idsRelacionados = new Set([id]);
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
          `SELECT DISTINCT idproducto, idproducto_similar
           FROM productos_similares
           WHERE idproducto = $1 OR idproducto_similar = $1`,
          [idActual],
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

  createProducto: async (productoData, imagenFile) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let imagenBuffer = null;
      if (imagenFile) {
        if (imagenFile.buffer) imagenBuffer = imagenFile.buffer;
        else if (imagenFile.data) imagenBuffer = Buffer.from(imagenFile.data);
        else imagenBuffer = Buffer.from(imagenFile);
      }

      const productoResult = await client.query(
        `INSERT INTO productos (
          nombre, descripcion, imagen, 
          precio_compra, precio_venta, codigo_barras, estado
        ) VALUES ($1, $2, $3, $4, $5, $6, 0) RETURNING idproducto`,
        [
          productoData.nombre,
          productoData.descripcion,
          imagenBuffer,
          productoData.precio_compra,
          productoData.precio_venta,
          productoData.codigo_barras || null,
        ],
      );

      const idproducto = productoResult.rows[0].idproducto;

      if (productoData.idbodega) {
        await client.query(
          `INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo) 
           VALUES ($1, $2, $3, $4)`,
          [
            idproducto,
            productoData.idbodega,
            productoData.stock || 0,
            productoData.stock_minimo || 0,
          ],
        );
      }

      if (productoData.ubicaciones && productoData.ubicaciones.length > 0) {
        for (const idubicacion of productoData.ubicaciones) {
          await client.query(
            `INSERT INTO producto_ubicacion_bodega (idproducto, idbodega, idubicacion) 
             VALUES ($1, $2, $3)`,
            [idproducto, productoData.idbodega, idubicacion],
          );
        }
      }

      if (productoData.categorias && productoData.categorias.length > 0) {
        for (const idcategoria of productoData.categorias) {
          await client.query(
            "INSERT INTO producto_categorias (idproducto, idcategoria) VALUES ($1, $2)",
            [idproducto, idcategoria],
          );
        }
      }

      if (
        productoData.productos_similares &&
        productoData.productos_similares.length > 0
      ) {
        const todosIds = [idproducto, ...productoData.productos_similares];
        await productsService.crearRelacionesTransitivas(client, todosIds);
      }

      await client.query("COMMIT");
      return await productsService.getProductoById(
        idproducto,
        productoData.idbodega,
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  updateProducto: async (id, productoData, imagenFile) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const productoExistente = await client.query(
        "SELECT idproducto FROM productos WHERE idproducto = $1 AND estado = 0",
        [id],
      );
      if (productoExistente.rows.length === 0) {
        throw new Error("Producto no encontrado");
      }

      let imagenBuffer = null;
      if (imagenFile) {
        if (imagenFile.buffer) imagenBuffer = imagenFile.buffer;
        else if (imagenFile.data) imagenBuffer = Buffer.from(imagenFile.data);
        else imagenBuffer = Buffer.from(imagenFile);
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
          ],
        );
      }

      await client.query(
        "DELETE FROM producto_ubicacion_bodega WHERE idproducto = $1",
        [id],
      );
      if (productoData.ubicaciones && productoData.ubicaciones.length > 0) {
        for (const idubicacion of productoData.ubicaciones) {
          await client.query(
            `INSERT INTO producto_ubicacion_bodega (idproducto, idbodega, idubicacion) 
             VALUES ($1, $2, $3)`,
            [id, productoData.idbodega, idubicacion],
          );
        }
      }

      await client.query(
        "DELETE FROM producto_categorias WHERE idproducto = $1",
        [id],
      );
      if (productoData.categorias && productoData.categorias.length > 0) {
        for (const idcategoria of productoData.categorias) {
          await client.query(
            "INSERT INTO producto_categorias (idproducto, idcategoria) VALUES ($1, $2)",
            [id, idcategoria],
          );
        }
      }

      const grupoActual = await productsService.obtenerGrupoCompleto(client, id);
      const todosIdsActuales = [id, ...grupoActual];
      for (const productoId of todosIdsActuales) {
        await client.query(
          "DELETE FROM productos_similares WHERE idproducto = $1 OR idproducto_similar = $1",
          [productoId],
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
      "UPDATE productos SET estado = 1 WHERE idproducto = $1",
      [id],
    );
    if (result.rowCount === 0) throw new Error("Producto no encontrado");
  },

  updateStockProducto: async (idproducto, cantidad, idbodega) => {
    if (!idbodega) throw new Error("Se requiere ID de bodega");

    const result = await query(
      `INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (idproducto, idbodega) 
       DO UPDATE SET stock = producto_bodega.stock + $3
       RETURNING idproducto`,
      [idproducto, idbodega, cantidad],
    );
    if (result.rows.length === 0) throw new Error("Producto no encontrado");
    return await productsService.getProductoById(idproducto, idbodega);
  },
};

module.exports = productsService;