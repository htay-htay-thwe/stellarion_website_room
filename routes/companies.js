const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Public routes
router.get('/', companyController.getAllCompanies);
router.get('/:id', companyController.getCompanyById);

// Admin routes
router.post('/', authenticateToken, requireAdmin, companyController.createCompany);
router.put('/:id', authenticateToken, requireAdmin, companyController.updateCompany);
router.delete('/:id', authenticateToken, requireAdmin, companyController.deleteCompany);

module.exports = router;