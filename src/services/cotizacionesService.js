const { query, pool } = require("../../db");

const cotizacionesService = {
  createCotizacion: async (cotizacionData) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const usuarioSql = 'SELECT idusuario FROM usuarios WHERE estado = 0 LIMIT 1';
      const usuarioResult = await client.query(usuarioSql);
      
      if (usuarioResult.rows.length === 0) {
        throw new Error("No se encontró usuario activo");
      }
      
      const idusuario = usuarioResult.rows[0].idusuario;
      
      const insertCotizacionSql = `
        INSERT INTO cotizaciones (
          vigencia, cliente_nombre, cliente_telefono, cliente_direccion,
          tipo_pago, sub_total, descuento, total, abono, saldo, idusuario
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;
      
      const cotizacionValues = [
        cotizacionData.vigencia,
        cotizacionData.cliente_nombre,
        cotizacionData.cliente_telefono || '',
        cotizacionData.cliente_direccion || '',
        cotizacionData.tipo_pago,
        cotizacionData.sub_total,
        cotizacionData.descuento || 0,
        cotizacionData.total,
        cotizacionData.abono || 0,
        cotizacionData.saldo || 0,
        idusuario
      ];
      
      const cotizacionResult = await client.query(insertCotizacionSql, cotizacionValues);
      const nuevaCotizacion = cotizacionResult.rows[0];
      
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
      
      await client.query('COMMIT');
      return nuevaCotizacion;
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error("Error en createCotizacion:", error);
      throw error;
    } finally {
      client.release();
    }
  },

  getCotizaciones: async () => {
    try {
      const sql = `
        SELECT 
          c.*,
          u.nombres as usuario_nombre,
          u.apellidos as usuario_apellido
        FROM cotizaciones c
        LEFT JOIN usuarios u ON c.idusuario = u.idusuario
        WHERE c.estado = 0
        ORDER BY c.fecha_creacion DESC, c.idcotizacion DESC
      `;
      
      const result = await query(sql);
      return result.rows;
    } catch (error) {
      console.error("Error en getCotizaciones:", error);
      throw error;
    }
  },

  getCotizacionById: async (id) => {
    try {
      const cotizacionSql = `
        SELECT 
          c.*,
          u.nombres as usuario_nombre,
          u.apellidos as usuario_apellido
        FROM cotizaciones c
        LEFT JOIN usuarios u ON c.idusuario = u.idusuario
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
      console.error("Error en getCotizacionById:", error);
      throw error;
    }
  },

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
      console.error("Error en updateCotizacion:", error);
      throw error;
    }
  },

  deleteCotizacion: async (id) => {
    try {
      const sql = `
        UPDATE cotizaciones 
        SET estado = 1 
        WHERE idcotizacion = $1
      `;
      
      await query(sql, [id]);
    } catch (error) {
      console.error("Error en deleteCotizacion:", error);
      throw error;
    }
  },

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
          u.apellidos as usuario_apellido
        FROM cotizaciones c
        LEFT JOIN usuarios u ON c.idusuario = u.idusuario
        WHERE c.estado = 0 
          AND (
            c.cliente_nombre ILIKE $1 OR 
            c.cliente_telefono ILIKE $1 OR
            c.idcotizacion::TEXT ILIKE $1
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
  },
};

module.exports = cotizacionesService;