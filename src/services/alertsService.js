const { query } = require("../../db");

const getLowStockAlerts = async () => {
  try {
    const sql = `
      SELECT 
        p.idproducto,
        p.nombre,
        p.descripcion,
        u.idubicacion,
        u.nombre as nombre_ubicacion,
        p.precio_venta,
        p.precio_compra,
        p.stock,
        p.stock_minimo,
        p.estado,
        p.imagen as imagen_base64
      FROM productos p
      INNER JOIN ubicaciones u ON p.idubicacion = u.idubicacion
      WHERE p.stock <= p.stock_minimo 
        AND p.stock >= 0 
        AND p.estado = 0
      GROUP BY 
        p.idproducto, p.nombre, p.descripcion,
        u.idubicacion, u.nombre,
        p.precio_venta, p.precio_compra,
        p.stock, p.stock_minimo, p.estado
      ORDER BY p.nombre, p.stock ASC
    `;
    
    const result = await query(sql);
    
    // Agrupar por producto
    const productosMap = new Map();
    
    result.rows.forEach(row => {
      const productoKey = row.idproducto;
      
      if (!productosMap.has(productoKey)) {
        productosMap.set(productoKey, {
          idproducto: row.idproducto,
          nombre: row.nombre,
          descripcion: row.descripcion,
          idubicacion: row.idubicacion,
          nombre_ubicacion: row.nombre_ubicacion,
          precio_venta: row.precio_venta,
          precio_compra: row.precio_compra,
          stock: row.stock,
          stock_minimo: row.stock_minimo,
          estado: row.estado,
          imagen: row.imagen_base64 ? 
            row.imagen_base64
            : 
            ''
        });
      }
    });
    
    return Array.from(productosMap.values());
  } catch (error) {
    console.error("Error en getLowStockAlerts service:", error);
    throw error;
  }
};

const getCriticalStockAlerts = async () => {
  try {
    const sql = `
      SELECT 
        SELECT 
        p.idproducto,
        p.nombre,
        p.descripcion,
        u.idubicacion,
        u.nombre as nombre_ubicacion,
        p.precio_venta,
        p.precio_compra,
        p.stock,
        p.stock_minimo,
        p.estado,
        p.imagen as imagen_base64
      FROM productos p
      INNER JOIN ubicaciones u ON p.idubicacion = u.idubicacion
      WHERE p.stock = 0 
        AND p.estado = 0 
      GROUP BY 
        p.idproducto, p.nombre, p.descripcion,
        u.idubicacion, u.nombre,
        p.precio_venta, p.precio_compra,
        p.stock, p.stock_minimo, p.estado
      ORDER BY p.nombre, p.stock ASC
    `;
    
    const result = await query(sql);
    
    // Agrupar por producto y luego por variante
    const productosMap = new Map();
    
    result.rows.forEach(row => {
      const productoKey = row.idproducto;
      
      if (!productosMap.has(productoKey)) {
        productosMap.set(productoKey, {
          idproducto: row.idproducto,
          nombre: row.nombre,
          descripcion: row.descripcion,
          idubicacion: row.idubicacion,
          nombre_ubicacion: row.nombre_ubicacion,
          precio_venta: row.precio_venta,
          precio_compra: row.precio_compra,
          stock: row.stock,
          stock_minimo: row.stock_minimo,
          estado: row.estado,
          imagen: row.imagen_base64 ? 
            row.imagen_base64
            : 
            ''
        });
      }
    });
    
    return Array.from(productosMap.values());
  } catch (error) {
    console.error("Error en getCriticalStockAlerts service:", error);
    throw error;
  }
};

module.exports = {
  getLowStockAlerts,
  getCriticalStockAlerts
};