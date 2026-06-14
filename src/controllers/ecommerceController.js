// src/controllers/ecommerceController.js
const ecommerceService = require("../services/ecommerceService");

const getCarruseles = async (req, res) => {
  try {
    const carruseles = await ecommerceService.getCarruseles();
    res.json(carruseles);
  } catch (error) {
    console.error("Error en getCarruseles:", error);
    res.status(500).json({ error: error.message });
  }
};

const createCarrusel = async (req, res) => {
  try {
    const { nombre } = req.body;
    
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: "El nombre del carrusel es requerido" });
    }
    
    const nuevoCarrusel = await ecommerceService.createCarrusel(nombre.trim());
    res.status(201).json(nuevoCarrusel);
  } catch (error) {
    console.error("Error en createCarrusel:", error);
    res.status(500).json({ error: error.message });
  }
};

const updateCarrusel = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre } = req.body;
    
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: "El nombre del carrusel es requerido" });
    }
    
    const carruselActualizado = await ecommerceService.updateCarrusel(id, nombre.trim());
    res.json(carruselActualizado);
  } catch (error) {
    console.error("Error en updateCarrusel:", error);
    
    if (error.message === "Carrusel no encontrado") {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
};

const deleteCarrusel = async (req, res) => {
  try {
    const { id } = req.params;
    await ecommerceService.deleteCarrusel(id);
    res.status(204).send();
  } catch (error) {
    console.error("Error en deleteCarrusel:", error);
    
    if (error.message === "Carrusel no encontrado") {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
};

const getCarruselProductos = async (req, res) => {
  try {
    const { id } = req.params;
    const productos = await ecommerceService.getCarruselProductos(id);
    res.json(productos);
  } catch (error) {
    console.error("Error en getCarruselProductos:", error);
    res.status(500).json({ error: error.message });
  }
};

const addCarruselProductos = async (req, res) => {
  try {
    const { id } = req.params;
    const { productos } = req.body;
    
    if (!productos || !Array.isArray(productos)) {
      return res.status(400).json({ error: "El campo 'productos' es requerido y debe ser un array" });
    }
    
    // Validar que todos los productos sean números válidos
    const productosInvalidos = productos.filter(p => isNaN(parseInt(p)) || parseInt(p) <= 0);
    if (productosInvalidos.length > 0) {
      return res.status(400).json({ error: "Los IDs de productos deben ser números válidos" });
    }
    
    await ecommerceService.addCarruselProductos(id, productos);
    res.status(201).json({ 
      message: "Productos agregados al carrusel exitosamente",
      productosAgregados: productos.length
    });
  } catch (error) {
    console.error("Error en addCarruselProductos:", error);
    
    if (error.message.includes("no encontrado") || error.message.includes("inactivo")) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
};

const updateCarruselProductos = async (req, res) => {
  try {
    const { id } = req.params;
    const { productos } = req.body;
    
    if (!productos || !Array.isArray(productos)) {
      return res.status(400).json({ error: "El campo 'productos' es requerido y debe ser un array" });
    }
    
    // Validar que todos los productos sean números válidos
    const productosInvalidos = productos.filter(p => isNaN(parseInt(p)) || parseInt(p) <= 0);
    if (productosInvalidos.length > 0) {
      return res.status(400).json({ error: "Los IDs de productos deben ser números válidos" });
    }
    
    await ecommerceService.updateCarruselProductos(id, productos);
    res.json({ 
      message: "Productos del carrusel actualizados exitosamente",
      productosActualizados: productos.length
    });
  } catch (error) {
    console.error("Error en updateCarruselProductos:", error);
    
    if (error.message.includes("no encontrado") || error.message.includes("inactivo")) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
};

const getProductos = async (req, res) => {
  try {
    const productos = await ecommerceService.getProductos();
    res.json(productos);
  } catch (error) {
    console.error("Error en getProductos:", error);
    res.status(500).json({ error: error.message });
  }
};

const getProductoCategorias = async (req, res) => {
  try {
    const { id } = req.params;
    const categorias = await ecommerceService.getProductoCategorias(id);
    res.json(categorias);
  } catch (error) {
    console.error("Error en getProductoCategorias:", error);
    res.status(500).json({ error: error.message });
  }
};

const searchProductos = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({ error: "El término de búsqueda es requerido" });
    }
    
    const productos = await ecommerceService.searchProductos(q.trim());
    res.json(productos);
  } catch (error) {
    console.error("Error en searchProductos:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getCarruseles,
  createCarrusel,
  updateCarrusel,
  deleteCarrusel,
  getCarruselProductos,
  addCarruselProductos,
  updateCarruselProductos,
  getProductos,
  getProductoCategorias,
  searchProductos
};