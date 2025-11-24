const express = require('express');
const router = express.Router();
const companyRegistrationController = require('../controllers/companyRegistrationController');
const { authenticateToken } = require('../middleware/auth');

// Public company registration
router.post('/register', companyRegistrationController.registerCompany);

// Public endpoint to get all companies
router.get('/', companyRegistrationController.getAllCompanies);

// Protected company profile routes
router.get('/profile', authenticateToken, companyRegistrationController.getCompanyProfile);
router.put('/profile', authenticateToken, companyRegistrationController.updateCompanyProfile);

module.exports = router;