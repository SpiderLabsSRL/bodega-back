const { query } = require("../../db");
const bcrypt = require("bcrypt");

const getUsuarios = async () => {
  const result = await query(
    `SELECT u.idusuario, u.nombres, u.apellidos, u.telefono, u.usuario, u.rol, u.estado, u.idbodega, b.nombre as bodega_nombre 
     FROM usuarios u
     LEFT JOIN bodegas b ON u.idbodega = b.idbodega
     WHERE u.estado IN (0, 1) 
     ORDER BY u.idusuario`
  );
  return result.rows;
};

const createUsuario = async (usuarioData) => {
  const { nombres, apellidos, telefono, usuario, contraseña, rol, idbodega } = usuarioData;

  // Verificar si el usuario ya existe
  const usuarioExistente = await query(
    "SELECT idusuario FROM usuarios WHERE usuario = $1 AND estado IN (0, 1)",
    [usuario]
  );

  if (usuarioExistente.rows.length > 0) {
    throw new Error("El nombre de usuario ya existe");
  }

  // Verificar si la bodega existe
  if (idbodega) {
    const bodegaExistente = await query(
      "SELECT idbodega FROM bodegas WHERE idbodega = $1 AND estado = 0",
      [idbodega]
    );
    if (bodegaExistente.rows.length === 0) {
      throw new Error("La bodega seleccionada no existe o está inactiva");
    }
  }

  // Hash de la contraseña
  const hashedPassword = await bcrypt.hash(contraseña, 10);

  const result = await query(
    `INSERT INTO usuarios (nombres, apellidos, telefono, usuario, contraseña, rol, idbodega, estado) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0) 
     RETURNING idusuario, nombres, apellidos, telefono, usuario, rol, estado, idbodega`,
    [nombres, apellidos, telefono, usuario, hashedPassword, rol, idbodega]
  );

  return result.rows[0];
};

const updateUsuario = async (id, usuarioData) => {
  const { nombres, apellidos, telefono, usuario, contraseña, rol, idbodega } = usuarioData;

  // Verificar si el usuario existe
  const usuarioExistente = await query(
    "SELECT idusuario FROM usuarios WHERE idusuario = $1 AND estado IN (0, 1)",
    [id]
  );

  if (usuarioExistente.rows.length === 0) {
    throw new Error("Usuario no encontrado");
  }

  // Verificar si el nuevo username ya existe en otro usuario
  const usuarioDuplicado = await query(
    "SELECT idusuario FROM usuarios WHERE usuario = $1 AND idusuario != $2 AND estado IN (0, 1)",
    [usuario, id]
  );

  if (usuarioDuplicado.rows.length > 0) {
    throw new Error("El nombre de usuario ya está en uso");
  }

  // Verificar si la bodega existe
  if (idbodega) {
    const bodegaExistente = await query(
      "SELECT idbodega FROM bodegas WHERE idbodega = $1 AND estado = 0",
      [idbodega]
    );
    if (bodegaExistente.rows.length === 0) {
      throw new Error("La bodega seleccionada no existe o está inactiva");
    }
  }

  let queryText = "";
  let queryParams = [];

  if (contraseña) {
    // Actualizar con contraseña
    const hashedPassword = await bcrypt.hash(contraseña, 10);
    queryText = `UPDATE usuarios 
                 SET nombres = $1, apellidos = $2, telefono = $3, usuario = $4, contraseña = $5, rol = $6, idbodega = $7
                 WHERE idusuario = $8 
                 RETURNING idusuario, nombres, apellidos, telefono, usuario, rol, estado, idbodega`;
    queryParams = [nombres, apellidos, telefono, usuario, hashedPassword, rol, idbodega, id];
  } else {
    // Actualizar sin cambiar contraseña
    queryText = `UPDATE usuarios 
                 SET nombres = $1, apellidos = $2, telefono = $3, usuario = $4, rol = $5, idbodega = $6
                 WHERE idusuario = $7 
                 RETURNING idusuario, nombres, apellidos, telefono, usuario, rol, estado, idbodega`;
    queryParams = [nombres, apellidos, telefono, usuario, rol, idbodega, id];
  }

  const result = await query(queryText, queryParams);
  return result.rows[0];
};

const deleteUsuario = async (id) => {
  // Cambiar estado a 2 (eliminado) en lugar de borrar físicamente
  const result = await query(
    "UPDATE usuarios SET estado = 2 WHERE idusuario = $1 RETURNING idusuario",
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error("Usuario no encontrado");
  }
};

const toggleUsuarioStatus = async (id) => {
  const result = await query(
    `UPDATE usuarios 
     SET estado = CASE WHEN estado = 0 THEN 1 ELSE 0 END 
     WHERE idusuario = $1 AND estado IN (0, 1)
     RETURNING idusuario, nombres, apellidos, telefono, usuario, rol, estado, idbodega`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error("Usuario no encontrado");
  }

  return result.rows[0];
};

module.exports = {
  getUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  toggleUsuarioStatus,
};