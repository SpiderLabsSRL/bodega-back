// src/services/productsService.js
const { query, pool } = require("../../db");

const productsService = {
  // Obtener opciones de selección - FILTRADO POR BODEGA
  getUbicaciones: async (idbodega) => {
    let sql = "SELECT * FROM ubicaciones WHERE estado = 0";
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
      "SELECT * FROM categorias WHERE estado = 0 ORDER BY nombre",
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

  getTodosProductos: async (idbodega) => {
    let sql = `
      SELECT 
        p.idproducto,
        p.nombre,
        p.descripcion,
        p.estado,
        p.imagen,
        p.precio_venta,
        p.precio_compra,
        COALESCE(pb.stock, 0) as stock,
        COALESCE(pb.stock_minimo, 0) as stock_minimo,
        p.codigo_barras,
        ARRAY_AGG(DISTINCT c.nombre) as categorias,
        JSON_AGG(DISTINCT jsonb_build_object('idubicacion', u.idubicacion, 'nombre', u.nombre, 'idbodega', u.idbodega)) as ubicaciones
      FROM productos p
      LEFT JOIN producto_bodega pb ON p.idproducto = pb.idproducto
      LEFT JOIN producto_categorias pc ON p.idproducto = pc.idproducto
      LEFT JOIN categorias c ON pc.idcategoria = c.idcategoria
      LEFT JOIN producto_ubicacion_bodega pub ON p.idproducto = pub.idproducto
      LEFT JOIN ubicaciones u ON pub.idubicacion = u.idubicacion
      WHERE p.estado = 0
    `;
    
    const params = [];
    
    if (idbodega) {
      sql += " AND pb.idbodega = $1";
      params.push(idbodega);
    }
    
    sql += `
      GROUP BY p.idproducto, pb.stock, pb.stock_minimo
      ORDER BY p.nombre
    `;
    
    const result = await query(sql, params);

    const productos = await Promise.all(
      result.rows.map(async (producto) => {
        let imagenBase64 = "";
        if (producto.imagen) {
          try {
            const base64 = producto.imagen.toString("base64");
            imagenBase64 = `data:image/jpeg;base64,${base64}`;
          } catch (error) {
            console.error(
              `Error al convertir imagen del producto ${producto.idproducto}:`,
              error,
            );
            imagenBase64 = "";
          }
        }

        // Filtrar ubicaciones nulas y obtener solo las de la bodega del usuario
        let ubicaciones = producto.ubicaciones || [];
        if (Array.isArray(ubicaciones)) {
          ubicaciones = ubicaciones.filter(u => u && u.idubicacion !== null);
          if (idbodega) {
            ubicaciones = ubicaciones.filter(u => u.idbodega === parseInt(idbodega));
          }
        }

        // Obtener productos similares
        const similaresResult = await query(
          `
          WITH RECURSIVE similar_products AS (
            SELECT DISTINCT 
              CASE 
                WHEN idproducto = $1::integer THEN idproducto_similar
                WHEN idproducto_similar = $1::integer THEN idproducto
              END as idproducto_relacionado
            FROM productos_similares
            WHERE idproducto = $1::integer OR idproducto_similar = $1::integer
            
            UNION
            
            SELECT DISTINCT
              CASE 
                WHEN ps.idproducto = sp.idproducto_relacionado THEN ps.idproducto_similar
                WHEN ps.idproducto_similar = sp.idproducto_relacionado THEN ps.idproducto
              END
            FROM productos_similares ps
            INNER JOIN similar_products sp ON 
              ps.idproducto = sp.idproducto_relacionado OR 
              ps.idproducto_similar = sp.idproducto_relacionado
          )
          SELECT DISTINCT p.idproducto, p.nombre
          FROM similar_products sp
          JOIN productos p ON sp.idproducto_relacionado = p.idproducto
          WHERE p.estado = 0 AND p.idproducto != $1::integer
          ORDER BY p.nombre
        `,
          [producto.idproducto],
        );

        return {
          idproducto: producto.idproducto,
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          ubicaciones: ubicaciones,
          categorias: producto.categorias?.filter((c) => c !== null) || [],
          estado: producto.estado,
          imagen: imagenBase64,
          precio_venta: producto.precio_venta,
          precio_compra: producto.precio_compra,
          stock: producto.stock || 0,
          stock_minimo: producto.stock_minimo || 0,
          codigo_barras: producto.codigo_barras,
          productos_similares: similaresResult.rows,
        };
      }),
    );

    return productos;
  },

  buscarProductos: async (termino, idbodega) => {
    let sql = `
      SELECT 
        p.idproducto,
        p.nombre,
        p.descripcion,
        p.estado,
        p.imagen,
        p.precio_venta,
        p.precio_compra,
        COALESCE(pb.stock, 0) as stock,
        COALESCE(pb.stock_minimo, 0) as stock_minimo,
        p.codigo_barras,
        ARRAY_AGG(DISTINCT c.nombre) as categorias,
        JSON_AGG(DISTINCT jsonb_build_object('idubicacion', u.idubicacion, 'nombre', u.nombre, 'idbodega', u.idbodega)) as ubicaciones
      FROM productos p
      LEFT JOIN producto_bodega pb ON p.idproducto = pb.idproducto
      LEFT JOIN producto_categorias pc ON p.idproducto = pc.idproducto
      LEFT JOIN categorias c ON pc.idcategoria = c.idcategoria
      LEFT JOIN producto_ubicacion_bodega pub ON p.idproducto = pub.idproducto
      LEFT JOIN ubicaciones u ON pub.idubicacion = u.idubicacion
      WHERE p.estado = 0 
        AND (p.nombre ILIKE $1 OR p.descripcion ILIKE $1 
             OR c.nombre ILIKE $1 OR p.codigo_barras ILIKE $1)
    `;
    
    const params = [`%${termino}%`];
    
    if (idbodega) {
      sql += ` AND pb.idbodega = $2`;
      params.push(idbodega);
    }
    
    sql += `
      GROUP BY p.idproducto, pb.stock, pb.stock_minimo
      ORDER BY p.nombre
    `;
    
    const result = await query(sql, params);

    const productos = await Promise.all(
      result.rows.map(async (producto) => {
        let imagenBase64 = "";
        if (producto.imagen) {
          try {
            const base64 = producto.imagen.toString("base64");
            imagenBase64 = `data:image/jpeg;base64,${base64}`;
          } catch (error) {
            console.error(
              `Error al convertir imagen del producto ${producto.idproducto}:`,
              error,
            );
            imagenBase64 = "";
          }
        }

        // Filtrar ubicaciones nulas
        let ubicaciones = producto.ubicaciones || [];
        if (Array.isArray(ubicaciones)) {
          ubicaciones = ubicaciones.filter(u => u && u.idubicacion !== null);
          if (idbodega) {
            ubicaciones = ubicaciones.filter(u => u.idbodega === parseInt(idbodega));
          }
        }

        const similaresResult = await query(
          `
          WITH RECURSIVE similar_products AS (
            SELECT DISTINCT 
              CASE 
                WHEN idproducto = $1::integer THEN idproducto_similar
                WHEN idproducto_similar = $1::integer THEN idproducto
              END as idproducto_relacionado
            FROM productos_similares
            WHERE idproducto = $1::integer OR idproducto_similar = $1::integer
            
            UNION
            
            SELECT DISTINCT
              CASE 
                WHEN ps.idproducto = sp.idproducto_relacionado THEN ps.idproducto_similar
                WHEN ps.idproducto_similar = sp.idproducto_relacionado THEN ps.idproducto
              END
            FROM productos_similares ps
            INNER JOIN similar_products sp ON 
              ps.idproducto = sp.idproducto_relacionado OR 
              ps.idproducto_similar = sp.idproducto_relacionado
          )
          SELECT DISTINCT p.idproducto, p.nombre
          FROM similar_products sp
          JOIN productos p ON sp.idproducto_relacionado = p.idproducto
          WHERE p.estado = 0 AND p.idproducto != $1::integer
          ORDER BY p.nombre
        `,
          [producto.idproducto],
        );

        return {
          idproducto: producto.idproducto,
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          ubicaciones: ubicaciones,
          categorias: producto.categorias?.filter((c) => c !== null) || [],
          estado: producto.estado,
          imagen: imagenBase64,
          precio_venta: producto.precio_venta,
          precio_compra: producto.precio_compra,
          stock: producto.stock || 0,
          stock_minimo: producto.stock_minimo || 0,
          codigo_barras: producto.codigo_barras,
          productos_similares: similaresResult.rows,
        };
      }),
    );

    return productos;
  },

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
        COALESCE(pb.stock, 0) as stock,
        COALESCE(pb.stock_minimo, 0) as stock_minimo,
        p.codigo_barras,
        ARRAY_AGG(DISTINCT c.nombre) as categorias,
        JSON_AGG(DISTINCT jsonb_build_object('idubicacion', u.idubicacion, 'nombre', u.nombre, 'idbodega', u.idbodega)) as ubicaciones
      FROM productos p
      LEFT JOIN producto_bodega pb ON p.idproducto = pb.idproducto
      LEFT JOIN producto_categorias pc ON p.idproducto = pc.idproducto
      LEFT JOIN categorias c ON pc.idcategoria = c.idcategoria
      LEFT JOIN producto_ubicacion_bodega pub ON p.idproducto = pub.idproducto
      LEFT JOIN ubicaciones u ON pub.idubicacion = u.idubicacion
      WHERE p.idproducto = $1 AND p.estado = 0
    `;
    
    const params = [id];
    
    if (idbodega) {
      sql += ` AND pb.idbodega = $2`;
      params.push(idbodega);
    }
    
    sql += `
      GROUP BY p.idproducto, pb.stock, pb.stock_minimo
    `;
    
    const result = await query(sql, params);

    if (result.rows.length === 0) {
      throw new Error("Producto no encontrado");
    }

    const producto = result.rows[0];

    let imagenBase64 = "";
    if (producto.imagen) {
      try {
        const base64 = producto.imagen.toString("base64");
        imagenBase64 = `data:image/jpeg;base64,${base64}`;
      } catch (error) {
        console.error(
          `Error al convertir imagen del producto ${producto.idproducto}:`,
          error,
        );
        imagenBase64 = "";
      }
    }

    // Filtrar ubicaciones nulas
    let ubicaciones = producto.ubicaciones || [];
    if (Array.isArray(ubicaciones)) {
      ubicaciones = ubicaciones.filter(u => u && u.idubicacion !== null);
      if (idbodega) {
        ubicaciones = ubicaciones.filter(u => u.idbodega === parseInt(idbodega));
      }
    }

    const similaresResult = await query(
      `
      WITH RECURSIVE similar_products AS (
        SELECT DISTINCT 
          CASE 
            WHEN idproducto = $1::integer THEN idproducto_similar
            WHEN idproducto_similar = $1::integer THEN idproducto
          END as idproducto_relacionado
        FROM productos_similares
        WHERE idproducto = $1::integer OR idproducto_similar = $1::integer
        
        UNION
        
        SELECT DISTINCT
          CASE 
            WHEN ps.idproducto = sp.idproducto_relacionado THEN ps.idproducto_similar
            WHEN ps.idproducto_similar = sp.idproducto_relacionado THEN ps.idproducto
          END
        FROM productos_similares ps
        INNER JOIN similar_products sp ON 
          ps.idproducto = sp.idproducto_relacionado OR 
          ps.idproducto_similar = sp.idproducto_relacionado
      )
      SELECT DISTINCT p.idproducto, p.nombre
      FROM similar_products sp
      JOIN productos p ON sp.idproducto_relacionado = p.idproducto
      WHERE p.estado = 0 AND p.idproducto != $1::integer
      ORDER BY p.nombre
    `,
      [id],
    );

    return {
      idproducto: producto.idproducto,
      nombre: producto.nombre,
      descripcion: producto.descripcion,
      ubicaciones: ubicaciones,
      categorias: producto.categorias?.filter((c) => c !== null) || [],
      estado: producto.estado,
      imagen: imagenBase64,
      precio_venta: producto.precio_venta,
      precio_compra: producto.precio_compra,
      stock: producto.stock || 0,
      stock_minimo: producto.stock_minimo || 0,
      codigo_barras: producto.codigo_barras,
      productos_similares: similaresResult.rows,
    };
  },

  crearRelacionesTransitivas: async (client, productoIds) => {
    if (!productoIds || productoIds.length < 2) return;

    const idsUnicos = [...new Set(productoIds.map((id) => parseInt(id)))];

    console.log(
      `Creando relaciones transitivas para los IDs: ${idsUnicos.join(", ")}`,
    );

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
            console.log(`Relación creada entre ${id1} y ${id2}`);
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
      [id],
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
        if (imagenFile.buffer) {
          imagenBuffer = imagenFile.buffer;
        } else if (imagenFile.data) {
          imagenBuffer = Buffer.from(imagenFile.data);
        } else {
          imagenBuffer = Buffer.from(imagenFile);
        }
      }

      // Insertar producto
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
        ],
      );

      const producto = productoResult.rows[0];

      // Insertar en producto_bodega
      if (productoData.idbodega) {
        await client.query(
          `INSERT INTO producto_bodega (idproducto, idbodega, stock, stock_minimo) 
           VALUES ($1, $2, $3, $4)`,
          [
            producto.idproducto,
            productoData.idbodega,
            productoData.stock || 0,
            productoData.stock_minimo || 0,
          ],
        );
      }

      // Insertar ubicaciones
      if (productoData.ubicaciones && productoData.ubicaciones.length > 0) {
        for (const idubicacion of productoData.ubicaciones) {
          await client.query(
            `INSERT INTO producto_ubicacion_bodega (idproducto, idbodega, idubicacion) 
             VALUES ($1, $2, $3)`,
            [producto.idproducto, productoData.idbodega, idubicacion],
          );
        }
      }

      // Insertar categorías
      if (productoData.categorias && productoData.categorias.length > 0) {
        for (const idcategoria of productoData.categorias) {
          await client.query(
            "INSERT INTO producto_categorias (idproducto, idcategoria) VALUES ($1, $2)",
            [producto.idproducto, idcategoria],
          );
        }
      }

      // Crear relaciones transitivas
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

      return await productsService.getProductoById(producto.idproducto, productoData.idbodega);
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

      // Verificar que el producto existe
      const productoExistente = await client.query(
        "SELECT * FROM productos WHERE idproducto = $1 AND estado = 0",
        [id],
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

      // Actualizar producto
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

      // Actualizar stock en producto_bodega
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

      // Actualizar ubicaciones
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

      // Actualizar categorías
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

      // Actualizar relaciones similares
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

    if (result.rowCount === 0) {
      throw new Error("Producto no encontrado");
    }
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
      [idproducto, idbodega, cantidad],
    );

    if (result.rows.length === 0) {
      throw new Error("Producto no encontrado");
    }

    // Obtener el producto completo con el stock actualizado
    return await productsService.getProductoById(idproducto, idbodega);
  },
};

module.exports = productsService;