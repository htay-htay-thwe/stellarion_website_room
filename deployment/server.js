// ============================================
// STELLARION - FULL STACK BACKEND SERVER
// Node.js Express Server with MySQL Database & Meshy API
// ============================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const FormData = require('form-data');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('./middleware/auth');
require('dotenv').config();

// Database connection
const { testConnection, initializeDatabase, getConnection } = require('./config/database');

// Import routes
const userRoutes = require('./routes/users');
const companyRoutes = require('./routes/companies');
const companyRegistrationRoutes = require('./routes/companyRegistration');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 3000;

// Meshy AI API Configuration
const MESHY_API_KEY = process.env.MESHY_API_KEY || 'msy_BO62XMcAXyvcYttvXRLCQx4OSnyKJaUHCoOG';
const MESHY_API_BASE = process.env.MESHY_API_BASE || 'https://api.meshy.ai/openapi/v1/image-to-3d';

// Middleware
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'https://stellarion.studio',
        'http://stellarion.studio',
        'https://159.223.34.170',
        'http://159.223.34.170'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.')); // Serve static files

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// ============================================
// DATABASE API ROUTES
// ============================================
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/company-registration', companyRegistrationRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api', orderRoutes);

// ============================================
// 3D MODELS DATABASE ENDPOINTS
// ============================================

/**
 * Save 3D model to database
 * POST /api/models/save
 */
app.post('/api/models/save', async (req, res) => {
    try {
        const { name, taskId, downloadUrl, thumbnailUrl, originalImage } = req.body;
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Decode JWT to get user ID (simple version - in production use proper JWT verification)
        const userId = 1; // For now, using default user ID

        const connection = await getConnection();
        const query = `
            INSERT INTO 3d_models (user_id, name, task_id, original_image_url, thumbnail_url, download_url, status)
            VALUES (?, ?, ?, ?, ?, ?, 'completed')
        `;
        
        const [result] = await connection.execute(query, [
            userId, name, taskId, originalImage, thumbnailUrl, downloadUrl
        ]);

        res.json({
            success: true,
            message: 'Model saved successfully',
            modelId: result.insertId
        });
    } catch (error) {
        console.error('Save model error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save model',
            error: error.message
        });
    }
});

/**
 * Get user's 3D models
 * GET /api/models/my-models
 */
app.get('/api/models/my-models', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const userId = 1; // For now, using default user ID

        const connection = await getConnection();
        const query = `
            SELECT 
                id, name, thumbnail_url, download_url, status, created_at,
                (SELECT COUNT(*) FROM model_likes WHERE model_id = 3d_models.id) as likes_count,
                (SELECT COUNT(*) FROM model_downloads WHERE model_id = 3d_models.id) as downloads_count
            FROM 3d_models 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `;
        
        const [models] = await connection.execute(query, [userId]);

        res.json({
            success: true,
            models: models
        });
    } catch (error) {
        console.error('Get models error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get models',
            error: error.message
        });
    }
});

/**
 * Get public model gallery
 * GET /api/models/gallery
 */
app.get('/api/models/gallery', async (req, res) => {
    try {
        const connection = await getConnection();
        const query = `
            SELECT * FROM model_gallery
            LIMIT 50
        `;
        
        const [models] = await connection.execute(query);

        res.json({
            success: true,
            models: models
        });
    } catch (error) {
        console.error('Get gallery error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get gallery',
            error: error.message
        });
    }
});

/**
 * Delete 3D model
 * DELETE /api/models/:id
 */
app.delete('/api/models/:id', async (req, res) => {
    try {
        const modelId = req.params.id;
        const token = req.headers.authorization?.replace('Bearer ', '');
        const userId = 1; // For now, using default user ID

        const connection = await getConnection();
        const query = 'DELETE FROM 3d_models WHERE id = ? AND user_id = ?';
        
        const [result] = await connection.execute(query, [modelId, userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Model not found or not authorized'
            });
        }

        res.json({
            success: true,
            message: 'Model deleted successfully'
        });
    } catch (error) {
        console.error('Delete model error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete model',
            error: error.message
        });
    }
});

// ============================================
// MESHY API ENDPOINTS
// ============================================

/**
 * Upload image and create 3D model task
 * POST /api/create-3d-model
 * Body: FormData with image file and name
 */
app.post('/api/create-3d-model', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No image file provided'
            });
        }

        const { name, details } = req.body;
        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Model name is required'
            });
        }

        // Parse model details if provided
        let modelDetails = {};
        if (details) {
            try {
                modelDetails = JSON.parse(details);
            } catch (e) {
                console.warn('Invalid details JSON, using empty object');
            }
        }

        console.log('Creating 3D model for:', name);
        console.log('Model details:', modelDetails);
        console.log('File size:', req.file.size, 'bytes');
        console.log('File type:', req.file.mimetype);

        // Convert image buffer to base64 data URL
        const imageBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

        console.log('Sending request to Meshy API...');

        // Create image-to-3D task with base64 image
        const response = await axios.post(
            MESHY_API_BASE,
            {
                image_url: imageBase64,
                enable_pbr: true,
                ai_model: 'meshy-4',
                topology: 'quad',
                target_polycount: 30000
            },
            {
                headers: {
                    'Authorization': `Bearer ${MESHY_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('3D Task created:', response.data);

        res.json({
            success: true,
            taskId: response.data.result,
            message: '3D model generation started',
            details: modelDetails
        });

    } catch (error) {
        console.error('Error creating 3D model:', error.response?.data || error.message);
        
        let errorMessage = error.message;
        if (error.response?.data) {
            errorMessage = typeof error.response.data === 'string' 
                ? error.response.data 
                : error.response.data.message || JSON.stringify(error.response.data);
        }
        
        res.status(error.response?.status || 500).json({
            success: false,
            error: errorMessage,
            details: error.response?.data
        });
    }
});

/**
 * Check 3D model generation status
 * GET /api/check-status/:id
 */
app.get('/api/check-status/:id', authenticateToken, async (req, res) => {
    try {
        const { taskId } = req.params;

        const response = await axios.get(
            `${MESHY_API_BASE}/${taskId}`,
            {
                headers: {
                    'Authorization': `Bearer ${MESHY_API_KEY}`
                }
            }
        );

        res.json({
            success: true,
            status: response.data.status,
            progress: response.data.progress,
            modelUrl: response.data.model_urls?.glb,
            thumbnailUrl: response.data.thumbnail_url,
            data: response.data
        });

    } catch (error) {
        console.error('Error checking 3D status:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

/**
 * Download 3D model GLB file
 * GET /api/download/:taskId
 */
app.get('/api/download/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;

        // Get task details
        const taskResponse = await axios.get(
            `${MESHY_API_BASE}/${taskId}`,
            {
                headers: {
                    'Authorization': `Bearer ${MESHY_API_KEY}`
                }
            }
        );

        const glbUrl = taskResponse.data.model_urls?.glb;

        if (!glbUrl) {
            return res.status(404).json({
                success: false,
                error: 'Model not ready yet'
            });
        }

        // Download the GLB file
        const fileResponse = await axios.get(glbUrl, {
            responseType: 'arraybuffer'
        });

        res.setHeader('Content-Type', 'model/gltf-binary');
        res.setHeader('Content-Disposition', `attachment; filename="model-${taskId}.glb"`);
        res.send(fileResponse.data);

    } catch (error) {
        console.error('Error downloading model:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

// ============================================
// GENERAL API ENDPOINTS
// ============================================

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Stellarion API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        features: ['Database', 'Meshy 3D API', 'User Authentication']
    });
});

// Root route - serve the main page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============================================
// START SERVER
// ============================================

const startServer = async () => {
    try {
        // Test database connection
        console.log('🔄 Connecting to database...');
        const dbConnected = await testConnection();
        if (dbConnected) {
            await initializeDatabase();
        } else {
            console.log('⚠️  Starting server without database connection');
            console.log('📝 Make sure MySQL is running and check your .env file');
        }

        app.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════════╗
║         🚀 STELLARION SERVER RUNNING! 🚀          ║
╚═══════════════════════════════════════════════════╝

🌐 Server URL: http://localhost:${PORT}
📊 Database: ${process.env.DB_NAME || 'stellarion_furniture'}
🔗 Environment: ${process.env.NODE_ENV || 'development'}
🎯 3D API: Meshy AI Integration Ready

📋 Database API Endpoints:
   🔐 POST /api/users/register    - User registration
   🔑 POST /api/users/login       - User login
   👤 GET  /api/users/profile     - Get user profile
   ✏️  PUT  /api/users/profile     - Update profile
   🏢 POST /api/company-registration/register - Company registration
   🏢 GET  /api/company-registration/profile  - Get company profile
   🏢 PUT  /api/company-registration/profile  - Update company profile
   🏢 GET  /api/company-registration/         - Get all companies
   🏢 GET  /api/companies         - Get all companies (legacy)
   🏢 GET  /api/companies/:id     - Get company by ID (legacy)
   ➕ POST /api/companies         - Create company (Admin)
   ✏️  PUT  /api/companies/:id     - Update company (Admin)
   ❌ DEL  /api/companies/:id     - Delete company (Admin)

📋 3D Model API Endpoints:
   🎨 POST /api/create-3d-model   - Create 3D from image
   📊 GET  /api/check-status/:id  - Check 3D generation status
   📥 GET  /api/download/:id      - Download 3D model
   💾 POST /api/models/save       - Save model to database
   📁 GET  /api/models/my-models  - Get user's models
   🖼️  GET  /api/models/gallery    - Get public model gallery
   🗑️  DEL  /api/models/:id       - Delete user's model

📋 General Endpoints:
   ❤️  GET  /api/health           - Health check

Ready for users and 3D model generation! 🎉
            `);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

// Error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});

startServer();
