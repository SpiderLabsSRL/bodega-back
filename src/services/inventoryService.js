// src/services/inventoryService.js
const { query } = require("../../db");

const getInventory = async (searchTerm = null, lowMarginOnly = false, categories = [], idbodega = null) => {
  try {
    let sqlQuery = `
      SELECT 
        p.idproducto,
        p.nombre as nombre_producto,
        p.codigo_barras,
        p.precio_compra,
        p.precio_venta,
        p.estado,
        COALESCE(
          (SELECT MAX(fecha_hora) 
           FROM detalle_ventas dv 
           JOIN ventas ve ON dv.idventa = ve.idventa 
           WHERE dv.idproducto = p.idproducto),
          CURRENT_TIMESTAMP
        ) as ultima_edicion,
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
          WHERE pb.idproducto = p.idproducto AND b.estado = 0),
          '[]'
        ) as bodegas_stock
      FROM productos p
      LEFT JOIN producto_categorias pc ON p.idproducto = pc.idproducto
      WHERE p.estado = 0
    `;

    const params = [];
    let paramCount = 0;

    // Filtro por búsqueda
    if (searchTerm) {
      paramCount++;
      sqlQuery += ` AND p.nombre ILIKE $${paramCount}`;
      params.push(`%${searchTerm}%`);
    }

    // Filtro por margen bajo (menos del 50%)
    if (lowMarginOnly) {
      sqlQuery += ` AND EXISTS (
        SELECT 1 FROM producto_bodega pb2 
        WHERE pb2.idproducto = p.idproducto 
        AND ((p.precio_venta - p.precio_compra) * 100.0 / NULLIF(p.precio_compra, 0)) < 50
      )`;
    }

    // Filtro por categorías
    if (categories && categories.length > 0) {
      const placeholders = categories.map((_, index) => `$${paramCount + index + 1}`).join(',');
      sqlQuery += ` AND pc.idcategoria IN (${placeholders})`;
      params.push(...categories);
      paramCount += categories.length;
    }

    // Filtro por bodega específica (si se selecciona una)
    if (idbodega) {
      sqlQuery += ` AND EXISTS (
        SELECT 1 FROM producto_bodega pb2 
        WHERE pb2.idproducto = p.idproducto AND pb2.idbodega = $${paramCount + 1}
      )`;
      params.push(idbodega);
      paramCount++;
    }

    sqlQuery += ` GROUP BY p.idproducto, p.nombre, p.codigo_barras, p.precio_compra, p.precio_venta, p.estado`;
    sqlQuery += ` ORDER BY p.nombre`;

    const result = await query(sqlQuery, params);
    
    // Si se seleccionó una bodega específica, filtrar los bodegas_stock para solo mostrar esa
    if (idbodega) {
      return result.rows.map(row => {
        if (row.bodegas_stock && Array.isArray(row.bodegas_stock)) {
          const filtered = row.bodegas_stock.filter(bs => bs.idbodega === parseInt(idbodega));
          const bodegaData = filtered[0] || { stock: 0, bodega_nombre: 'Sin stock', stock_minimo: 0 };
          return {
            ...row,
            bodegas_stock: filtered,
            stock: bodegaData.stock || 0,
            stock_minimo: bodegaData.stock_minimo || 0,
            bodega_nombre: bodegaData.bodega_nombre || 'Sin stock'
          };
        }
        return row;
      });
    }
    
    return result.rows;
  } catch (error) {
    console.error("Error en inventoryService.getInventory:", error);
    throw error;
  }
};

const getLowMarginCount = async (idbodega = null) => {
  try {
    let sqlQuery = `
      SELECT COUNT(DISTINCT p.idproducto) as count
      FROM productos p
      INNER JOIN producto_bodega pb ON p.idproducto = pb.idproducto
      INNER JOIN bodegas b ON pb.idbodega = b.idbodega
      WHERE p.estado = 0
        AND b.estado = 0
        AND ((p.precio_venta - p.precio_compra) * 100.0 / NULLIF(p.precio_compra, 0)) < 50
    `;

    const params = [];
    if (idbodega) {
      sqlQuery += ` AND pb.idbodega = $1`;
      params.push(idbodega);
    }

    const result = await query(sqlQuery, params);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error("Error en inventoryService.getLowMarginCount:", error);
    throw error;
  }
};

const getCategories = async () => {
  try {
    const sqlQuery = `
      SELECT 
        idcategoria as id,
        nombre
      FROM categorias 
      WHERE estado = 0
      ORDER BY nombre
    `;

    const result = await query(sqlQuery);
    return result.rows;
  } catch (error) {
    console.error("Error en inventoryService.getCategories:", error);
    throw error;
  }
};

const getSucursales = async () => {
  try {
    const sqlQuery = `
      SELECT 
        idbodega as id,
        nombre
      FROM bodegas 
      WHERE estado = 0
      ORDER BY nombre
    `;

    const result = await query(sqlQuery);
    return result.rows;
  } catch (error) {
    console.error("Error en inventoryService.getSucursales:", error);
    throw error;
  }
};

module.exports = {
  getInventory,
  getLowMarginCount,
  getCategories,
  getSucursales
};