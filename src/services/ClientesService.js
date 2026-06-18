// ClientesService.js
const { query } = require("../../db");

const getClientes = async () => {
  const result = await query(
    "SELECT idcliente, nombres, apellidos, carnet, celular, nota, estado FROM clientes WHERE estado IN (0, 1) ORDER BY idcliente"
  );
  return result.rows;
};

const createCliente = async (clienteData) => {
  const { nombres, apellidos, carnet, celular, nota } = clienteData;

  // Verificar si el carnet ya existe
  const carnetExistente = await query(
    "SELECT idcliente FROM clientes WHERE carnet = $1 AND estado IN (0, 1)",
    [carnet]
  );

  if (carnetExistente.rows.length > 0) {
    throw new Error("El carnet ya está registrado");
  }

  const result = await query(
    `INSERT INTO clientes (nombres, apellidos, carnet, celular, nota, estado) 
     VALUES ($1, $2, $3, $4, $5, 0) 
     RETURNING idcliente, nombres, apellidos, carnet, celular, nota, estado`,
    [nombres, apellidos, carnet, celular, nota]
  );

  return result.rows[0];
};

const updateCliente = async (id, clienteData) => {
  const { nombres, apellidos, carnet, celular, nota } = clienteData;

  // Verificar si el cliente existe
  const clienteExistente = await query(
    "SELECT idcliente FROM clientes WHERE idcliente = $1 AND estado IN (0, 1)",
    [id]
  );

  if (clienteExistente.rows.length === 0) {
    throw new Error("Cliente no encontrado");
  }

  // Verificar si el carnet ya existe en otro cliente
  const carnetDuplicado = await query(
    "SELECT idcliente FROM clientes WHERE carnet = $1 AND idcliente != $2 AND estado IN (0, 1)",
    [carnet, id]
  );

  if (carnetDuplicado.rows.length > 0) {
    throw new Error("El carnet ya está registrado por otro cliente");
  }

  const result = await query(
    `UPDATE clientes 
     SET nombres = $1, apellidos = $2, carnet = $3, celular = $4, nota = $5 
     WHERE idcliente = $6 
     RETURNING idcliente, nombres, apellidos, carnet, celular, nota, estado`,
    [nombres, apellidos, carnet, celular, nota, id]
  );

  return result.rows[0];
};

const deleteCliente = async (id) => {
  // Cambiar estado a 1 (inactivo) en lugar de borrar físicamente
  const result = await query(
    "UPDATE clientes SET estado = 1 WHERE idcliente = $1 AND estado = 0 RETURNING idcliente",
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error("Cliente no encontrado o ya está inactivo");
  }
};

const toggleClienteStatus = async (id) => {
  const result = await query(
    `UPDATE clientes 
     SET estado = CASE WHEN estado = 0 THEN 1 ELSE 0 END 
     WHERE idcliente = $1 AND estado IN (0, 1)
     RETURNING idcliente, nombres, apellidos, carnet, celular, nota, estado`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error("Cliente no encontrado");
  }

  return result.rows[0];
};

module.exports = {
  getClientes,
  createCliente,
  updateCliente,
  deleteCliente,
  toggleClienteStatus,
};