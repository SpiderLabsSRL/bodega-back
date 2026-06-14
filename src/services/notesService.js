const { query } = require("../../db");

const getNotes = async () => {
  try {
    const result = await query("SELECT * FROM notas ORDER BY idnota DESC");
    return result.rows;
  } catch (error) {
    console.error("Error en getNotes service:", error);
    throw new Error("Error al obtener las notas de la base de datos");
  }
};

const createNote = async (titulo, contenido) => {
  try {
    const result = await query(
      "INSERT INTO notas (titulo, contenido, fecha) VALUES ($1, $2, CURRENT_DATE) RETURNING *",
      [titulo, contenido]
    );
    return result.rows[0];
  } catch (error) {
    console.error("Error en createNote service:", error);
    throw new Error("Error al crear la nota en la base de datos");
  }
};

const updateNote = async (id, titulo, contenido) => {
  try {
    const result = await query(
      "UPDATE notas SET titulo = $1, contenido = $2, fecha = CURRENT_DATE WHERE idnota = $3 RETURNING *",
      [titulo, contenido, id]
    );
    
    if (result.rows.length === 0) {
      throw new Error("Nota no encontrada");
    }
    
    return result.rows[0];
  } catch (error) {
    console.error("Error en updateNote service:", error);
    throw new Error("Error al actualizar la nota en la base de datos");
  }
};

const deleteNote = async (id) => {
  try {
    const result = await query(
      "DELETE FROM notas WHERE idnota = $1 RETURNING *",
      [id]
    );
    
    if (result.rows.length === 0) {
      throw new Error("Nota no encontrada");
    }
  } catch (error) {
    console.error("Error en deleteNote service:", error);
    throw new Error("Error al eliminar la nota de la base de datos");
  }
};

module.exports = {
  getNotes,
  createNote,
  updateNote,
  deleteNote
};