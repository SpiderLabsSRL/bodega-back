const { query } = require("../../db");

class HomeService {
  async getProducts(filters = {}) {
    try {
      let sql = `
        SELECT 
          p.idproducto,
          p.nombre,
          p.descripcion,
          p.estado,
          ARRAY_AGG(DISTINCT c.nombre) as categorias,
          p.stock,
          p.imagen,
          p.precio_venta,
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
        LEFT JOIN producto_categorias pc ON p.idproducto = pc.idproducto
        LEFT JOIN categorias c ON pc.idcategoria = c.idcategoria
        WHERE p.estado = 0
      `;

      const conditions = [];
      const params = [];

      if (filters.categoria) {
        conditions.push(`c.nombre = $${params.length + 1}`);
        params.push(filters.categoria);
      }

      if (conditions.length > 0) {
        sql += ` AND (${conditions.join(' AND ')})`;
      }

      sql += `
        GROUP BY p.idproducto, p.nombre, p.descripcion, p.estado
        ORDER BY p.nombre
      `;

      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      console.error("Error in getProducts service:", error);
      throw error;
    }
  }

  async searchProducts(searchQuery) {
    try {
      const sql = `
        SELECT 
          p.idproducto,
          p.nombre,
          p.descripcion,
          p.estado,
          ARRAY_AGG(DISTINCT c.nombre) as categorias,
          p.stock,
          p.imagen,
          p.precio_venta,
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
        LEFT JOIN producto_categorias pc ON p.idproducto = pc.idproducto
        LEFT JOIN categorias c ON pc.idcategoria = c.idcategoria
        WHERE p.estado = 0 
          AND (
            p.nombre ILIKE $1 
            OR p.descripcion ILIKE $1 
            OR c.nombre ILIKE $1
          )
        GROUP BY p.idproducto, p.nombre, p.descripcion, p.estado
        ORDER BY 
          CASE 
            WHEN p.nombre ILIKE $1 THEN 1
            WHEN p.descripcion ILIKE $1 THEN 2
            ELSE 3
          END,
          p.nombre
      `;

      const result = await query(sql, [`%${searchQuery}%`]);
      return result.rows;
    } catch (error) {
      console.error("Error in searchProducts service:", error);
      throw error;
    }
  }

  async getCategories() {
    try {
      console.log("getCategories service called");
      const sql = `
        SELECT DISTINCT nombre 
        FROM categorias 
        WHERE estado = 0 
        ORDER BY nombre
      `;
      const result = await query(sql);
      return result.rows.map(row => row.nombre);
    } catch (error) {
      console.error("Error in getCategories service:", error);
      throw error;
    }
  }

  async getCarruseles() {
    try {
      const carruselesSql = `
        SELECT 
          c.idcarrusel,
          c.nombre,
          c.estado
        FROM carruseles c
        WHERE c.estado = 0
        ORDER BY c.idcarrusel
      `;
      
      const carruselesResult = await query(carruselesSql);
      
      const carruseles = [];
      
      for (const carrusel of carruselesResult.rows) {
        const productosSql = `
          SELECT 
            p.idproducto,
            p.nombre,
            p.descripcion,
            p.estado,
            ARRAY_AGG(DISTINCT cat.nombre) as categorias,
            p.stock,
            p.imagen,
            p.precio_venta,
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
          FROM carrusel_productos cv
          JOIN productos p ON cv.idproducto = p.idproducto
          LEFT JOIN producto_categorias pc ON p.idproducto = pc.idproducto
          LEFT JOIN categorias cat ON pc.idcategoria = cat.idcategoria
          WHERE cv.idcarrusel = $1 
            AND p.estado = 0 
          GROUP BY p.idproducto, p.nombre, p.descripcion, p.estado
          ORDER BY p.nombre
        `;
        
        const productosResult = await query(productosSql, [carrusel.idcarrusel]);
        
        carruseles.push({
          id: carrusel.idcarrusel,
          nombre: carrusel.nombre,
          estado: carrusel.estado,
          productos: productosResult.rows
        });
      }
      
      return carruseles;
    } catch (error) {
      console.error("Error in getCarruseles service:", error);
      return [];
    }
  }
}

module.exports = new HomeService();