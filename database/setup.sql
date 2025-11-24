-- Stellarion Furniture Database Setup
-- Run this in PHPMyAdmin to create the database and tables

-- Create Database
CREATE DATABASE IF NOT EXISTS stellarion_furniture;
USE stellarion_furniture;

-- Users Table
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    city VARCHAR(50),
    country VARCHAR(50),
    postal_code VARCHAR(10),
    user_type ENUM('customer', 'admin', 'company') DEFAULT 'customer',
    profile_image VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Company Profiles Table (linked to users with user_type = 'company')
CREATE TABLE company_profiles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT UNIQUE NOT NULL,
    company_name VARCHAR(100) NOT NULL,
    brand_name VARCHAR(100) NOT NULL,
    description TEXT,
    website_url VARCHAR(255),
    contact_email VARCHAR(100) NOT NULL,
    contact_phone VARCHAR(20),
    address TEXT,
    city VARCHAR(50),
    country VARCHAR(50),
    postal_code VARCHAR(10),
    established_year YEAR,
    logo_url VARCHAR(255),
    banner_image VARCHAR(255),
    specialties JSON, -- Store array of specialties like ["Modern", "Scandinavian", "Luxury"]
    rating DECIMAL(3,2) DEFAULT 0.00,
    total_reviews INT DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    social_media JSON, -- Store social media links
    certifications JSON, -- Store certifications
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Furniture Companies Table
CREATE TABLE furniture_companies (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_name VARCHAR(100) NOT NULL,
    brand_name VARCHAR(100) NOT NULL,
    description TEXT,
    website_url VARCHAR(255),
    contact_email VARCHAR(100) NOT NULL,
    contact_phone VARCHAR(20),
    address TEXT,
    city VARCHAR(50),
    country VARCHAR(50),
    postal_code VARCHAR(10),
    established_year YEAR,
    logo_url VARCHAR(255),
    banner_image VARCHAR(255),
    specialties JSON, -- Store array of specialties like ["Modern", "Scandinavian", "Luxury"]
    rating DECIMAL(3,2) DEFAULT 0.00,
    total_reviews INT DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    social_media JSON, -- Store social media links
    certifications JSON, -- Store certifications
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert Sample Users
INSERT INTO users (username, email, password, first_name, last_name, phone, address, city, country, user_type) VALUES
('admin_stellarion', 'admin@stellarion.com', '$2a$10$example_hashed_password_admin', 'Stellarion', 'Admin', '+1-555-0001', '123 Admin Street', 'New York', 'USA', 'admin'),
('john_customer', 'john.doe@email.com', '$2a$10$example_hashed_password_user', 'John', 'Doe', '+1-555-0002', '456 Customer Ave', 'Los Angeles', 'USA', 'customer'),
('scandihome_company', 'contact@scandihome.com', '$2a$10$example_hashed_password_company', 'ScandiHome', 'Manager', '+1-555-1001', '789 Design Boulevard', 'Seattle', 'USA', 'company'),
('luxury_company', 'info@luxuryliving.com', '$2a$10$example_hashed_password_company2', 'LuxuryLiving', 'Administrator', '+1-555-2002', '456 Luxury Lane', 'Miami', 'USA', 'company');

-- Insert Company Profiles for company users
INSERT INTO company_profiles (
    user_id,
    company_name, 
    brand_name, 
    description, 
    website_url, 
    contact_email, 
    contact_phone, 
    address, 
    city, 
    country, 
    established_year, 
    specialties, 
    rating, 
    total_reviews, 
    is_verified,
    social_media,
    certifications
) VALUES 
(
    3, -- scandihome_company user_id
    'Scandinavian Home Design Co.',
    'ScandiHome',
    'Premium Scandinavian-inspired furniture with clean lines and natural materials. We specialize in minimalist designs that bring warmth and functionality to modern homes.',
    'https://scandihome.com',
    'contact@scandihome.com',
    '+1-555-1001',
    '789 Design Boulevard',
    'Seattle',
    'USA',
    2015,
    JSON_ARRAY('Scandinavian', 'Minimalist', 'Eco-Friendly', 'Modern'),
    4.7,
    342,
    TRUE,
    JSON_OBJECT('instagram', '@scandihome_official', 'facebook', 'ScandiHomeDesign', 'pinterest', 'scandihome'),
    JSON_ARRAY('FSC Certified', 'GREENGUARD Gold', 'CARB Phase 2')
),
(
    4, -- luxury_company user_id
    'Luxury Living Interiors Ltd.',
    'LuxuryLiving',
    'Handcrafted luxury furniture featuring Italian craftsmanship and premium materials. Each piece is meticulously designed for discerning customers who appreciate elegance and quality.',
    'https://luxuryliving.com',
    'info@luxuryliving.com',
    '+1-555-2002',
    '456 Luxury Lane',
    'Miami',
    'USA',
    2008,
    JSON_ARRAY('Luxury', 'Italian', 'Handcrafted', 'Premium', 'Custom'),
    4.9,
    189,
    TRUE,
    JSON_OBJECT('instagram', '@luxurylivinginteriors', 'facebook', 'LuxuryLivingOfficicial'),
    JSON_ARRAY('Italian Furniture Quality Mark', 'Artisan Guild Certified', 'Luxury Goods Authentication')
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_type ON users(user_type);
CREATE INDEX idx_company_profiles_user_id ON company_profiles(user_id);
CREATE INDEX idx_company_profiles_name ON company_profiles(company_name);
CREATE INDEX idx_company_profiles_brand ON company_profiles(brand_name);
CREATE INDEX idx_company_profiles_verified ON company_profiles(is_verified);
CREATE INDEX idx_companies_name ON furniture_companies(company_name);
CREATE INDEX idx_companies_brand ON furniture_companies(brand_name);
CREATE INDEX idx_companies_verified ON furniture_companies(is_verified);

-- Cart Items Table
CREATE TABLE IF NOT EXISTS cart_items (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    model_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    notes VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_cart_user_model (user_id, model_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES 3d_models(id) ON DELETE CASCADE
);

-- Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    status ENUM('order_placed', 'payment_confirmed', 'shipped', 'out_for_delivery', 'delivered') DEFAULT 'order_placed',
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    shipping_address JSON,
    payment_method VARCHAR(100),
    payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    model_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    line_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES 3d_models(id) ON DELETE CASCADE,
    INDEX idx_order_items_order_id (order_id)
);

-- Order Status History Table
CREATE TABLE IF NOT EXISTS order_status_history (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    status ENUM('order_placed', 'payment_confirmed', 'shipped', 'out_for_delivery', 'delivered') NOT NULL,
    details VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    INDEX idx_order_history_order_id (order_id)
);

CREATE INDEX idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX idx_cart_items_model_id ON cart_items(model_id);
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Show created tables
SHOW TABLES;