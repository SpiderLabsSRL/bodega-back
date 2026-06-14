const { query } = require("../../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const authenticateUser = async (usuario, contraseña) => {
  try {
    // Buscar usuario en la base de datos
    const userQuery = `
      SELECT 
        u.idusuario,
        u.nombres,
        u.apellidos,
        u.usuario,
        u.contraseña,
        u.rol,
        u.estado
      FROM usuarios u
      WHERE u.usuario = $1 AND u.estado IN (0, 1)
    `;

    const result = await query(userQuery, [usuario]);

    if (result.rows.length === 0) {
      return {
        success: false,
        message: "Usuario no encontrado"
      };
    }

    const user = result.rows[0];

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(contraseña, user.contraseña);

    if (!isPasswordValid) {
      return {
        success: false,
        message: "Contraseña incorrecta"
      };
    }

    // Verificar estado del usuario
    if (user.estado !== 0) {
      return {
        success: false,
        message: "Usuario inactivo"
      };
    }

    // Generar token JWT
    const token = jwt.sign(
      {
        id: user.idusuario,
        usuario: user.usuario,
        rol: user.rol
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    // Preparar datos del usuario para retornar (sin contraseña)
    const userData = {
      idUsuario: user.idusuario,
      nombres: user.nombres,
      apellidos: user.apellidos,
      usuario: user.usuario,
      rol: user.rol,
      estado: user.estado
    };

    return {
      success: true,
      message: "Autenticación exitosa",
      token,
      user: userData
    };

  } catch (error) {
    console.error("Error en authService:", error);
    throw new Error("Error al autenticar usuario");
  }
};

module.exports = {
  authenticateUser
};