const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { executeQuery, getOne } = require('../config/database');

const LOGO_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'company-logos');
fs.mkdirSync(LOGO_UPLOAD_DIR, { recursive: true });

const sanitizeFileName = (value = '') => value.toString().trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-');

const determineImageExtension = (mimeType) => {
    switch (mimeType) {
        case 'image/jpeg':
        case 'image/jpg':
            return '.jpg';
        case 'image/png':
            return '.png';
        case 'image/webp':
            return '.webp';
        case 'image/svg+xml':
            return '.svg';
        default:
            return '.png';
    }
};

const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

async function saveCompanyLogoFromDataUri(dataUri, brandName) {
    if (typeof dataUri !== 'string' || dataUri.length === 0) {
        throw new Error('Logo data must be a non-empty string');
    }

    const matches = dataUri.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!matches) {
        throw new Error('Invalid logo data URI');
    }

    const mimeType = matches[1];
    const base64Payload = matches[2];
    const buffer = Buffer.from(base64Payload, 'base64');

    if (buffer.length > MAX_LOGO_SIZE_BYTES) {
        throw new Error('Logo file is too large');
    }

    const extension = determineImageExtension(mimeType);
    const safeBaseName = sanitizeFileName(brandName || `company-${Date.now()}`) || 'company';
    const fileName = `${safeBaseName}-${Date.now()}${extension}`;
    const filePath = path.join(LOGO_UPLOAD_DIR, fileName);

    await fsPromises.writeFile(filePath, buffer);
    return `/uploads/company-logos/${fileName}`;
}

// Company Registration Controller
const companyRegistrationController = {
    // Register new company (creates user + company profile)
    registerCompany: async (req, res) => {
        try {
            const {
                companyName,
                brandName,
                contactEmail,
                contactPhone,
                websiteUrl,
                description,
                city,
                country,
                password,
                logoUrl,
                logoData
            } = req.body;

            // Validate required fields
            if (!companyName || !brandName || !contactEmail || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Company name, brand name, contact email, and password are required'
                });
            }

            // Check if email already exists
            const existingUser = await getOne(
                'SELECT id FROM users WHERE email = ?',
                [contactEmail]
            );

            if (existingUser.success && existingUser.data) {
                return res.status(400).json({
                    success: false,
                    message: 'An account with this email already exists'
                });
            }

            // Check if company name already exists
            const existingCompany = await getOne(
                'SELECT id FROM company_profiles WHERE company_name = ? OR brand_name = ?',
                [companyName, brandName]
            );

            if (existingCompany.success && existingCompany.data) {
                return res.status(400).json({
                    success: false,
                    message: 'A company with this name or brand already exists'
                });
            }

            let storedLogoUrl = logoUrl || null;
            if (logoData) {
                try {
                    storedLogoUrl = await saveCompanyLogoFromDataUri(logoData, brandName || companyName);
                } catch (error) {
                    console.error('Company logo processing failed:', error);
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid company logo. Please upload a valid image under 5 MB.',
                        error: error.message
                    });
                }
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Create username from company name
            const username = brandName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_') + '_company';

            // Start transaction by creating user first
            const userResult = await executeQuery(
                `INSERT INTO users (username, email, password, first_name, last_name, phone, city, country, user_type) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'company')`,
                [
                    username,
                    contactEmail,
                    hashedPassword,
                    brandName,
                    'Company',
                    contactPhone || null,
                    city || null,
                    country || null
                ]
            );

            if (!userResult.success) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to create user account',
                    error: userResult.error
                });
            }

            const userId = userResult.data.insertId;

            // Create company profile
            const companyResult = await executeQuery(
                `INSERT INTO company_profiles (
                    user_id,
                    company_name,
                    brand_name,
                    description,
                    website_url,
                    contact_email,
                    contact_phone,
                    city,
                    country,
                    logo_url
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    companyName,
                    brandName,
                    description || null,
                    websiteUrl || null,
                    contactEmail,
                    contactPhone || null,
                    city || null,
                    country || null,
                    storedLogoUrl
                ]
            );

            if (!companyResult.success) {
                // Rollback user creation if company profile fails
                await executeQuery('DELETE FROM users WHERE id = ?', [userId]);
                
                return res.status(500).json({
                    success: false,
                    message: 'Failed to create company profile',
                    error: companyResult.error
                });
            }

            // Generate JWT token
            const token = jwt.sign(
                { 
                    userId: userId, 
                    username: username, 
                    email: contactEmail,
                    userType: 'company',
                    companyId: companyResult.data.insertId
                },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.status(201).json({
                success: true,
                message: 'Company account created successfully',
                token,
                user: {
                    id: userId,
                    username: username,
                    email: contactEmail,
                    userType: 'company',
                    companyName: companyName,
                    brandName: brandName,
                    logoUrl: storedLogoUrl
                }
            });

        } catch (error) {
            console.error('Company registration error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    },

    // Get company profile by user ID
    getCompanyProfile: async (req, res) => {
        try {
            const userId = req.user.userId;

            // Verify user is a company
            if (req.user.userType !== 'company') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Company account required.'
                });
            }

            const company = await getOne(
                `SELECT u.id as user_id, u.username, u.email, u.phone, u.city, u.country, u.created_at,
                        cp.id as company_id, cp.company_name, cp.brand_name, cp.description, cp.website_url,
                        cp.contact_email, cp.contact_phone, cp.address, cp.established_year, cp.logo_url,
                        cp.banner_image, cp.specialties, cp.rating, cp.total_reviews, cp.is_verified,
                        cp.is_active, cp.social_media, cp.certifications
                 FROM users u 
                 JOIN company_profiles cp ON u.id = cp.user_id 
                 WHERE u.id = ? AND u.is_active = TRUE`,
                [userId]
            );

            if (company.success && company.data) {
                res.json({
                    success: true,
                    company: company.data
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'Company profile not found'
                });
            }
        } catch (error) {
            console.error('Get company profile error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    },

    // Update company profile
    updateCompanyProfile: async (req, res) => {
        try {
            const userId = req.user.userId;

            // Verify user is a company
            if (req.user.userType !== 'company') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Company account required.'
                });
            }

            const {
                companyName,
                brandName,
                description,
                websiteUrl,
                contactPhone,
                address,
                city,
                country,
                establishedYear,
                specialties,
                socialMedia,
                logoUrl,
                logoData
            } = req.body;

            let processedLogoUrl = null;
            if (logoData) {
                try {
                    processedLogoUrl = await saveCompanyLogoFromDataUri(logoData, brandName || companyName || req.user.username);
                } catch (error) {
                    console.error('Company logo update failed:', error);
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid company logo. Please upload a valid image under 5 MB.',
                        error: error.message
                    });
                }
            } else if (logoUrl) {
                processedLogoUrl = logoUrl;
            }

            // Update company profile
            const result = await executeQuery(
                `UPDATE company_profiles SET 
                 company_name = COALESCE(?, company_name),
                 brand_name = COALESCE(?, brand_name),
                 description = COALESCE(?, description),
                 website_url = COALESCE(?, website_url),
                 logo_url = COALESCE(?, logo_url),
                 contact_phone = COALESCE(?, contact_phone),
                 address = COALESCE(?, address),
                 city = COALESCE(?, city),
                 country = COALESCE(?, country),
                 established_year = COALESCE(?, established_year),
                 specialties = COALESCE(?, specialties),
                 social_media = COALESCE(?, social_media),
                 updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = ?`,
                [
                    companyName,
                    brandName,
                    description,
                    websiteUrl,
                    processedLogoUrl,
                    contactPhone,
                    address,
                    city,
                    country,
                    establishedYear,
                    specialties ? JSON.stringify(specialties) : null,
                    socialMedia ? JSON.stringify(socialMedia) : null,
                    userId
                ]
            );

            if (result.success) {
                res.json({
                    success: true,
                    message: 'Company profile updated successfully'
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Failed to update company profile',
                    error: result.error
                });
            }
        } catch (error) {
            console.error('Update company profile error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    },

    // Get all companies (public endpoint)
    getAllCompanies: async (req, res) => {
        try {
            const { verified, search, limit = 20, offset = 0 } = req.query;

            let query = `
                SELECT u.username, u.email as user_email, u.created_at as user_created,
                       cp.id, cp.company_name, cp.brand_name, cp.description, cp.website_url,
                       cp.contact_email, cp.contact_phone, cp.city, cp.country, cp.established_year,
                       cp.logo_url, cp.banner_image, cp.specialties, cp.rating, cp.total_reviews,
                       cp.is_verified, cp.social_media, cp.certifications, cp.created_at
                FROM users u 
                JOIN company_profiles cp ON u.id = cp.user_id 
                WHERE u.is_active = TRUE AND cp.is_active = TRUE`;
            
            const params = [];

            // Add filters
            if (verified !== undefined) {
                query += ' AND cp.is_verified = ?';
                params.push(verified === 'true');
            }

            if (search) {
                query += ' AND (cp.company_name LIKE ? OR cp.brand_name LIKE ? OR cp.description LIKE ?)';
                const searchTerm = `%${search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            query += ' ORDER BY cp.rating DESC, cp.total_reviews DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));

            const result = await executeQuery(query, params);

            if (result.success) {
                res.json({
                    success: true,
                    companies: result.data,
                    pagination: {
                        limit: parseInt(limit),
                        offset: parseInt(offset),
                        total: result.data.length
                    }
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
    }
};

module.exports = companyRegistrationController;