const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  // === OPTIMIZACIONES CRÍTICAS ===
  max: 20,                       // máximo de conexiones simultáneas
  min: 2,                        // mantener 2 conexiones vivas (evita handshake inicial)
  idleTimeoutMillis: 30000,      // cerrar conexiones idle tras 30s
  connectionTimeoutMillis: 5000, // fallar rápido si no hay conexión
  statement_timeout: 15000,      // matar queries colgadas a los 15s
  query_timeout: 15000,
  keepAlive: true,               // mantener TCP vivo (evita reconexiones)
  keepAliveInitialDelayMillis: 10000,
});

// Event listener para diagnosticar errores del pool
pool.on("error", (err) => {
  console.error("Error inesperado en cliente PostgreSQL:", err.message);
});

// Variable para activar/desactivar logs de queries
// En producción ponlo en false para máximo rendimiento
const LOG_QUERIES = process.env.LOG_QUERIES === "true";

// Función para ejecutar consultas
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    // Solo loguear en desarrollo y sin el texto completo (que es lento)
    if (LOG_QUERIES) {
      const duration = Date.now() - start;
      console.log(
        `Query: ${res.rowCount} rows en ${duration}ms | ${text.substring(0, 60)}...`
      );
    }
    return res;
  } catch (error) {
    console.error("Error en query:", {
      text: text.substring(0, 200),
      error: error.message,
    });
    throw error;
  }
};

// Conexión a la base de datos
const connectDB = async () => {
  try {
    const client = await pool.connect();
    // Hacer una query trivial para calentar la conexión
    await client.query("SELECT 1");
    client.release();
    console.log("PostgreSQL conectado correctamente 🚀");
    return pool;
  } catch (error) {
    console.error("Error al conectar a PostgreSQL:", error);
    process.exit(1);
  }
};

module.exports = {
  connectDB,
  query,
  pool,
};