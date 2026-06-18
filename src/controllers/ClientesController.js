// ClientesController.js
const clientesService = require("../services/ClientesService");

const getClientes = async (req, res) => {
  try {
    const clientes = await clientesService.getClientes();
    res.json(clientes);
  } catch (error) {
    console.error("Error en getClientes:", error);
    res.status(500).json({ error: error.message });
  }
};

const createCliente = async (req, res) => {
  try {
    const { nombres, apellidos, carnet, celular, nota } = req.body;
    
    // Validaciones básicas
    if (!nombres || !apellidos || !carnet || !celular) {
      return res.status(400).json({ error: "Los campos nombres, apellidos, carnet y celular son obligatorios" });
    }

    if (carnet.length < 4 || carnet.length > 20) {
      return res.status(400).json({ error: "El carnet debe tener entre 4 y 20 caracteres" });
    }

    if (celular.length < 7 || celular.length > 20) {
      return res.status(400).json({ error: "El celular debe tener entre 7 y 20 caracteres" });
    }

    const nuevoCliente = await clientesService.createCliente({
      nombres,
      apellidos,
      carnet,
      celular,
      nota: nota || null,
    });

    res.status(201).json(nuevoCliente);
  } catch (error) {
    console.error("Error en createCliente:", error);
    res.status(500).json({ error: error.message });
  }
};

const updateCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombres, apellidos, carnet, celular, nota } = req.body;

    if (!nombres || !apellidos || !carnet || !celular) {
      return res.status(400).json({ error: "Los campos nombres, apellidos, carnet y celular son obligatorios" });
    }

    if (carnet.length < 4 || carnet.length > 20) {
      return res.status(400).json({ error: "El carnet debe tener entre 4 y 20 caracteres" });
    }

    if (celular.length < 7 || celular.length > 20) {
      return res.status(400).json({ error: "El celular debe tener entre 7 y 20 caracteres" });
    }

    const clienteActualizado = await clientesService.updateCliente(parseInt(id), {
      nombres,
      apellidos,
      carnet,
      celular,
      nota: nota || null,
    });

    res.json(clienteActualizado);
  } catch (error) {
    console.error("Error en updateCliente:", error);
    res.status(500).json({ error: error.message });
  }
};

const deleteCliente = async (req, res) => {
  try {
    const { id } = req.params;
    await clientesService.deleteCliente(parseInt(id));
    res.status(204).send();
  } catch (error) {
    console.error("Error en deleteCliente:", error);
    res.status(500).json({ error: error.message });
  }
};

const toggleClienteStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const cliente = await clientesService.toggleClienteStatus(parseInt(id));
    res.json(cliente);
  } catch (error) {
    console.error("Error en toggleClienteStatus:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getClientes,
  createCliente,
  updateCliente,
  deleteCliente,
  toggleClienteStatus,
};