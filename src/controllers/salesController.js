// src/controllers/salesController.js
const salesService = require("../services/salesService");

const searchProducts = async (req, res) => {
  try {
    const { q, withoutStock, bodega } = req.query;

    const withoutStockParam =
      withoutStock !== undefined ? withoutStock === "true" : true;

    if (!bodega) {
      console.log("⚠️ No se proporcionó bodega para búsqueda de productos");
      return res.json([]);
    }

    const products = await salesService.searchProducts(q, withoutStockParam, bodega);
    res.json(products);
  } catch (error) {
    console.error("Error in searchProducts:", error);
    res.status(500).json({ error: error.message });
  }
};

const searchClientes = async (req, res) => {
  try {
    const { q } = req.query;
    
    console.log("Buscando clientes con termino:", q);
    
    if (!q || q.trim().length < 2) {
      console.log("Termino de búsqueda demasiado corto");
      return res.json([]);
    }

    const clientes = await salesService.searchClientes(q);
    console.log("Clientes encontrados:", clientes.length);
    res.json(clientes);
  } catch (error) {
    console.error("Error in searchClientes:", error);
    res.status(500).json({ error: error.message });
  }
};

const processSale = async (req, res) => {
  try {
    const saleData = req.body;
    console.log("📥 Datos de venta recibidos:", saleData);

    const userId = saleData.userId || req.headers["user-id"];
    let idbodega = saleData.idbodega || req.headers["bodega-id"];
    
    console.log("👤 userId:", userId);
    console.log("🏢 idbodega:", idbodega);

    if (!userId) {
      return res.status(401).json({ error: "Se requiere ID de usuario" });
    }

    const result = await salesService.processSale(saleData, userId, idbodega);
    res.json(result);
  } catch (error) {
    console.error("Error in processSale:", error);
    // Enviar mensaje de error específico para caja cerrada
    if (error.message.includes("caja está cerrada")) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

// Nuevo endpoint para obtener el estado de la caja
const getEstadoCaja = async (req, res) => {
  try {
    const { idbodega, tipo } = req.query;
    
    if (!idbodega || !tipo) {
      return res.status(400).json({ error: "Se requiere idbodega y tipo" });
    }
    
    const estado = await salesService.getEstadoCaja(parseInt(idbodega), tipo);
    res.json({ estado });
  } catch (error) {
    console.error("Error getting estado caja:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  searchProducts,
  searchClientes,
  processSale,
  getEstadoCaja,
};