// src/services/ManagementSectionService.js
const { query } = require("../../db");

class ManagementSectionService {
  // ============================================
  // CATEGORÍAS
  // ============================================

  static async getCategorias() {
    const result = await query(
      `SELECT 
        idcategoria as id, 
        nombre, 
        estado 
       FROM categorias 
       WHERE estado = 0 
       ORDER BY nombre`
    );
    return result.rows;
  }

  static async createCategoria(nombre) {
    const result = await query(
      `INSERT INTO categorias (nombre, estado) 
       VALUES ($1, 0) 
       RETURNING idcategoria as id, nombre, estado`,
      [nombre]
    );
    return result.rows[0];
  }

  static async updateCategoria(id, nombre) {
    const result = await query(
      `UPDATE categorias 
       SET nombre = $1 
       WHERE idcategoria = $2 AND estado = 0
       RETURNING idcategoria as id, nombre, estado`,
      [nombre, id]
    );
    if (result.rows.length === 0) {
      throw new Error("Categoría no encontrada");
    }
    return result.rows[0];
  }

  static async deleteCategoria(id) {
    const result = await query(
      `UPDATE categorias 
       SET estado = 1 
       WHERE idcategoria = $1 
       RETURNING idcategoria`,
      [id]
    );
    if (result.rows.length === 0) {
      throw new Error("Categoría no encontrada");
    }
  }

  // ============================================
  // UBICACIONES - CON IDBODEGA
  // ============================================

  static async getUbicaciones(idbodega = null) {
    let queryText = `
      SELECT 
        idubicacion as id, 
        nombre, 
        estado, 
        idbodega 
      FROM ubicaciones 
      WHERE estado = 0
    `;
    const params = [];
    
    // Si se pasa un idbodega, filtrar por él
    if (idbodega !== null && idbodega !== undefined) {
      queryText += " AND idbodega = $1";
      params.push(parseInt(idbodega));
    }
    
    queryText += " ORDER BY nombre";
    const result = await query(queryText, params);
    return result.rows;
  }

  static async createUbicacion(nombre, idbodega = null) {
    const result = await query(
      `INSERT INTO ubicaciones (nombre, estado, idbodega) 
       VALUES ($1, 0, $2) 
       RETURNING idubicacion as id, nombre, estado, idbodega`,
      [nombre, idbodega]
    );
    return result.rows[0];
  }

  static async updateUbicacion(id, nombre, idbodega = null) {
    const result = await query(
      `UPDATE ubicaciones 
       SET nombre = $1, idbodega = $2 
       WHERE idubicacion = $3 AND estado = 0
       RETURNING idubicacion as id, nombre, estado, idbodega`,
      [nombre, idbodega, id]
    );
    if (result.rows.length === 0) {
      throw new Error("Ubicación no encontrada");
    }
    return result.rows[0];
  }

  static async deleteUbicacion(id) {
    const result = await query(
      `UPDATE ubicaciones 
       SET estado = 1 
       WHERE idubicacion = $1 
       RETURNING idubicacion`,
      [id]
    );
    if (result.rows.length === 0) {
      throw new Error("Ubicación no encontrada");
    }
  }
}

module.exports = ManagementSectionService;