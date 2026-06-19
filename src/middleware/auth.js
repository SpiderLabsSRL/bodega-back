const jwt = require("jsonwebtoken");
const db = require("../../db");

const authenticate = async (req, res, next) => {
  try {
    // 1. Obtener el token del header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization header is missing",
      });
    }

    // 2. Verificar formato del header
    const tokenParts = authHeader.split(" ");
    if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
      return res.status(401).json({
        success: false,
        message: "Authorization header format should be: Bearer <token>",
      });
    }

    const token = tokenParts[1];

    // 3. Verificar que el token no esté vacío
    if (!token || token === "null" || token === "undefined") {
      return res.status(401).json({
        success: false,
        message: "Authentication token is missing",
      });
    }

    // 4. Verificar y decodificar el token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    // 5. Buscar usuario en la base de datos con información de bodega
    const userQuery = `
      SELECT 
        u.idusuario,
        u.nombres,
        u.apellidos,
        u.usuario,
        u.rol,
        u.estado,
        u.idbodega,                    -- Añadir idbodega
        b.nombre as bodega_nombre,     -- Opcional: nombre de la bodega
        b.tipo as bodega_tipo          -- Opcional: tipo de bodega
      FROM usuarios u
      LEFT JOIN bodegas b ON u.idbodega = b.idbodega
      WHERE u.idusuario = $1 AND u.estado = 0
    `;
    
    const userResult = await db.query(userQuery, [decoded.id]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Usuario no encontrado o inactivo",
      });
    }

    const user = userResult.rows[0];
    
    // 6. Adjuntar información completa del usuario al request
    req.user = {
      id: user.idusuario,
      nombres: user.nombres,
      apellidos: user.apellidos,
      usuario: user.usuario,
      rol: user.rol,
      estado: user.estado,
      idbodega: user.idbodega,           // Asegurar que idbodega esté disponible
      bodegaNombre: user.bodega_nombre,   // Opcional
      bodegaTipo: user.bodega_tipo        // Opcional
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    let errorMessage = "Authentication failed";
    if (error.name === "TokenExpiredError") {
      errorMessage = "Token expired";
    } else if (error.name === "JsonWebTokenError") {
      errorMessage = "Invalid token format";
    }

    return res.status(401).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const authorize = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!requiredRoles.includes(req.user.rol)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    next();
  };
};

// NUEVO: Middleware para verificar que el usuario tenga acceso a una bodega específica
const verifyBodegaAccess = (req, res, next) => {
  const bodegaId = req.params.idbodega || req.body.idbodega || req.query.idbodega;
  
  if (!bodegaId) {
    return res.status(400).json({
      success: false,
      message: "ID de bodega no proporcionado"
    });
  }

  // Si el usuario es Admin, tiene acceso a todas las bodegas
  if (req.user.rol === 'Admin') {
    return next();
  }

  // Si el usuario es Asistente, solo tiene acceso a su bodega asignada
  if (req.user.rol === 'Asistente') {
    if (parseInt(bodegaId) !== req.user.idbodega) {
      return res.status(403).json({
        success: false,
        message: "No tiene acceso a esta bodega"
      });
    }
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Rol de usuario no autorizado para acceder a bodegas"
  });
};

// NUEVO: Middleware para filtrar por bodega del usuario (útil para listados)
const filterByUserBodega = (req, res, next) => {
  // Si el usuario es Admin, no aplicar filtro
  if (req.user.rol === 'Admin') {
    return next();
  }
  
  // Si el usuario es Asistente, aplicar filtro por su bodega
  if (req.user.rol === 'Asistente' && req.user.idbodega) {
    // Añadir filtro al query para usar en los controladores
    req.bodegaFilter = req.user.idbodega;
  }
  
  next();
};

module.exports = {
  authenticate,
  authorize,
  verifyBodegaAccess,    // Exportar nuevo middleware
  filterByUserBodega     // Exportar nuevo middleware
};