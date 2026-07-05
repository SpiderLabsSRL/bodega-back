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

  getTodasBodegas: async () => {
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
    
    const currentResult = await query(
      `SELECT idbodega, nombre, tipo, direccion, telefono, estado FROM bodegas WHERE idbodega = $1`,
      [id]
    );
    
    if (currentResult.rows.length === 0) {
      throw new Error("Bodega no encontrada");
    }
    
    const current = currentResult.rows[0];
    
    const finalNombre = nombre !== undefined ? nombre : current.nombre;
    const finalTipo = tipo !== undefined ? tipo : current.tipo;
    const finalDireccion = direccion !== undefined ? direccion : current.direccion;
    const finalTelefono = telefono !== undefined ? telefono : current.telefono;
    const finalEstado = estado !== undefined ? estado : current.estado;
    
    if (finalTipo && !['Principal', 'Sucursal'].includes(finalTipo)) {
      throw new Error("Tipo de bodega inválido. Debe ser 'Principal' o 'Sucursal'");
    }
    
    const result = await query(
      `UPDATE bodegas 
       SET nombre = $1, tipo = $2, direccion = $3, telefono = $4, estado = $5 
       WHERE idbodega = $6 
       RETURNING idbodega, nombre, tipo, direccion, telefono, estado`,
      [finalNombre, finalTipo, finalDireccion, finalTelefono, finalEstado, id]
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
  // FUNCIONES PARA UBICACIONES
  // ============================================

  getUbicaciones: async (idbodega = null) => {
    let queryText = `SELECT idubicacion, nombre, estado, idbodega FROM ubicaciones WHERE estado = 0`;
    const params = [];
    
    if (idbodega) {
      queryText += ` AND idbodega = $1`;
      params.push(idbodega);
    }
    
    queryText += ` ORDER BY nombre`;
    const result = await query(queryText, params);
    return result.rows;
  },

  createUbicacion: async (data) => {
    const { nombre, idbodega } = data;
    const result = await query(
      `INSERT INTO ubicaciones (nombre, idbodega, estado) 
       VALUES ($1, $2, 0) 
       RETURNING idubicacion, nombre, estado, idbodega`,
      [nombre, idbodega || null]
    );
    return result.rows[0];
  },

  updateUbicacion: async (id, data) => {
    const { nombre, idbodega } = data;
    const result = await query(
      `UPDATE ubicaciones 
       SET nombre = $1, idbodega = $2
       WHERE idubicacion = $3 AND estado = 0
       RETURNING idubicacion, nombre, estado, idbodega`,
      [nombre, idbodega || null, id]
    );
    return result.rows[0];
  },

  deleteUbicacion: async (id) => {
    const result = await query(
      `UPDATE ubicaciones SET estado = 2 WHERE idubicacion = $1 RETURNING idubicacion`,
      [id]
    );
    
    if (result.rows.length === 0) {
      throw new Error("Ubicación no encontrada");
    }
  },

  // ============================================
  // FUNCIONES PARA CATEGORÍAS
  // ============================================

  getCategorias: async () => {
    const result = await query(
      `SELECT idcategoria, nombre, estado FROM categorias WHERE estado = 0 ORDER BY nombre`
    );
    return result.rows;
  },

  createCategoria: async (data) => {
    const { nombre } = data;
    const result = await query(
      `INSERT INTO categorias (nombre, estado) 
       VALUES ($1, 0) 
       RETURNING idcategoria, nombre, estado`,
      [nombre]
    );
    return result.rows[0];
  },

  updateCategoria: async (id, data) => {
    const { nombre } = data;
    const result = await query(
      `UPDATE categorias 
       SET nombre = $1
       WHERE idcategoria = $2 AND estado = 0
       RETURNING idcategoria, nombre, estado`,
      [nombre, id]
    );
    return result.rows[0];
  },

  deleteCategoria: async (id) => {
    const result = await query(
      `UPDATE categorias SET estado = 2 WHERE idcategoria = $1 RETURNING idcategoria`,
      [id]
    );
    
    if (result.rows.length === 0) {
      throw new Error("Categoría no encontrada");
    }
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
         COALESCE(
           (SELECT json_agg(
             json_build_object(
               'idubicacion', u.idubicacion,
               'nombre', u.nombre,
               'idbodega', u.idbodega
             )
           ) FROM producto_ubicacion_bodega pub
           JOIN ubicaciones u ON pub.idubicacion = u.idubicacion
           WHERE pub.idproducto = p.idproducto AND pub.idbodega = $1 AND u.estado = 0),
           '[]'
         ) as ubicaciones,
         COALESCE(
           (SELECT json_agg(c.nombre) 
            FROM producto_categorias pc 
            JOIN categorias c ON pc.idcategoria = c.idcategoria 
            WHERE pc.idproducto = p.idproducto AND c.estado = 0),
           '[]'
         ) as categorias,
         p.imagen,
         p.precio_venta,
         p.precio_compra,
         p.codigo_barras,
         pb.stock,
         pb.stock_minimo,
         pb.idbodega,
         b.nombre as bodega_nombre,
         COALESCE(
           (SELECT json_agg(
             json_build_object(
               'idproducto_similar', ps.idproducto_similar,
               'nombre', p2.nombre
             )
           ) FROM productos_similares ps
           JOIN productos p2 ON ps.idproducto_similar = p2.idproducto
           WHERE ps.idproducto = p.idproducto AND p2.estado = 0),
           '[]'
         ) as productos_similares
       FROM productos p
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
         COALESCE(
           (SELECT json_agg(
             json_build_object(
               'idubicacion', u.idubicacion,
               'nombre', u.nombre,
               'idbodega', u.idbodega
             )
           ) FROM producto_ubicacion_bodega pub
           JOIN ubicaciones u ON pub.idubicacion = u.idubicacion
           WHERE pub.idproducto = p.idproducto AND u.estado = 0),
           '[]'
         ) as ubicaciones,
         COALESCE(
           (SELECT json_agg(c.nombre) 
            FROM producto_categorias pc 
            JOIN categorias c ON pc.idcategoria = c.idcategoria 
            WHERE pc.idproducto = p.idproducto AND c.estado = 0),
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
         ) as bodegas_stock,
         COALESCE(
           (SELECT json_agg(
             json_build_object(
               'idproducto_similar', ps.idproducto_similar,
               'nombre', p2.nombre
             )
           ) FROM productos_similares ps
           JOIN productos p2 ON ps.idproducto_similar = p2.idproducto
           WHERE ps.idproducto = p.idproducto AND p2.estado = 0),
           '[]'
         ) as productos_similares
       FROM productos p
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
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'idubicacion', u.idubicacion,
              'nombre', u.nombre,
              'idbodega', u.idbodega
            )
          ) FROM producto_ubicacion_bodega pub
          JOIN ubicaciones u ON pub.idubicacion = u.idubicacion
          WHERE pub.idproducto = p.idproducto AND u.estado = 0),
          '[]'
        ) as ubicaciones,
        COALESCE(
          (SELECT json_agg(c.nombre) 
           FROM producto_categorias pc 
           JOIN categorias c ON pc.idcategoria = c.idcategoria 
           WHERE pc.idproducto = p.idproducto AND c.estado = 0),
          '[]'
        ) as categorias,
        p.imagen,
        p.precio_venta,
        p.precio_compra,
        p.codigo_barras,
        pb.stock,
        pb.stock_minimo,
        pb.idbodega,
        b.nombre as bodega_nombre,
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'idproducto_similar', ps.idproducto_similar,
              'nombre', p2.nombre
            )
          ) FROM productos_similares ps
          JOIN productos p2 ON ps.idproducto_similar = p2.idproducto
          WHERE ps.idproducto = p.idproducto AND p2.estado = 0),
          '[]'
        ) as productos_similares
      FROM productos p
      LEFT JOIN producto_bodega pb ON p.idproducto = pb.idproducto
      LEFT JOIN bodegas b ON pb.idbodega = b.idbodega
      WHERE p.estado = 0
        AND (
          p.nombre ILIKE $1 OR 
          p.codigo_barras ILIKE $1 OR
          EXISTS (
            SELECT 1 FROM producto_categorias pc 
            JOIN categorias c ON pc.idcategoria = c.idcategoria 
            WHERE pc.idproducto = p.idproducto AND c.nombre ILIKE $1 AND c.estado = 0
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
         COALESCE(
           (SELECT json_agg(
             json_build_object(
               'idubicacion', u.idubicacion,
               'nombre', u.nombre,
               'idbodega', u.idbodega
             )
           ) FROM producto_ubicacion_bodega pub
           JOIN ubicaciones u ON pub.idubicacion = u.idubicacion
           WHERE pub.idproducto = p.idproducto AND u.estado = 0),
           '[]'
         ) as ubicaciones,
         COALESCE(
           (SELECT json_agg(c.nombre) 
            FROM producto_categorias pc 
            JOIN categorias c ON pc.idcategoria = c.idcategoria 
            WHERE pc.idproducto = p.idproducto AND c.estado = 0),
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
         ) as bodegas_stock,
         COALESCE(
           (SELECT json_agg(
             json_build_object(
               'idproducto_similar', ps.idproducto_similar,
               'nombre', p2.nombre
             )
           ) FROM productos_similares ps
           JOIN productos p2 ON ps.idproducto_similar = p2.idproducto
           WHERE ps.idproducto = p.idproducto AND p2.estado = 0),
           '[]'
         ) as productos_similares
       FROM productos p
       WHERE p.idproducto = $1 AND p.estado = 0`,
      [id]
    );
    return result.rows[0];
  },

  // ============================================
  // FUNCIONES PARA PRODUCTO_UBICACION_BODEGA
  // ============================================

  getUbicacionesByProductoBodega: async (idproducto, idbodega) => {
    const result = await query(
      `SELECT u.idubicacion, u.nombre, u.estado, u.idbodega
       FROM producto_ubicacion_bodega pub
       JOIN ubicaciones u ON pub.idubicacion = u.idubicacion
       WHERE pub.idproducto = $1 AND pub.idbodega = $2 AND u.estado = 0
       ORDER BY u.nombre`,
      [idproducto, idbodega]
    );
    return result.rows;
  },

  asignarUbicacionProductoBodega: async (idproducto, idbodega, idubicacion) => {
    // Verificar que la ubicación existe y está activa
    const ubicacionResult = await query(
      `SELECT idubicacion FROM ubicaciones WHERE idubicacion = $1 AND estado = 0`,
      [idubicacion]
    );
    if (ubicacionResult.rows.length === 0) {
      throw new Error("Ubicación no encontrada o inactiva");
    }

    // Verificar que el producto existe
    const productoResult = await query(
      `SELECT idproducto FROM productos WHERE idproducto = $1 AND estado = 0`,
      [idproducto]
    );
    if (productoResult.rows.length === 0) {
      throw new Error("Producto no encontrado");
    }

    // Verificar que la bodega existe
    const bodegaResult = await query(
      `SELECT idbodega FROM bodegas WHERE idbodega = $1 AND estado = 0`,
      [idbodega]
    );
    if (bodegaResult.rows.length === 0) {
      throw new Error("Bodega no encontrada o inactiva");
    }

    // Verificar que el producto existe en la bodega
    const pbResult = await query(
      `SELECT idproducto_bodega FROM producto_bodega WHERE idproducto = $1 AND idbodega = $2`,
      [idproducto, idbodega]
    );
    if (pbResult.rows.length === 0) {
      throw new Error("El producto no está registrado en esta bodega");
    }

    // Insertar la relación
    const result = await query(
      `INSERT INTO producto_ubicacion_bodega (idproducto, idbodega, idubicacion)
       VALUES ($1, $2, $3)
       ON CONFLICT (idproducto, idbodega, idubicacion) DO NOTHING
       RETURNING idproducto, idbodega, idubicacion`,
      [idproducto, idbodega, idubicacion]
    );

    if (result.rows.length === 0) {
      // Si no se insertó, es porque ya existía
      return { 
        idproducto, 
        idbodega, 
        idubicacion, 
        message: "La ubicación ya estaba asignada a este producto en esta bodega" 
      };
    }

    return result.rows[0];
  },

  eliminarUbicacionProductoBodega: async (idproducto, idbodega, idubicacion) => {
    const result = await query(
      `DELETE FROM producto_ubicacion_bodega 
       WHERE idproducto = $1 AND idbodega = $2 AND idubicacion = $3
       RETURNING idproducto`,
      [idproducto, idbodega, idubicacion]
    );

    if (result.rows.length === 0) {
      throw new Error("No se encontró la relación producto-ubicación-bodega");
    }
  },

  // ============================================
  // FUNCIONES PARA CREAR/ACTUALIZAR PRODUCTOS
  // ============================================

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
        ubicaciones,
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

      let codigoBarrasFinal = codigo_barras && codigo_barras.trim() !== "" 
        ? codigo_barras.trim() 
        : null;

      if (codigoBarrasFinal) {
        const existingByCode = await client.query(
          `SELECT idproducto FROM productos WHERE codigo_barras = $1 AND estado = 0`,
          [codigoBarrasFinal]
        );
        
        if (existingByCode.rows.length > 0) {
          const baseCode = codigoBarrasFinal;
          let counter = 1;
          let newCode = baseCode;
          
          while (true) {
            const checkResult = await client.query(
              `SELECT idproducto FROM productos WHERE codigo_barras = $1 AND estado = 0`,
              [newCode]
            );
            if (checkResult.rows.length === 0) break;
            newCode = `${baseCode}-${counter}`;
            counter++;
          }
          codigoBarrasFinal = newCode;
        }
      }

      let existingProduct = null;
      if (!codigoBarrasFinal) {
        const existingResult = await client.query(
          `SELECT idproducto FROM productos WHERE nombre = $1 AND estado = 0`,
          [nombre]
        );
        if (existingResult.rows.length > 0) {
          existingProduct = existingResult.rows[0];
        }
      }

      let idproducto;

      if (existingProduct) {
        idproducto = existingProduct.idproducto;
        
        const existingInBodega = await client.query(
          `SELECT idproducto_bodega FROM producto_bodega 
           WHERE idproducto = $1 AND idbodega = $2`,
          [idproducto, bodegaId]
        );

        if (existingInBodega.rows.length > 0) {
          await client.query(
            `UPDATE producto_bodega 
             SET stock = stock + $1, stock_minimo = $2
             WHERE idproducto = $3 AND idbodega = $4`,
            [stock || 0, stock_minimo || 0, idproducto, bodegaId]
          );
        } else {
          await client.query(
            `INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo)
             VALUES ($1, $2, $3, $4)`,
            [idproducto, bodegaId, stock || 0, stock_minimo || 0]
          );
        }
      } else {
        const productoResult = await client.query(
          `INSERT INTO productos (
            nombre, descripcion, imagen, precio_venta, 
            precio_compra, codigo_barras, estado
          ) VALUES ($1, $2, $3, $4, $5, $6, 0)
          RETURNING idproducto`,
          [
            nombre,
            descripcion || "",
            imagenBuffer,
            precio_venta || 0,
            precio_compra || 0,
            codigoBarrasFinal,
          ]
        );

        idproducto = productoResult.rows[0].idproducto;

        if (!codigoBarrasFinal) {
          const autoCode = `COD-${idproducto}`;
          await client.query(
            `UPDATE productos SET codigo_barras = $1 WHERE idproducto = $2`,
            [autoCode, idproducto]
          );
        }

        await client.query(
          `INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo)
           VALUES ($1, $2, $3, $4)`,
          [idproducto, bodegaId, stock || 0, stock_minimo || 0]
        );

        // Asignar ubicaciones al producto en esta bodega
        if (ubicaciones && Array.isArray(ubicaciones) && ubicaciones.length > 0) {
          for (const ubicacionId of ubicaciones) {
            const idUbicacion = typeof ubicacionId === 'string' ? parseInt(ubicacionId) : ubicacionId;
            if (!isNaN(idUbicacion) && idUbicacion > 0) {
              await client.query(
                `INSERT INTO producto_ubicacion_bodega (idproducto, idbodega, idubicacion)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (idproducto, idbodega, idubicacion) DO NOTHING`,
                [idproducto, bodegaId, idUbicacion]
              );
            }
          }
        }

        if (categorias && Array.isArray(categorias) && categorias.length > 0) {
          for (const categoria of categorias) {
            const idCategoria = typeof categoria === 'string' ? parseInt(categoria) : categoria;
            if (!isNaN(idCategoria) && idCategoria > 0) {
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
            if (!isNaN(idSimilarNum) && idSimilarNum > 0 && idSimilarNum !== idproducto) {
              const existe = await client.query(
                `SELECT 1 FROM productos_similares 
                 WHERE (idproducto = $1 AND idproducto_similar = $2) 
                 OR (idproducto = $2 AND idproducto_similar = $1)`,
                [idproducto, idSimilarNum]
              );
              if (existe.rows.length === 0) {
                await client.query(
                  `INSERT INTO productos_similares (idproducto, idproducto_similar) 
                   VALUES ($1, $2), ($2, $1)`,
                  [idproducto, idSimilarNum]
                );
              }
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

      const productoActual = await client.query(
        `SELECT nombre, descripcion, precio_venta, precio_compra, codigo_barras, imagen 
         FROM productos WHERE idproducto = $1`,
        [id]
      );

      if (productoActual.rows.length === 0) {
        throw new Error("Producto no encontrado");
      }

      const actual = productoActual.rows[0];

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
        ubicaciones,
        categorias,
        precio_venta,
        precio_compra,
        stock,
        stock_minimo,
        codigo_barras,
        idbodega,
        productos_similares,
      } = productoData;

      let codigoBarrasFinal = actual.codigo_barras;
      
      if (codigo_barras !== undefined && codigo_barras !== null) {
        if (codigo_barras.trim() !== "") {
          codigoBarrasFinal = codigo_barras.trim();
        } else {
          codigoBarrasFinal = actual.codigo_barras || null;
        }
      }

      const finalNombre = nombre || actual.nombre;
      const finalDescripcion = descripcion !== undefined && descripcion !== null ? descripcion : actual.descripcion;
      const finalPrecioVenta = precio_venta !== undefined && precio_venta !== null ? precio_venta : parseFloat(actual.precio_venta);
      const finalPrecioCompra = precio_compra !== undefined && precio_compra !== null ? precio_compra : parseFloat(actual.precio_compra);

      let updateQuery = `
        UPDATE productos SET 
          nombre = $1, 
          descripcion = $2, 
          precio_venta = $3, 
          precio_compra = $4,
          codigo_barras = $5
      `;
      const queryParams = [
        finalNombre,
        finalDescripcion || "",
        finalPrecioVenta || 0,
        finalPrecioCompra || 0,
        codigoBarrasFinal,
      ];

      if (imagenBuffer) {
        updateQuery += `, imagen = $6 WHERE idproducto = $7`;
        queryParams.push(imagenBuffer, id);
      } else {
        updateQuery += ` WHERE idproducto = $6`;
        queryParams.push(id);
      }

      await client.query(updateQuery, queryParams);

      // Actualizar stock en la bodega
      if (idbodega && stock !== undefined && stock !== null) {
        const existingInBodega = await client.query(
          `SELECT idproducto_bodega FROM producto_bodega 
           WHERE idproducto = $1 AND idbodega = $2`,
          [id, idbodega]
        );

        const stockFinal = typeof stock === 'number' ? stock : parseInt(stock) || 0;
        const stockMinimoFinal = typeof stock_minimo === 'number' ? stock_minimo : parseInt(stock_minimo) || 0;

        if (existingInBodega.rows.length > 0) {
          await client.query(
            `UPDATE producto_bodega 
             SET stock = $1, stock_minimo = $2
             WHERE idproducto = $3 AND idbodega = $4`,
            [stockFinal, stockMinimoFinal, id, idbodega]
          );
        } else {
          await client.query(
            `INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo)
             VALUES ($1, $2, $3, $4)`,
            [id, idbodega, stockFinal, stockMinimoFinal]
          );
        }
      }

      // Actualizar ubicaciones
      if (ubicaciones && Array.isArray(ubicaciones)) {
        // Eliminar ubicaciones existentes para esta bodega si se especificó idbodega
        if (idbodega) {
          await client.query(
            `DELETE FROM producto_ubicacion_bodega 
             WHERE idproducto = $1 AND idbodega = $2`,
            [id, idbodega]
          );
        } else {
          // Si no se especificó bodega, usar la bodega principal (1)
          await client.query(
            `DELETE FROM producto_ubicacion_bodega 
             WHERE idproducto = $1 AND idbodega = $2`,
            [id, 1]
          );
        }
        
        if (ubicaciones.length > 0) {
          const bodegaParaUbicaciones = idbodega || 1;
          for (const ubicacionId of ubicaciones) {
            const idUbicacion = typeof ubicacionId === 'string' ? parseInt(ubicacionId) : ubicacionId;
            if (!isNaN(idUbicacion) && idUbicacion > 0) {
              await client.query(
                `INSERT INTO producto_ubicacion_bodega (idproducto, idbodega, idubicacion)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (idproducto, idbodega, idubicacion) DO NOTHING`,
                [id, bodegaParaUbicaciones, idUbicacion]
              );
            }
          }
        }
      }

      // Actualizar categorías
      if (categorias && Array.isArray(categorias)) {
        await client.query(
          "DELETE FROM producto_categorias WHERE idproducto = $1",
          [id]
        );
        
        if (categorias.length > 0) {
          for (const categoria of categorias) {
            const idCategoria = typeof categoria === 'string' ? parseInt(categoria) : categoria;
            if (!isNaN(idCategoria) && idCategoria > 0) {
              await client.query(
                "INSERT INTO producto_categorias (idproducto, idcategoria) VALUES ($1, $2)",
                [id, idCategoria]
              );
            }
          }
        }
      }

      // Actualizar productos similares
      if (productos_similares && Array.isArray(productos_similares)) {
        await client.query(
          "DELETE FROM productos_similares WHERE idproducto = $1 OR idproducto_similar = $1",
          [id]
        );
        
        if (productos_similares.length > 0) {
          for (const idSimilar of productos_similares) {
            const idSimilarNum = typeof idSimilar === 'string' ? parseInt(idSimilar) : idSimilar;
            if (!isNaN(idSimilarNum) && idSimilarNum > 0 && idSimilarNum !== id) {
              await client.query(
                `INSERT INTO productos_similares (idproducto, idproducto_similar) 
                 VALUES ($1, $2), ($2, $1)`,
                [id, idSimilarNum]
              );
            }
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

  // ============================================
  // FUNCIONES PARA TRANSFERENCIAS
  // ============================================

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

        // Copiar ubicaciones del producto al nuevo destino
        const ubicacionesOrigen = await client.query(
          `SELECT idubicacion FROM producto_ubicacion_bodega 
           WHERE idproducto = $1 AND idbodega = $2`,
          [idproducto, idbodegaOrigen]
        );

        for (const ubicacion of ubicacionesOrigen.rows) {
          await client.query(
            `INSERT INTO producto_ubicacion_bodega (idproducto, idbodega, idubicacion)
             VALUES ($1, $2, $3)
             ON CONFLICT (idproducto, idbodega, idubicacion) DO NOTHING`,
            [idproducto, idbodegaDestino, ubicacion.idubicacion]
          );
        }
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
};

module.exports = BodegaService;