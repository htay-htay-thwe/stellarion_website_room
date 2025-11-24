const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'stellarion_furniture',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Provide direct access to a pooled connection when a transaction or
// multiple sequential queries need to share the same connection.
const getConnection = async () => {
    const connection = await pool.getConnection();
    return connection;
};

// Test database connection
const testConnection = async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully!');
        console.log(`📊 Connected to: ${dbConfig.database} on ${dbConfig.host}:${dbConfig.port}`);
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
};

// Execute query with error handling
const executeQuery = async (query, params = []) => {
    try {
        const [rows] = await pool.execute(query, params);
        return { success: true, data: rows };
    } catch (error) {
        console.error('Database query error:', error);
        return { success: false, error: error.message };
    }
};

// Get single record
const getOne = async (query, params = []) => {
    try {
        const [rows] = await pool.execute(query, params);
        return { success: true, data: rows[0] || null };
    } catch (error) {
        console.error('Database query error:', error);
        return { success: false, error: error.message };
    }
};

// Check if database exists and create tables if needed
const initializeDatabase = async () => {
    try {
        // Test basic connection first
        const connection = await pool.getConnection();
        
        // Check if tables exist
        const [tables] = await connection.execute('SHOW TABLES');
        const tableNames = tables.map(table => Object.values(table)[0]);
        
        if (!tableNames.includes('users') || !tableNames.includes('furniture_companies')) {
            console.log('⚠️  Required tables not found. Please run setup.sql in PHPMyAdmin first.');
            console.log('📁 SQL file location: database/setup.sql');
        } else {
            console.log('✅ All required tables found in database');
        }
        
        connection.release();
    } catch (error) {
        console.error('❌ Database initialization error:', error.message);
    }
};

module.exports = {
    pool,
    getConnection,
    testConnection,
    executeQuery,
    getOne,
    initializeDatabase
};