const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { executeQuery, getOne } = require('../config/database');

const JWT_SECRET = (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) || 'stellarion-dev-secret';

// User Controller
const userController = {
    // Register new user
    register: async (req, res) => {
        try {
            const { username, email, password, firstName, lastName, phone, address, city, country } = req.body;

            // Validate required fields
            if (!username || !email || !password || !firstName || !lastName) {
                return res.status(400).json({
                    success: false,
                    message: 'Username, email, password, first name, and last name are required'
                });
            }

            // Check if user already exists
            const existingUser = await getOne(
                'SELECT id FROM users WHERE email = ? OR username = ?',
                [email, username]
            );

            if (existingUser.success && existingUser.data) {
                return res.status(400).json({
                    success: false,
                    message: 'User with this email or username already exists'
                });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert new user
            const result = await executeQuery(
                `INSERT INTO users (username, email, password, first_name, last_name, phone, address, city, country) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [username, email, hashedPassword, firstName, lastName, phone || null, address || null, city || null, country || null]
            );

            if (result.success) {
                // Generate JWT token
                const token = jwt.sign(
                    { userId: result.data.insertId, username, email },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.status(201).json({
                    success: true,
                    message: 'User registered successfully',
                    token,
                    user: {
                        id: result.data.insertId,
                        username,
                        email,
                        firstName,
                        lastName
                    }
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Registration failed',
                    error: result.error
                });
            }
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    },

    // User login
    login: async (req, res) => {
        try {
            const { login, password } = req.body; // login can be email or username

            if (!login || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Email/username and password are required'
                });
            }

            // Find user by email or username
            const user = await getOne(
                'SELECT * FROM users WHERE (email = ? OR username = ?) AND (is_active IS NULL OR is_active = TRUE) LIMIT 1',
                [login, login]
            );

            if (!user.success) {
                console.error('Login lookup failed:', user.error);
                return res.status(500).json({
                    success: false,
                    message: 'Unable to process login right now.'
                });
            }

            if (!user.data) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            const userRecord = user.data;

            // Verify password
            const isPasswordValid = userRecord.password
                ? await bcrypt.compare(password, userRecord.password)
                : false;

            if (!isPasswordValid) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            // Generate JWT token
            const token = jwt.sign(
                {
                    userId: userRecord.id,
                    username: userRecord.username,
                    email: userRecord.email,
                    userType: userRecord.user_type
                },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                message: 'Login successful',
                token,
                user: {
                    id: userRecord.id,
                    username: userRecord.username,
                    email: userRecord.email,
                    firstName: userRecord.first_name,
                    lastName: userRecord.last_name,
                    userType: userRecord.user_type
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    },

    // Get user profile
    getProfile: async (req, res) => {
        try {
            const userId = req.user.userId;

            const user = await getOne(
                'SELECT id, username, email, first_name, last_name, phone, address, city, country, user_type, profile_image, created_at FROM users WHERE id = ? AND is_active = TRUE',
                [userId]
            );

            if (user.success && user.data) {
                res.json({
                    success: true,
                    user: user.data
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }
        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    },

    // Update user profile
    updateProfile: async (req, res) => {
        try {
            const userId = req.user.userId;
            const { firstName, lastName, phone, address, city, country } = req.body;

            const result = await executeQuery(
                'UPDATE users SET first_name = ?, last_name = ?, phone = ?, address = ?, city = ?, country = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [firstName, lastName, phone, address, city, country, userId]
            );

            if (result.success) {
                res.json({
                    success: true,
                    message: 'Profile updated successfully'
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Failed to update profile',
                    error: result.error
                });
            }
        } catch (error) {
            console.error('Update profile error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
};

module.exports = userController;