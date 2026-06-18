// src/services/BodegaService.js
const { query, pool } = require("../../db");

const BodegaService = {
  // ============================================
  // FUNCIONES PARA BODEGAS
  // ============================================

  getAllBodegas: async () => {
    const result = await query(
      `SELECT idbodega, nombre, tipo, direccion, telefono, estado 
       FROM bodegas 
       ORDER BY nombre`
    );
    return result.rows;
  },

  getBodegasActivas: async () => {
    const result = await query(
      `SELECT idbodega, nombre, tipo, direccion, telefono, estado 
       FROM bodegas 
       WHERE estado = 0 
       ORDER BY nombre`
    );
    return result.rows;
  },

  getBodegaById: async (id) => {
    const result = await query(
      `SELECT idbodega, nombre, tipo, direccion, telefono, estado 
       FROM bodegas 
       WHERE idbodega = $1`,
      [id]
    );
    return result.rows[0];
  },

  createBodega: async (data) => {
    const { nombre, tipo, direccion, telefono } = data;
    const result = await query(
      `INSERT INTO bodegas (nombre, tipo, direccion, telefono, estado) 
       VALUES ($1, $2, $3, $4, 0) 
       RETURNING idbodega, nombre, tipo, direccion, telefono, estado`,
      [nombre, tipo, direccion, telefono]
    );
    return result.rows[0];
  },

  updateBodega: async (id, data) => {
    const { nombre, tipo, direccion, telefono, estado } = data;
    const result = await query(
      `UPDATE bodegas 
       SET nombre = $1, tipo = $2, direccion = $3, telefono = $4, estado = $5 
       WHERE idbodega = $6 
       RETURNING idbodega, nombre, tipo, direccion, telefono, estado`,
      [nombre, tipo, direccion, telefono, estado, id]
    );
    return result.rows[0];
  },

  updateBodegaEstado: async (id, estado) => {
    const result = await query(
      `UPDATE bodegas 
       SET estado = $1 
       WHERE idbodega = $2 
       RETURNING idbodega, nombre, tipo, direccion, telefono, estado`,
      [estado, id]
    );
    return result.rows[0];
  },

  // ============================================
  // FUNCIONES PARA PRODUCTOS EN BODEGA
  // ============================================

  getProductosByBodega: async (idbodega) => {
    const result = await query(
      `SELECT 
         p.idproducto,
         p.nombre,
         p.descripcion,
         p.estado,
         p.idubicacion,
         u.nombre as ubicacion_nombre,
         COALESCE(
           (SELECT json_agg(c.nombre) 
            FROM producto_categorias pc 
            JOIN categorias c ON pc.idcategoria = c.idcategoria 
            WHERE pc.idproducto = p.idproducto),
           '[]'
         ) as categorias,
         p.imagen,
         p.precio_venta,
         p.precio_compra,
         p.codigo_barras,
         pb.stock,
         pb.stock_minimo,
         pb.idbodega,
         b.nombre as bodega_nombre
       FROM productos p
       LEFT JOIN ubicaciones u ON p.idubicacion = u.idubicacion
       LEFT JOIN producto_bodega pb ON p.idproducto = pb.idproducto AND pb.idbodega = $1
       LEFT JOIN bodegas b ON pb.idbodega = b.idbodega
       WHERE p.estado = 0
       ORDER BY p.nombre`,
      [idbodega]
    );
    return result.rows;
  },

  getAllProductos: async () => {
    const result = await query(
      `SELECT 
         p.idproducto,
         p.nombre,
         p.descripcion,
         p.estado,
         p.idubicacion,
         u.nombre as ubicacion_nombre,
         COALESCE(
           (SELECT json_agg(c.nombre) 
            FROM producto_categorias pc 
            JOIN categorias c ON pc.idcategoria = c.idcategoria 
            WHERE pc.idproducto = p.idproducto),
           '[]'
         ) as categorias,
         p.imagen,
         p.precio_venta,
         p.precio_compra,
         p.codigo_barras,
         COALESCE(
           (SELECT json_agg(
             json_build_object(
               'idbodega', pb.idbodega,
               'bodega_nombre', b.nombre,
               'stock', pb.stock,
               'stock_minimo', pb.stock_minimo
             )
           ) FROM producto_bodega pb 
           LEFT JOIN bodegas b ON pb.idbodega = b.idbodega
           WHERE pb.idproducto = p.idproducto),
           '[]'
         ) as bodegas_stock
       FROM productos p
       LEFT JOIN ubicaciones u ON p.idubicacion = u.idubicacion
       WHERE p.estado = 0
       ORDER BY p.nombre`
    );
    return result.rows;
  },

  buscarProductos: async (termino, idbodega = null) => {
    let queryText = `
      SELECT 
        p.idproducto,
        p.nombre,
        p.descripcion,
        p.estado,
        p.idubicacion,
        u.nombre as ubicacion_nombre,
        COALESCE(
          (SELECT json_agg(c.nombre) 
           FROM producto_categorias pc 
           JOIN categorias c ON pc.idcategoria = c.idcategoria 
           WHERE pc.idproducto = p.idproducto),
          '[]'
        ) as categorias,
        p.imagen,
        p.precio_venta,
        p.precio_compra,
        p.codigo_barras,
        pb.stock,
        pb.stock_minimo,
        pb.idbodega,
        b.nombre as bodega_nombre
      FROM productos p
      LEFT JOIN ubicaciones u ON p.idubicacion = u.idubicacion
      LEFT JOIN producto_bodega pb ON p.idproducto = pb.idproducto
      LEFT JOIN bodegas b ON pb.idbodega = b.idbodega
      WHERE p.estado = 0
        AND (
          p.nombre ILIKE $1 OR 
          p.codigo_barras ILIKE $1 OR
          EXISTS (
            SELECT 1 FROM producto_categorias pc 
            JOIN categorias c ON pc.idcategoria = c.idcategoria 
            WHERE pc.idproducto = p.idproducto AND c.nombre ILIKE $1
          )
        )
    `;
    const params = [`%${termino}%`];

    if (idbodega) {
      queryText += ` AND pb.idbodega = $2`;
      params.push(idbodega);
    }

    queryText += ` ORDER BY p.nombre LIMIT 50`;
    const result = await query(queryText, params);
    return result.rows;
  },

  getProductoById: async (id) => {
    const result = await query(
      `SELECT 
         p.idproducto,
         p.nombre,
         p.descripcion,
         p.estado,
         p.idubicacion,
         u.nombre as ubicacion_nombre,
         COALESCE(
           (SELECT json_agg(c.nombre) 
            FROM producto_categorias pc 
            JOIN categorias c ON pc.idcategoria = c.idcategoria 
            WHERE pc.idproducto = p.idproducto),
           '[]'
         ) as categorias,
         p.imagen,
         p.precio_venta,
         p.precio_compra,
         p.codigo_barras,
         COALESCE(
           (SELECT json_agg(
             json_build_object(
               'idbodega', pb.idbodega,
               'bodega_nombre', b.nombre,
               'stock', pb.stock,
               'stock_minimo', pb.stock_minimo
             )
           ) FROM producto_bodega pb 
           LEFT JOIN bodegas b ON pb.idbodega = b.idbodega
           WHERE pb.idproducto = p.idproducto),
           '[]'
         ) as bodegas_stock
       FROM productos p
       LEFT JOIN ubicaciones u ON p.idubicacion = u.idubicacion
       WHERE p.idproducto = $1 AND p.estado = 0`,
      [id]
    );
    return result.rows[0];
  },

  createProducto: async (productoData, imagenFile) => {
    const client = await pool.connect();
    
    try {
      await client.query("BEGIN");

      let imagenBuffer = null;
      if (imagenFile) {
        if (imagenFile.buffer) {
          imagenBuffer = imagenFile.buffer;
        } else {
          imagenBuffer = Buffer.from(imagenFile);
        }
      }

      const {
        nombre,
        descripcion,
        idubicacion,
        categorias,
        precio_venta,
        precio_compra,
        stock,
        stock_minimo,
        codigo_barras,
        idbodega,
        productos_similares,
      } = productoData;

      const bodegaId = idbodega || 1;

      const productoResult = await client.query(
        `INSERT INTO productos (
          nombre, descripcion, idubicacion, imagen, precio_venta, 
          precio_compra, codigo_barras, estado
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
        RETURNING idproducto`,
        [
          nombre,
          descripcion || "",
          idubicacion || 1,
          imagenBuffer,
          precio_venta || 0,
          precio_compra || 0,
          codigo_barras || null,
        ]
      );

      const idproducto = productoResult.rows[0].idproducto;

      await client.query(
        `INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo)
         VALUES ($1, $2, $3, $4)`,
        [idproducto, bodegaId, stock || 0, stock_minimo || 0]
      );

      if (categorias && Array.isArray(categorias) && categorias.length > 0) {
        for (const categoria of categorias) {
          const idCategoria = typeof categoria === 'string' ? parseInt(categoria) : categoria;
          if (!isNaN(idCategoria)) {
            await client.query(
              "INSERT INTO producto_categorias (idproducto, idcategoria) VALUES ($1, $2)",
              [idproducto, idCategoria]
            );
          }
        }
      }

      if (productos_similares && Array.isArray(productos_similares) && productos_similares.length > 0) {
        for (const idSimilar of productos_similares) {
          const idSimilarNum = typeof idSimilar === 'string' ? parseInt(idSimilar) : idSimilar;
          if (!isNaN(idSimilarNum) && idSimilarNum !== idproducto) {
            const existe = await client.query(
              "SELECT 1 FROM productos_similares WHERE (idproducto = $1 AND idproducto_similar = $2) OR (idproducto = $2 AND idproducto_similar = $1)",
              [idproducto, idSimilarNum]
            );
            if (existe.rows.length === 0) {
              await client.query(
                "INSERT INTO productos_similares (idproducto, idproducto_similar) VALUES ($1, $2), ($2, $1)",
                [idproducto, idSimilarNum]
              );
            }
          }
        }
      }

      await client.query("COMMIT");

      return await BodegaService.getProductoById(idproducto);
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

      const existe = await client.query(
        "SELECT idproducto FROM productos WHERE idproducto = $1 AND estado = 0",
        [id]
      );
      if (existe.rows.length === 0) {
        throw new Error("Producto no encontrado");
      }

      let imagenBuffer = null;
      if (imagenFile) {
        if (imagenFile.buffer) {
          imagenBuffer = imagenFile.buffer;
        } else {
          imagenBuffer = Buffer.from(imagenFile);
        }
      }

      const {
        nombre,
        descripcion,
        idubicacion,
        categorias,
        precio_venta,
        precio_compra,
        stock,
        stock_minimo,
        codigo_barras,
        idbodega,
        productos_similares,
      } = productoData;

      let updateQuery = `
        UPDATE productos SET 
          nombre = $1, 
          descripcion = $2, 
          idubicacion = $3,
          precio_venta = $4, 
          precio_compra = $5,
          codigo_barras = $6
      `;
      const queryParams = [
        nombre,
        descripcion || "",
        idubicacion || 1,
        precio_venta || 0,
        precio_compra || 0,
        codigo_barras || null,
      ];

      if (imagenBuffer) {
        updateQuery += `, imagen = $7 WHERE idproducto = $8`;
        queryParams.push(imagenBuffer, id);
      } else {
        updateQuery += ` WHERE idproducto = $7`;
        queryParams.push(id);
      }

      await client.query(updateQuery, queryParams);

      if (idbodega && stock !== undefined) {
        await client.query(
          `UPDATE producto_bodega 
           SET stock = $1, stock_minimo = $2
           WHERE idproducto = $3 AND idbodega = $4`,
          [stock, stock_minimo || 0, id, idbodega]
        );
      }

      await client.query(
        "DELETE FROM producto_categorias WHERE idproducto = $1",
        [id]
      );
      
      if (categorias && Array.isArray(categorias) && categorias.length > 0) {
        for (const categoria of categorias) {
          const idCategoria = typeof categoria === 'string' ? parseInt(categoria) : categoria;
          if (!isNaN(idCategoria)) {
            await client.query(
              "INSERT INTO producto_categorias (idproducto, idcategoria) VALUES ($1, $2)",
              [id, idCategoria]
            );
          }
        }
      }

      await client.query(
        "DELETE FROM productos_similares WHERE idproducto = $1 OR idproducto_similar = $1",
        [id]
      );
      
      if (productos_similares && Array.isArray(productos_similares) && productos_similares.length > 0) {
        for (const idSimilar of productos_similares) {
          const idSimilarNum = typeof idSimilar === 'string' ? parseInt(idSimilar) : idSimilar;
          if (!isNaN(idSimilarNum) && idSimilarNum !== id) {
            await client.query(
              "INSERT INTO productos_similares (idproducto, idproducto_similar) VALUES ($1, $2), ($2, $1)",
              [id, idSimilarNum]
            );
          }
        }
      }

      await client.query("COMMIT");

      return await BodegaService.getProductoById(id);
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
  },

  updateStock: async (idproducto, idbodega, cantidad) => {
    const result = await query(
      `UPDATE producto_bodega 
       SET stock = stock + $1 
       WHERE idproducto = $2 AND idbodega = $3
       RETURNING idproducto, idbodega, stock`,
      [cantidad, idproducto, idbodega]
    );
    if (result.rows.length === 0) {
      throw new Error("Producto no encontrado en esta bodega");
    }
    return result.rows[0];
  },

  transferirProducto: async (idproducto, idbodegaOrigen, idbodegaDestino, cantidad) => {
    const client = await pool.connect();
    
    try {
      await client.query("BEGIN");

      const productoOrigen = await client.query(
        `SELECT pb.idproducto, p.nombre, pb.stock, pb.idbodega
         FROM producto_bodega pb
         JOIN productos p ON pb.idproducto = p.idproducto
         WHERE pb.idproducto = $1 AND pb.idbodega = $2 AND p.estado = 0`,
        [idproducto, idbodegaOrigen]
      );

      if (productoOrigen.rows.length === 0) {
        throw new Error("Producto no encontrado en la bodega origen");
      }

      const producto = productoOrigen.rows[0];
      if (producto.stock < cantidad) {
        throw new Error("Stock insuficiente en bodega origen");
      }

      const bodegaDestino = await client.query(
        `SELECT idbodega, nombre FROM bodegas WHERE idbodega = $1 AND estado = 0`,
        [idbodegaDestino]
      );

      if (bodegaDestino.rows.length === 0) {
        throw new Error("Bodega destino no encontrada o inactiva");
      }

      await client.query(
        `UPDATE producto_bodega 
         SET stock = stock - $1 
         WHERE idproducto = $2 AND idbodega = $3`,
        [cantidad, idproducto, idbodegaOrigen]
      );

      const productoDestino = await client.query(
        `SELECT idproducto_bodega FROM producto_bodega 
         WHERE idproducto = $1 AND idbodega = $2`,
        [idproducto, idbodegaDestino]
      );

      if (productoDestino.rows.length > 0) {
        await client.query(
          `UPDATE producto_bodega 
           SET stock = stock + $1 
           WHERE idproducto = $2 AND idbodega = $3`,
          [cantidad, idproducto, idbodegaDestino]
        );
      } else {
        const stockMinimoResult = await client.query(
          `SELECT stock_minimo FROM producto_bodega 
           WHERE idproducto = $1 AND idbodega = $2`,
          [idproducto, idbodegaOrigen]
        );
        const stockMinimo = stockMinimoResult.rows[0]?.stock_minimo || 0;

        await client.query(
          `INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo)
           VALUES ($1, $2, $3, $4)`,
          [idproducto, idbodegaDestino, cantidad, stockMinimo]
        );
      }

      await client.query("COMMIT");
      return { success: true, message: "Transferencia realizada exitosamente" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  getMovimientos: async (idbodega = null, limit = null) => {
    let queryText = `
      SELECT 
        tc.idtransaccion as id,
        p.idproducto as producto_id,
        p.nombre as producto_nombre,
        CASE 
          WHEN tc.tipo_movimiento IN ('Ingreso', 'Apertura') THEN 'entrada'
          WHEN tc.tipo_movimiento IN ('Egreso', 'Cierre') THEN 'salida'
          ELSE 'entrada'
        END as tipo,
        CASE 
          WHEN tc.tipo_movimiento IN ('Ingreso', 'Apertura') THEN 0
          ELSE ABS(tc.monto)
        END as cantidad,
        tc.descripcion as destino,
        tc.fecha,
        u.nombres || ' ' || u.apellidos as usuario
      FROM transacciones_caja tc
      LEFT JOIN productos p ON p.idproducto = (
        SELECT idproducto 
        FROM productos 
        WHERE nombre ILIKE '%' || SUBSTRING(tc.descripcion FROM '([^:]+)') || '%'
        LIMIT 1
      )
      LEFT JOIN usuarios u ON tc.idusuario = u.idusuario
      WHERE tc.tipo_movimiento IN ('Ingreso', 'Egreso')
    `;

    const params = [];
    if (idbodega) {
      queryText += ` AND tc.idbodega = $1`;
      params.push(idbodega);
    }

    queryText += ` ORDER BY tc.fecha DESC`;

    if (limit) {
      queryText += ` LIMIT $${params.length + 1}`;
      params.push(parseInt(limit));
    }

    const result = await query(queryText, params);
    return result.rows;
  },

  getUbicaciones: async () => {
    const result = await query(
      `SELECT idubicacion, nombre, estado FROM ubicaciones WHERE estado = 0 ORDER BY nombre`
    );
    return result.rows;
  },

  getCategorias: async () => {
    const result = await query(
      `SELECT idcategoria, nombre, estado FROM categorias WHERE estado = 0 ORDER BY nombre`
    );
    return result.rows;
  },
};

module.exports = BodegaService;