const authService = require("../services/authService");

const login = async (req, res) => {
  try {
    const { usuario, contraseña } = req.body;

    // Validar campos requeridos
    if (!usuario || !contraseña) {
      return res.status(400).json({
        success: false,
        message: "Usuario y contraseña son requeridos"
      });
    }

    const result = await authService.authenticateUser(usuario, contraseña);

    if (result.success) {
      res.json({
        success: true,
        message: "Inicio de sesión exitoso",
        token: result.token,
        user: result.user
      });
    } else {
      res.status(401).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error("Error en login controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

const logout = async (req, res) => {
  try {
    // En un sistema real, podrías invalidar el token aquí
    res.json({
      success: true,
      message: "Sesión cerrada exitosamente"
    });
  } catch (error) {
    console.error("Error en logout controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

const verifyToken = async (req, res) => {
  try {
    // El middleware de autenticación ya adjuntó el usuario al request
    if (req.user) {
      // Asegurar que los datos del usuario incluyan idbodega
      const userData = {
        idUsuario: req.user.id,
        nombres: req.user.nombres,
        apellidos: req.user.apellidos,
        usuario: req.user.usuario,
        rol: req.user.rol,
        estado: req.user.estado,
        idbodega: req.user.idbodega
      };
      
      res.json({
        success: true,
        user: userData
      });
    } else {
      res.status(401).json({
        success: false,
        message: "Token inválido o expirado"
      });
    }
  } catch (error) {
    console.error("Error en verifyToken controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

module.exports = {
  login,
  logout,
  verifyToken
};