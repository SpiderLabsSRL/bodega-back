// src/controllers/ManagementSectionController.js
const ManagementSectionService = require("../services/ManagementSectionService");

class ManagementSectionController {
  // ============================================
  // CATEGORÍAS
  // ============================================

  static async getCategorias(req, res) {
    try {
      const categorias = await ManagementSectionService.getCategorias();
      res.json(categorias);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createCategoria(req, res) {
    try {
      const { nombre } = req.body;
      if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: "El nombre es obligatorio" });
      }
      const nuevaCategoria = await ManagementSectionService.createCategoria(nombre.trim());
      res.status(201).json(nuevaCategoria);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  static async updateCategoria(req, res) {
    try {
      const { id } = req.params;
      const { nombre } = req.body;
      if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: "El nombre es obligatorio" });
      }
      const categoriaActualizada = await ManagementSectionService.updateCategoria(parseInt(id), nombre.trim());
      res.json(categoriaActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  static async deleteCategoria(req, res) {
    try {
      const { id } = req.params;
      await ManagementSectionService.deleteCategoria(parseInt(id));
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  // ============================================
  // UBICACIONES
  // ============================================

  static async getUbicaciones(req, res) {
    try {
      const { bodega } = req.query;
      const ubicaciones = await ManagementSectionService.getUbicaciones(bodega);
      res.json(ubicaciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createUbicacion(req, res) {
    try {
      const { nombre, idbodega } = req.body;
      if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: "El nombre es obligatorio" });
      }
      
      // Si no se envía idbodega, se asigna null (ubicación sin bodega)
      const bodegaId = idbodega !== undefined && idbodega !== null ? parseInt(idbodega) : null;
      
      const nuevaUbicacion = await ManagementSectionService.createUbicacion(
        nombre.trim(),
        bodegaId
      );
      res.status(201).json(nuevaUbicacion);
    } catch (error) {
      console.error("Error en createUbicacion:", error);
      res.status(400).json({ error: error.message });
    }
  }

  static async updateUbicacion(req, res) {
    try {
      const { id } = req.params;
      const { nombre, idbodega } = req.body;
      if (!nombre || !nombre.trim()) {
        return res.status(400).json({ error: "El nombre es obligatorio" });
      }
      
      const bodegaId = idbodega !== undefined && idbodega !== null ? parseInt(idbodega) : null;
      
      const ubicacionActualizada = await ManagementSectionService.updateUbicacion(
        parseInt(id),
        nombre.trim(),
        bodegaId
      );
      res.json(ubicacionActualizada);
    } catch (error) {
      console.error("Error en updateUbicacion:", error);
      res.status(400).json({ error: error.message });
    }
  }

  static async deleteUbicacion(req, res) {
    try {
      const { id } = req.params;
      await ManagementSectionService.deleteUbicacion(parseInt(id));
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
}

module.exports = ManagementSectionController;