const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Configuración de la conexión a la base de datos
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Neoled',
  password: 'Univalle',
  port: 5432,
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

async function hashAllPasswords() {
  try {
    console.log("Iniciando proceso de hashing de contraseñas...");

    // Obtener todos los usuarios de la tabla usuarios
    const usuariosResult = await query(`
      SELECT idusuario, usuario, contraseña 
      FROM usuarios 
      WHERE contraseña NOT LIKE '$2b$%' OR contraseña IS NULL
    `);

    console.log(`Encontrados ${usuariosResult.rows.length} usuarios para actualizar`);

    for (const user of usuariosResult.rows) {
      // Si no tiene contraseña, usar el username como contraseña por defecto
      const plainPassword = user.contraseña || user.usuario;
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      
      await query("UPDATE usuarios SET contraseña = $1 WHERE idusuario = $2", [
        hashedPassword,
        user.idusuario,
      ]);
      console.log(`Actualizado usuario ID: ${user.idusuario} (${user.usuario})`);
    }

    // Verificar si existe la tabla usuarios_clientes
    try {
      const tableExists = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'usuarios_clientes'
        )
      `);

      if (tableExists.rows[0].exists) {
        // Obtener todos los usuarios de la tabla usuarios_clientes
        const clientesResult = await query(`
          SELECT idusuario, username, password_hash 
          FROM usuarios_clientes 
          WHERE password_hash NOT LIKE '$2b$%' OR password_hash IS NULL
        `);

        console.log(`Encontrados ${clientesResult.rows.length} usuarios clientes para actualizar`);

        for (const user of clientesResult.rows) {
          // Si no tiene contraseña, usar el username como contraseña por defecto
          const plainPassword = user.password_hash || user.username;
          const hashedPassword = await bcrypt.hash(plainPassword, 10);
          
          await query("UPDATE usuarios_clientes SET password_hash = $1 WHERE idusuario = $2", [
            hashedPassword,
            user.idusuario,
          ]);
          console.log(`Actualizado usuario cliente ID: ${user.idusuario} (${user.username})`);
        }
      } else {
        console.log("La tabla 'usuarios_clientes' no existe, omitiendo...");
      }
    } catch (error) {
      console.log("La tabla 'usuarios_clientes' no existe o tiene errores, omitiendo...");
    }

    console.log("Proceso de hashing completado exitosamente");
  } catch (error) {
    console.error("Error al hashear contraseñas:", error);
  } finally {
    await pool.end();
    process.exit();
  }
}

hashAllPasswords();