const HomeService = require("../services/HomeService");

class HomeController {
  async getProducts(req, res) {
    try {
      console.log("getProducts query:", req.query);
      const { categoria, color, tamano, tipo } = req.query;
      const filters = {
        categoria: categoria || null,
        color: color || null,
        tamano: tamano || null,
        tipo: tipo || null
      };
      
      const products = await HomeService.getProducts(filters);
      console.log(`Returning ${products.length} products`);
      res.json(products);
    } catch (error) {
      console.error("Error in getProducts:", error);
      res.status(500).json({ 
        error: "Error al obtener productos",
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  async searchProducts(req, res) {
    try {
      const { q } = req.query;
      console.log("searchProducts query:", q);
      
      if (!q) {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }
      
      const products = await HomeService.searchProducts(q);
      console.log(`Returning ${products.length} search results`);
      res.json(products);
    } catch (error) {
      console.error("Error in searchProducts:", error);
      res.status(500).json({ 
        error: "Error al buscar productos",
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  async getCategories(req, res) {
    try {
      console.log("getCategories called");
      const categories = await HomeService.getCategories();
      console.log(`Returning ${categories.length} categories`);
      res.json(categories);
    } catch (error) {
      console.error("Error in getCategories:", error);
      res.status(500).json({ 
        error: "Error al obtener categorías",
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  async getColors(req, res) {
    try {
      console.log("getColors called");
      const colors = await HomeService.getColors();
      console.log(`Returning ${colors.length} colors`);
      res.json(colors);
    } catch (error) {
      console.error("Error in getColors:", error);
      res.status(500).json({ 
        error: "Error al obtener colores",
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  async getSizes(req, res) {
    try {
      console.log("getSizes called");
      const sizes = await HomeService.getSizes();
      console.log(`Returning ${sizes.length} sizes`);
      res.json(sizes);
    } catch (error) {
      console.error("Error in getSizes:", error);
      res.status(500).json({ 
        error: "Error al obtener tamaños",
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  async getTypes(req, res) {
    try {
      console.log("getTypes called");
      const types = await HomeService.getTypes();
      console.log(`Returning ${types.length} types`);
      res.json(types);
    } catch (error) {
      console.error("Error in getTypes:", error);
      res.status(500).json({ 
        error: "Error al obtener tipos",
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  async getCarruseles(req, res) {
    try {
      console.log("getCarruseles called");
      const carruseles = await HomeService.getCarruseles();
      console.log(`Returning ${carruseles.length} carruseles`);
      res.json(carruseles);
    } catch (error) {
      console.error("Error in getCarruseles:", error);
      res.json([]); // Retornar array vacío en caso de error
    }
  }
}

module.exports = new HomeController();