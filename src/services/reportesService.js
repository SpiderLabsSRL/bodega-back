const { query } = require("../../db");

const obtenerProductosMasVendidos = async (mes, año) => {
  try {
    const sql = `
      SELECT 
        p.idproducto,
        p.nombre as nombre_producto,
        c.nombre as categoria,
        SUM(dv.cantidad) as cantidad_vendida,
        SUM(dv.subtotal_linea) as ingresos
      FROM detalle_ventas dv
      INNER JOIN ventas ve ON dv.idventa = ve.idventa
      INNER JOIN productos p ON dv.idproducto = p.idproducto
      INNER JOIN producto_categorias pc ON p.idproducto = pc.idproducto
      INNER JOIN categorias c ON pc.idcategoria = c.idcategoria
      WHERE EXTRACT(MONTH FROM ve.fecha_hora) = $1 
        AND EXTRACT(YEAR FROM ve.fecha_hora) = $2
        AND p.estado = 0
      GROUP BY p.idproducto, p.nombre, c.nombre
      ORDER BY cantidad_vendida DESC
      LIMIT 10
    `;
    
    const result = await query(sql, [mes, año]);
    return result.rows;
  } catch (error) {
    console.error("Error en obtenerProductosMasVendidos:", error);
    return []; // Devolver array vacío en lugar de lanzar error
  }
};

const obtenerProductosSinVender = async () => {
  try {
    const sql = `
      WITH ultimas_ventas AS (
        SELECT 
          dv.idproducto,
          MAX(ve.fecha_hora) as ultima_fecha_venta
        FROM detalle_ventas dv
        INNER JOIN ventas ve ON dv.idventa = ve.idventa
        GROUP BY dv.idproducto
      ),
      productos_agregados AS (
        SELECT 
          p.idproducto,
          MIN(ve.fecha_hora) as fecha_agregado
        FROM producto p
        LEFT JOIN detalle_ventas dv ON p.idproducto = dv.idproducto
        LEFT JOIN ventas ve ON dv.idventa = ve.idventa
        GROUP BY p.idproducto
      )
      SELECT 
        p.idproducto,
        p.nombre as nombre_producto,
        c.nombre as categoria,
        pa.fecha_agregado,
        uv.ultima_fecha_venta,
        CASE 
          WHEN uv.ultima_fecha_venta IS NOT NULL THEN 
            EXTRACT(DAY FROM (CURRENT_DATE - uv.ultima_fecha_venta))
          ELSE 
            EXTRACT(DAY FROM (CURRENT_DATE - pa.fecha_agregado))
        END as dias_sin_vender
      FROM productos p
      INNER JOIN producto_categorias pc ON p.idproducto = pc.idproducto
      INNER JOIN categorias c ON pc.idcategoria = c.idcategoria
      INNER JOIN productos_agregados pa ON p.idproducto = pa.idproducto
      LEFT JOIN ultimas_ventas uv ON p.idproducto = uv.idproducto
      WHERE p.estado = 0
        AND (
          uv.ultima_fecha_venta IS NULL 
          OR uv.ultima_fecha_venta < CURRENT_DATE - INTERVAL '3 months'
        )
        AND pa.fecha_agregado < CURRENT_DATE - INTERVAL '3 months'
      ORDER BY dias_sin_vender DESC
    `;
    
    const result = await query(sql);
    return result.rows;
  } catch (error) {
    console.error("Error en obtenerProductosSinVender:", error);
    return []; // Devolver array vacío en lugar de lanzar error
  }
};

const obtenerAnalisisProductos = async (mes, año) => {
  try {
    const sql = `
      SELECT 
        p.idproducto,
        p.nombre as nombre_producto,
        c.nombre as categoria,
        p.precio_venta,
        p.precio_compra,
        SUM(dv.cantidad) as cantidad_vendida,
        EXTRACT(MONTH FROM ve.fecha_hora) as mes,
        EXTRACT(YEAR FROM ve.fecha_hora) as año
      FROM detalle_ventas dv
      INNER JOIN ventas ve ON dv.idventa = ve.idventa
      INNER JOIN productos p ON dv.idproducto = p.idproducto
      INNER JOIN producto_categorias pc ON p.idproducto = pc.idproducto
      INNER JOIN categorias c ON pc.idcategoria = c.idcategoria
      WHERE EXTRACT(MONTH FROM ve.fecha_hora) = $1 
        AND EXTRACT(YEAR FROM ve.fecha_hora) = $2
        AND p.estado = 0
      GROUP BY 
        p.idproducto, 
        p.nombre, 
        c.nombre, 
        p.precio_venta, 
        p.precio_compra,
        EXTRACT(MONTH FROM ve.fecha_hora),
        EXTRACT(YEAR FROM ve.fecha_hora)
      ORDER BY cantidad_vendida DESC
    `;
    
    const result = await query(sql, [mes, año]);
    return result.rows;
  } catch (error) {
    console.error("Error en obtenerAnalisisProductos:", error);
    return []; // Devolver array vacío en lugar de lanzar error
  }
};

const obtenerObjetivos = async (año) => {
  try {
    const sql = `
      SELECT idobjetivo, mes, año, monto
      FROM objetivos
      WHERE año = $1
      ORDER BY mes
    `;
    
    const result = await query(sql, [año]);
    return result.rows;
  } catch (error) {
    console.error("Error en obtenerObjetivos:", error);
    return []; // Devolver array vacío en lugar de lanzar error
  }
};

const obtenerObjetivo = async (mes, año) => {
  try {
    const sql = `
      SELECT idobjetivo, mes, año, monto
      FROM objetivos
      WHERE mes = $1 AND año = $2
    `;
    
    const result = await query(sql, [mes, año]);
    return result.rows[0] || null;
  } catch (error) {
    console.error("Error en obtenerObjetivo:", error);
    return null; // Devolver null en lugar de lanzar error
  }
};

const crearOActualizarObjetivo = async (mes, año, monto) => {
  try {
    // Verificar si ya existe
    const objetivoExistente = await obtenerObjetivo(mes, año);
    
    if (objetivoExistente) {
      // Actualizar
      const sql = `
        UPDATE objetivos 
        SET monto = $1
        WHERE mes = $2 AND año = $3
        RETURNING idobjetivo, mes, año, monto
      `;
      const result = await query(sql, [monto, mes, año]);
      return result.rows[0];
    } else {
      // Crear nuevo
      const sql = `
        INSERT INTO objetivos (mes, año, monto)
        VALUES ($1, $2, $3)
        RETURNING idobjetivo, mes, año, monto
      `;
      const result = await query(sql, [mes, año, monto]);
      return result.rows[0];
    }
  } catch (error) {
    console.error("Error en crearOActualizarObjetivo:", error);
    throw new Error("Error al guardar objetivo"); // Solo lanzar error aquí porque es una operación de escritura
  }
};

const obtenerVentasMensuales = async (mes, año) => {
  try {
    const sql = `
      SELECT 
        EXTRACT(MONTH FROM fecha_hora) as mes,
        EXTRACT(YEAR FROM fecha_hora) as año,
        COUNT(*) as total_ventas,
        COALESCE(SUM(total), 0) as total_ingresos
      FROM ventas
      WHERE EXTRACT(MONTH FROM fecha_hora) = $1 
        AND EXTRACT(YEAR FROM fecha_hora) = $2
      GROUP BY 
        EXTRACT(MONTH FROM fecha_hora),
        EXTRACT(YEAR FROM fecha_hora)
    `;
    
    const result = await query(sql, [mes, año]);
    
    // Si no hay resultados, devolver un objeto con valores en 0
    if (result.rows.length === 0) {
      return {
        mes: mes,
        año: año,
        total_ventas: 0,
        total_ingresos: "0.00"
      };
    }
    
    return result.rows[0];
  } catch (error) {
    console.error("Error en obtenerVentasMensuales:", error);
    // En caso de error, devolver un objeto con valores en 0
    return {
      mes: mes,
      año: año,
      total_ventas: 0,
      total_ingresos: "0.00"
    };
  }
};

module.exports = {
  obtenerProductosMasVendidos,
  obtenerProductosSinVender,
  obtenerAnalisisProductos,
  obtenerObjetivos,
  obtenerObjetivo,
  crearOActualizarObjetivo,
  obtenerVentasMensuales
};