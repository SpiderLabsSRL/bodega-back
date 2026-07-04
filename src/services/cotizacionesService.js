const { query, pool } = require("../../db");

const cotizacionesService = {
  // Crear cotización
  createCotizacion: async (cotizacionData) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      console.log("📝 Creando cotización con datos:", cotizacionData);
      
      // Obtener idusuario de los datos
      let idusuario = cotizacionData.idusuario;
      
      // Si no viene idusuario, intentar obtenerlo
      if (!idusuario) {
        const usuarioSql = 'SELECT idusuario FROM usuarios WHERE estado = 0 LIMIT 1';
        const usuarioResult = await client.query(usuarioSql);
        
        if (usuarioResult.rows.length === 0) {
          throw new Error("No se encontró usuario activo");
        }
        
        idusuario = usuarioResult.rows[0].idusuario;
        console.log("👤 Usuario asignado automáticamente:", idusuario);
      } else {
        // Verificar que el usuario existe y está activo
        const usuarioCheck = await client.query(
          'SELECT idusuario, idbodega FROM usuarios WHERE idusuario = $1 AND estado = 0',
          [idusuario]
        );
        
        if (usuarioCheck.rows.length === 0) {
          throw new Error("Usuario no válido o inactivo");
        }
        
        console.log("👤 Usuario verificado:", idusuario);
      }
      
      // Obtener bodega del usuario o usar la proporcionada
      let idbodega = cotizacionData.idbodega;
      
      if (!idbodega) {
        // Si no se especificó bodega, obtener la del usuario
        const bodegaResult = await client.query(
          'SELECT idbodega FROM usuarios WHERE idusuario = $1',
          [idusuario]
        );
        
        if (bodegaResult.rows.length > 0 && bodegaResult.rows[0].idbodega) {
          idbodega = bodegaResult.rows[0].idbodega;
        } else {
          // Si el usuario no tiene bodega, usar la primera disponible
          const defaultBodega = await client.query(
            'SELECT idbodega FROM bodegas WHERE estado = 0 ORDER BY idbodega LIMIT 1'
          );
          idbodega = defaultBodega.rows.length > 0 ? defaultBodega.rows[0].idbodega : 1;
        }
      }
      
      console.log("🏢 Bodega final para cotización:", idbodega);
      console.log("👤 Usuario final:", idusuario);
      
      // Buscar o crear cliente
      let idcliente = null;
      
      if (cotizacionData.cliente_nombre) {
        // Buscar cliente existente por nombre y teléfono
        const searchClienteSql = `
          SELECT idcliente 
          FROM clientes 
          WHERE estado = 0 
            AND nombres || ' ' || apellidos ILIKE $1 
            AND celular = $2
          LIMIT 1
        `;
        
        const searchResult = await client.query(searchClienteSql, [
          `%${cotizacionData.cliente_nombre}%`,
          cotizacionData.cliente_telefono || ''
        ]);
        
        if (searchResult.rows.length > 0) {
          idcliente = searchResult.rows[0].idcliente;
          console.log("✅ Cliente encontrado:", idcliente);
        } else if (cotizacionData.carnet) {
          // Intentar buscar por carnet
          const carnetCheck = await client.query(
            'SELECT idcliente FROM clientes WHERE carnet = $1 AND estado = 0',
            [cotizacionData.carnet]
          );
          if (carnetCheck.rows.length > 0) {
            idcliente = carnetCheck.rows[0].idcliente;
            console.log("✅ Cliente encontrado por carnet:", idcliente);
          }
        }
      }
      
      // Insertar cotización
      const insertCotizacionSql = `
        INSERT INTO cotizaciones (
          vigencia, cliente_nombre, cliente_telefono, cliente_direccion,
          tipo_pago, sub_total, descuento, total, abono, saldo, 
          idusuario, idcliente, idbodega
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;
      
      const cotizacionValues = [
        cotizacionData.vigencia || '0',
        cotizacionData.cliente_nombre,
        cotizacionData.cliente_telefono || '',
        cotizacionData.cliente_direccion || '',
        cotizacionData.tipo_pago || 'Contra Entrega',
        cotizacionData.sub_total || 0,
        cotizacionData.descuento || 0,
        cotizacionData.total || 0,
        cotizacionData.abono || 0,
        cotizacionData.saldo || 0,
        idusuario,
        idcliente,
        idbodega
      ];
      
      console.log("📝 Insertando cotización con valores:", cotizacionValues);
      
      const cotizacionResult = await client.query(insertCotizacionSql, cotizacionValues);
      const nuevaCotizacion = cotizacionResult.rows[0];
      
      console.log("✅ Cotización creada con ID:", nuevaCotizacion.idcotizacion);
      
      // Insertar detalles de la cotización
      if (cotizacionData.items && cotizacionData.items.length > 0) {
        for (let item of cotizacionData.items) {
          const insertDetalleSql = `
            INSERT INTO detalle_cotizaciones (
              idcotizacion, idproducto, cantidad, precio_unitario, subtotal_linea
            ) VALUES ($1, $2, $3, $4, $5)
          `;
          
          await client.query(insertDetalleSql, [
            nuevaCotizacion.idcotizacion,
            item.idproducto,
            item.cantidad,
            item.precio_unitario,
            item.subtotal_linea
          ]);
          
          // Insertar productos pendientes (inicialmente todos los productos están pendientes)
          const insertPendienteSql = `
            INSERT INTO productos_pendientes_cotizacion (
              idcotizacion, idproducto, cantidad_pendiente
            ) VALUES ($1, $2, $3)
          `;
          
          await client.query(insertPendienteSql, [
            nuevaCotizacion.idcotizacion,
            item.idproducto,
            item.cantidad
          ]);
        }
        console.log(`✅ ${cotizacionData.items.length} detalles insertados`);
      }
      
      await client.query('COMMIT');
      console.log("✅ Cotización completada exitosamente");
      return nuevaCotizacion;
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error("❌ Error en createCotizacion:", error);
      throw error;
    } finally {
      client.release();
    }
  },

  // Obtener todas las cotizaciones
  getCotizaciones: async () => {
    try {
      const sql = `
        SELECT 
          c.*,
          u.nombres as usuario_nombre,
          u.apellidos as usuario_apellido,
          cl.nombres as cliente_nombres,
          cl.apellidos as cliente_apellidos,
          cl.carnet as cliente_carnet,
          b.nombre as bodega_nombre
        FROM cotizaciones c
        LEFT JOIN usuarios u ON c.idusuario = u.idusuario
        LEFT JOIN clientes cl ON c.idcliente = cl.idcliente
        LEFT JOIN bodegas b ON c.idbodega = b.idbodega
        WHERE c.estado = 0
        ORDER BY c.fecha_creacion DESC, c.idcotizacion DESC
      `;
      
      const result = await query(sql);
      return result.rows;
    } catch (error) {
      console.error("❌ Error en getCotizaciones:", error);
      throw error;
    }
  },

  // Obtener cotización por ID
  getCotizacionById: async (id) => {
    try {
      const cotizacionSql = `
        SELECT 
          c.*,
          u.nombres as usuario_nombre,
          u.apellidos as usuario_apellido,
          cl.nombres as cliente_nombres,
          cl.apellidos as cliente_apellidos,
          cl.carnet as cliente_carnet,
          cl.celular as cliente_celular,
          cl.nota as cliente_nota,
          b.nombre as bodega_nombre
        FROM cotizaciones c
        LEFT JOIN usuarios u ON c.idusuario = u.idusuario
        LEFT JOIN clientes cl ON c.idcliente = cl.idcliente
        LEFT JOIN bodegas b ON c.idbodega = b.idbodega
        WHERE c.idcotizacion = $1 AND c.estado = 0
      `;
      
      const cotizacionResult = await query(cotizacionSql, [id]);
      
      if (cotizacionResult.rows.length === 0) {
        return null;
      }
      
      const detallesSql = `
        SELECT 
          dc.*,
          p.nombre as producto_nombre
        FROM detalle_cotizaciones dc
        JOIN productos p ON dc.idproducto = p.idproducto
        WHERE dc.idcotizacion = $1
      `;
      
      const detallesResult = await query(detallesSql, [id]);
      
      return {
        cotizacion: cotizacionResult.rows[0],
        detalles: detallesResult.rows
      };
    } catch (error) {
      console.error("❌ Error en getCotizacionById:", error);
      throw error;
    }
  },

  // Actualizar cotización
  updateCotizacion: async (id, updateData) => {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;
      
      for (const [key, value] of Object.entries(updateData)) {
        if (key !== 'items' && value !== undefined) {
          fields.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      }
      
      if (fields.length === 0) {
        throw new Error("No hay campos para actualizar");
      }
      
      values.push(id);
      
      const updateSql = `
        UPDATE cotizaciones 
        SET ${fields.join(', ')} 
        WHERE idcotizacion = $${paramCount} AND estado = 0
        RETURNING *
      `;
      
      const result = await query(updateSql, values);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error("❌ Error en updateCotizacion:", error);
      throw error;
    }
  },

  // Eliminar cotización (soft delete)
  deleteCotizacion: async (id) => {
    try {
      const sql = `
        UPDATE cotizaciones 
        SET estado = 1 
        WHERE idcotizacion = $1
      `;
      
      await query(sql, [id]);
    } catch (error) {
      console.error("❌ Error en deleteCotizacion:", error);
      throw error;
    }
  },

  // Buscar cotizaciones
  searchCotizaciones: async (searchQuery) => {
    try {
      console.log("🔍 Buscando cotizaciones con query:", searchQuery);
      
      if (!searchQuery || searchQuery.trim() === "") {
        return [];
      }

      const searchTerm = `%${searchQuery}%`;
      
      const sql = `
        SELECT 
          c.*,
          u.nombres as usuario_nombre,
          u.apellidos as usuario_apellido,
          cl.nombres as cliente_nombres,
          cl.apellidos as cliente_apellidos,
          b.nombre as bodega_nombre
        FROM cotizaciones c
        LEFT JOIN usuarios u ON c.idusuario = u.idusuario
        LEFT JOIN clientes cl ON c.idcliente = cl.idcliente
        LEFT JOIN bodegas b ON c.idbodega = b.idbodega
        WHERE c.estado = 0 
          AND (
            c.cliente_nombre ILIKE $1 OR 
            c.cliente_telefono ILIKE $1 OR
            c.idcotizacion::TEXT ILIKE $1 OR
            cl.nombres ILIKE $1 OR
            cl.apellidos ILIKE $1 OR
            cl.carnet ILIKE $1 OR
            b.nombre ILIKE $1
          )
        ORDER BY c.fecha_creacion DESC, c.idcotizacion DESC
        LIMIT 20
      `;
      
      const result = await query(sql, [searchTerm]);
      console.log(`✅ Encontradas ${result.rows.length} cotizaciones`);
      return result.rows;
      
    } catch (error) {
      console.error("❌ Error en searchCotizaciones service:", error);
      return [];
    }
  }
};

module.exports = cotizacionesService;