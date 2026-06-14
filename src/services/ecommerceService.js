// src/services/ecommerceService.js
const { query, pool } = require("../../db");

const getCarruseles = async () => {
  const result = await query(
    "SELECT idcarrusel, nombre, estado FROM carruseles WHERE estado = 0 ORDER BY idcarrusel DESC"
  );
  return result.rows;
};

const createCarrusel = async (nombre) => {
  const result = await query(
    "INSERT INTO carruseles (nombre, estado) VALUES ($1, 0) RETURNING idcarrusel, nombre, estado",
    [nombre]
  );
  return result.rows[0];
};

const updateCarrusel = async (id, nombre) => {
  const result = await query(
    "UPDATE carruseles SET nombre = $1 WHERE idcarrusel = $2 AND estado = 0 RETURNING idcarrusel, nombre, estado",
    [nombre, id]
  );
  
  if (result.rows.length === 0) {
    throw new Error("Carrusel no encontrado");
  }
  
  return result.rows[0];
};

const deleteCarrusel = async (id) => {
  const result = await query(
    "UPDATE carruseles SET estado = 2 WHERE idcarrusel = $1 RETURNING idcarrusel",
    [id]
  );
  
  if (result.rows.length === 0) {
    throw new Error("Carrusel no encontrado");
  }
};

const getCarruselProductos = async (idCarrusel) => {
  const result = await query(
    `SELECT cv.idcarrusel_producto, cv.idcarrusel, cv.idproducto 
     FROM carrusel_productos cv 
     INNER JOIN carruseles c ON cv.idcarrusel = c.idcarrusel 
     WHERE cv.idcarrusel = $1 AND c.estado = 0`,
    [idCarrusel]
  );
  return result.rows;
};

const addCarruselProductos = async (idCarrusel, productos) => {
  // Verificar que el carrusel existe y está activo
  const carruselCheck = await query(
    "SELECT idcarrusel FROM carruseles WHERE idcarrusel = $1 AND estado = 0",
    [idCarrusel]
  );
  
  if (carruselCheck.rows.length === 0) {
    throw new Error("Carrusel no encontrado o inactivo");
  }
  
  // Validar que productos sea un array
  if (!Array.isArray(productos)) {
    throw new Error("El parámetro 'productos' debe ser un array");
  }
  
  // Insertar cada producto si el array no está vacío
  if (productos.length > 0) {
    const values = productos.map((idProducto, index) => 
      `($${index * 2 + 1}, $${index * 2 + 2})`
    ).join(', ');
    
    const params = productos.flatMap(idProducto => [idCarrusel, idProducto]);
    
    const queryText = `
      INSERT INTO carrusel_productos (idcarrusel, idproducto) 
      VALUES ${values} 
      ON CONFLICT (idcarrusel, idproducto) DO NOTHING
    `;
    
    await query(queryText, params);
  }
};

const updateCarruselProductos = async (idCarrusel, productos) => {
  // Verificar que el carrusel existe y está activo
  const carruselCheck = await query(
    "SELECT idcarrusel FROM carruseles WHERE idcarrusel = $1 AND estado = 0",
    [idCarrusel]
  );
  
  if (carruselCheck.rows.length === 0) {
    throw new Error("Carrusel no encontrado o inactivo");
  }
  
  // Validar que productos sea un array
  if (!Array.isArray(productos)) {
    throw new Error("El parámetro 'productos' debe ser un array");
  }
  
  // Usar transacción para asegurar consistencia
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    await client.query(
      "DELETE FROM carrusel_productos WHERE idcarrusel = $1",
      [idCarrusel]
    );
    
    // Insertar los nuevos productos si el array no está vacío
    if (productos.length > 0) {
      const values = productos.map((idProducto, index) => 
        `($${index * 2 + 1}, $${index * 2 + 2})`
      ).join(', ');
      
      const params = productos.flatMap(idProducto => [idCarrusel, idProducto]);
      
      const queryText = `
        INSERT INTO carrusel_productos (idcarrusel, idproducto) 
        VALUES ${values}
      `;
      
      await client.query(queryText, params);
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getProductos = async () => {
  const result = await query(
    "SELECT idproducto, nombre, descripcion, idubicacion, estado, precio_venta, precio_compra, stock, stock_minimo, imagen FROM productos WHERE estado = 0 ORDER BY idproducto DESC"
  );
  return result.rows;
};

const getProductoCategorias = async (idProducto) => {
  const result = await query(
    `SELECT c.nombre 
     FROM categorias c 
     INNER JOIN producto_categorias pc ON c.idcategoria = pc.idcategoria 
     WHERE pc.idproducto = $1 AND c.estado = 0`,
    [idProducto]
  );
  return result.rows.map(row => row.nombre);
};

const searchProductos = async (searchTerm) => {
  const searchPattern = `%${searchTerm}%`;
  
  const result = await query(
    `SELECT DISTINCT p.idproducto, p.nombre, p.descripcion, p.idubicacion, p.estado 
     FROM productos p
     LEFT JOIN producto_categorias pc ON p.idproducto = pc.idproducto
     LEFT JOIN categorias c ON pc.idcategoria = c.idcategoria
     WHERE p.estado = 0 
       AND (p.nombre ILIKE $1 
         OR p.descripcion ILIKE $1
         OR c.nombre ILIKE $1)
     ORDER BY p.idproducto DESC
     LIMIT 50`,
    [searchPattern]
  );
  
  return result.rows;
};

module.exports = {
  getCarruseles,
  createCarrusel,
  updateCarrusel,
  deleteCarrusel,
  getCarruselProductos,
  addCarruselProductos,
  updateCarruselProductos,
  getProductos,
  getProductoCategorias,
  searchProductos
};