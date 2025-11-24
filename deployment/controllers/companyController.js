const { executeQuery, getOne } = require('../config/database');

// Furniture Companies Controller
const companyController = {
    // Get all furniture companies
    getAllCompanies: async (req, res) => {
        try {
            const { verified, active, search } = req.query;
            
            let query = 'SELECT * FROM furniture_companies WHERE 1=1';
            const params = [];

            // Add filters
            if (verified !== undefined) {
                query += ' AND is_verified = ?';
                params.push(verified === 'true');
            }

            if (active !== undefined) {
                query += ' AND is_active = ?';
                params.push(active === 'true');
            }

            if (search) {
                query += ' AND (company_name LIKE ? OR brand_name LIKE ? OR description LIKE ?)';
                const searchTerm = `%${search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            query += ' ORDER BY rating DESC, total_reviews DESC';

            const result = await executeQuery(query, params);

            if (result.success) {
                res.json({
                    success: true,
                    companies: result.data
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Failed to fetch companies',
                    error: result.error
                });
            }
        } catch (error) {
            console.error('Get companies error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    },

    // Get single company by ID
    getCompanyById: async (req, res) => {
        try {
            const { id } = req.params;

            const company = await getOne(
                'SELECT * FROM furniture_companies WHERE id = ? AND is_active = TRUE',
                [id]
            );

            if (company.success && company.data) {
                res.json({
                    success: true,
                    company: company.data
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'Company not found'
                });
            }
        } catch (error) {
            console.error('Get company error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    },

    // Create new company (Admin only)
    createCompany: async (req, res) => {
        try {
            const {
                companyName,
                brandName,
                description,
                websiteUrl,
                contactEmail,
                contactPhone,
                address,
                city,
                country,
                postalCode,
                establishedYear,
                specialties,
                socialMedia,
                certifications
            } = req.body;

            // Validate required fields
            if (!companyName || !brandName || !contactEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Company name, brand name, and contact email are required'
                });
            }

            // Check if company already exists
            const existingCompany = await getOne(
                'SELECT id FROM furniture_companies WHERE company_name = ? OR brand_name = ?',
                [companyName, brandName]
            );

            if (existingCompany.success && existingCompany.data) {
                return res.status(400).json({
                    success: false,
                    message: 'Company with this name or brand already exists'
                });
            }

            const result = await executeQuery(
                `INSERT INTO furniture_companies 
                (company_name, brand_name, description, website_url, contact_email, contact_phone, 
                address, city, country, postal_code, established_year, specialties, social_media, certifications) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    companyName,
                    brandName,
                    description || null,
                    websiteUrl || null,
                    contactEmail,
                    contactPhone || null,
                    address || null,
                    city || null,
                    country || null,
                    postalCode || null,
                    establishedYear || null,
                    specialties ? JSON.stringify(specialties) : null,
                    socialMedia ? JSON.stringify(socialMedia) : null,
                    certifications ? JSON.stringify(certifications) : null
                ]
            );

            if (result.success) {
                res.status(201).json({
                    success: true,
                    message: 'Company created successfully',
                    companyId: result.data.insertId
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Failed to create company',
                    error: result.error
                });
            }
        } catch (error) {
            console.error('Create company error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    },

    // Update company (Admin only)
    updateCompany: async (req, res) => {
        try {
            const { id } = req.params;
            const updateData = req.body;

            // Remove undefined values
            const filteredData = Object.fromEntries(
                Object.entries(updateData).filter(([_, v]) => v !== undefined)
            );

            if (Object.keys(filteredData).length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No valid fields to update'
                });
            }

            // Build dynamic update query
            const fields = Object.keys(filteredData);
            const values = Object.values(filteredData);
            const setClause = fields.map(field => `${field} = ?`).join(', ');

            const result = await executeQuery(
                `UPDATE furniture_companies SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [...values, id]
            );

            if (result.success) {
                if (result.data.affectedRows > 0) {
                    res.json({
                        success: true,
                        message: 'Company updated successfully'
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        message: 'Company not found'
                    });
                }
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Failed to update company',
                    error: result.error
                });
            }
        } catch (error) {
            console.error('Update company error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    },

    // Delete company (Admin only)
    deleteCompany: async (req, res) => {
        try {
            const { id } = req.params;

            // Soft delete - set is_active to false
            const result = await executeQuery(
                'UPDATE furniture_companies SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [id]
            );

            if (result.success) {
                if (result.data.affectedRows > 0) {
                    res.json({
                        success: true,
                        message: 'Company deleted successfully'
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        message: 'Company not found'
                    });
                }
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Failed to delete company',
                    error: result.error
                });
            }
        } catch (error) {
            console.error('Delete company error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
};

module.exports = companyController;