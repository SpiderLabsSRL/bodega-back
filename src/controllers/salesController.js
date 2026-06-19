const salesService = require("../services/salesService");

const searchProducts = async (req, res) => {
  try {
    const { q, withoutStock, bodega } = req.query;

    const withoutStockParam =
      withoutStock !== undefined ? withoutStock === "true" : true;

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

    const userId = saleData.userId || req.headers["user-id"];
    const idbodega = saleData.idbodega || req.headers["bodega-id"];

    if (!userId) {
      return res.status(401).json({ error: "Se requiere ID de usuario" });
    }

    const result = await salesService.processSale(saleData, userId, idbodega);
    res.json(result);
  } catch (error) {
    console.error("Error in processSale:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  searchProducts,
  searchClientes,
  processSale,
};