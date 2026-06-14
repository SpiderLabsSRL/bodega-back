const notesService = require("../services/notesService");

const getNotes = async (req, res) => {
  try {
    const notes = await notesService.getNotes();
    res.json(notes);
  } catch (error) {
    console.error("Error en getNotes:", error);
    res.status(500).json({ error: error.message });
  }
};

const createNote = async (req, res) => {
  try {
    const { titulo, contenido } = req.body;
    
    if (!titulo || !contenido) {
      return res.status(400).json({ error: "Título y contenido son requeridos" });
    }

    const newNote = await notesService.createNote(titulo, contenido);
    res.status(201).json(newNote);
  } catch (error) {
    console.error("Error en createNote:", error);
    res.status(500).json({ error: error.message });
  }
};

const updateNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, contenido } = req.body;
    
    if (!titulo || !contenido) {
      return res.status(400).json({ error: "Título y contenido son requeridos" });
    }

    const updatedNote = await notesService.updateNote(id, titulo, contenido);
    res.json(updatedNote);
  } catch (error) {
    console.error("Error en updateNote:", error);
    res.status(500).json({ error: error.message });
  }
};

const deleteNote = async (req, res) => {
  try {
    const { id } = req.params;
    await notesService.deleteNote(id);
    res.status(204).send();
  } catch (error) {
    console.error("Error en deleteNote:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getNotes,
  createNote,
  updateNote,
  deleteNote
};