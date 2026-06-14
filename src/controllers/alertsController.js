const alertsService = require("../services/alertsService");

const getLowStockAlerts = async (req, res) => {
  try {
    const lowStockProducts = await alertsService.getLowStockAlerts();
    res.json(lowStockProducts);
  } catch (error) {
    console.error("Error en getLowStockAlerts:", error);
    res.status(500).json({ 
      error: "Error al obtener productos con stock bajo",
      details: error.message 
    });
  }
};

const getCriticalStockAlerts = async (req, res) => {
  try {
    const criticalStockProducts = await alertsService.getCriticalStockAlerts();
    res.json(criticalStockProducts);
  } catch (error) {
    console.error("Error en getCriticalStockAlerts:", error);
    res.status(500).json({ 
      error: "Error al obtener productos con stock crítico",
      details: error.message 
    });
  }
};

module.exports = {
  getLowStockAlerts,
  getCriticalStockAlerts
};