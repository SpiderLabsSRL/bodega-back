const reportesService = require("../services/reportesService");

const getProductosMasVendidos = async (req, res) => {
  try {
    const { mes, año } = req.query;
    
    let mesNum = mes ? parseInt(mes) : new Date().getMonth() + 1;
    let añoNum = año ? parseInt(año) : new Date().getFullYear();
    
    // Validar que no sea año futuro
    const añoActual = new Date().getFullYear();
    if (añoNum > añoActual) {
      return res.status(400).json({ 
        error: "No se puede consultar años futuros" 
      });
    }
    
    const productos = await reportesService.obtenerProductosMasVendidos(mesNum, añoNum);
    res.json(productos);
  } catch (error) {
    console.error("Error en getProductosMasVendidos:", error);
    res.status(500).json({ error: error.message });
  }
};

const getProductosSinVender = async (req, res) => {
  try {
    const productos = await reportesService.obtenerProductosSinVender();
    res.json(productos);
  } catch (error) {
    console.error("Error en getProductosSinVender:", error);
    res.status(500).json({ error: error.message });
  }
};

const getAnalisisProductos = async (req, res) => {
  try {
    const { mes, año } = req.query;
    
    if (!mes || !año) {
      return res.status(400).json({ 
        error: "Mes y año son requeridos" 
      });
    }
    
    const mesNum = parseInt(mes);
    const añoNum = parseInt(año);
    
    // Validar que no sea año futuro
    const añoActual = new Date().getFullYear();
    if (añoNum > añoActual) {
      return res.status(400).json({ 
        error: "No se puede consultar años futuros" 
      });
    }
    
    const productos = await reportesService.obtenerAnalisisProductos(mesNum, añoNum);
    res.json(productos);
  } catch (error) {
    console.error("Error en getAnalisisProductos:", error);
    res.status(500).json({ error: error.message });
  }
};

const getObjetivos = async (req, res) => {
  try {
    const { año } = req.query;
    const añoNum = año ? parseInt(año) : new Date().getFullYear();
    
    const objetivos = await reportesService.obtenerObjetivos(añoNum);
    res.json(objetivos);
  } catch (error) {
    console.error("Error en getObjetivos:", error);
    res.status(500).json({ error: error.message });
  }
};

const getObjetivo = async (req, res) => {
  try {
    const { mes, año } = req.query;
    
    if (!mes || !año) {
      return res.status(400).json({ 
        error: "Mes y año son requeridos" 
      });
    }
    
    const mesNum = parseInt(mes);
    const añoNum = parseInt(año);
    
    const objetivo = await reportesService.obtenerObjetivo(mesNum, añoNum);
    
    // SIEMPRE devolver una respuesta, incluso si es null
    res.json(objetivo);
  } catch (error) {
    console.error("Error en getObjetivo:", error);
    // En caso de error, devolver null
    res.json(null);
  }
};

const createOrUpdateObjetivo = async (req, res) => {
  try {
    const { mes, año, monto } = req.body;
    
    if (!mes || !año || !monto) {
      return res.status(400).json({ 
        error: "Mes, año y monto son requeridos" 
      });
    }
    
    const objetivo = await reportesService.crearOActualizarObjetivo(mes, año, monto);
    res.json(objetivo);
  } catch (error) {
    console.error("Error en createOrUpdateObjetivo:", error);
    res.status(500).json({ error: error.message });
  }
};

const getVentasMensuales = async (req, res) => {
  try {
    const { mes, año } = req.query;
    
    if (!mes || !año) {
      return res.status(400).json({ 
        error: "Mes y año son requeridos" 
      });
    }
    
    const mesNum = parseInt(mes);
    const añoNum = parseInt(año);
    
    const ventas = await reportesService.obtenerVentasMensuales(mesNum, añoNum);
    
    // SIEMPRE devolver un resultado
    res.json(ventas);
  } catch (error) {
    console.error("Error en getVentasMensuales:", error);
    // En caso de error, devolver un objeto con valores en 0
    res.json({
      mes: mesNum,
      año: añoNum,
      total_ventas: 0,
      total_ingresos: "0.00"
    });
  }
};

module.exports = {
  getProductosMasVendidos,
  getProductosSinVender,
  getAnalisisProductos,
  getObjetivos,
  getObjetivo,
  createOrUpdateObjetivo,
  getVentasMensuales
};