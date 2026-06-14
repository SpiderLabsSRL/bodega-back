const express = require("express");
const router = express.Router();
const HomeController = require("../controllers/HomeController");

// Product routes
router.get("/home/products", HomeController.getProducts);
router.get("/home/products/search", HomeController.searchProducts);
router.get("/home/products/categories", HomeController.getCategories);
router.get("/home/products/colors", HomeController.getColors);
router.get("/home/products/sizes", HomeController.getSizes);
router.get("/home/products/types", HomeController.getTypes);
router.get("/home/carruseles", HomeController.getCarruseles);

module.exports = router;