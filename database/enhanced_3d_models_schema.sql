-- Enhanced 3D Models Database Schema
-- Add this to your existing stellarion_furniture database

USE stellarion_furniture;

-- Drop existing table to recreate with enhanced structure
DROP TABLE IF EXISTS model_collection_items;
DROP TABLE IF EXISTS model_downloads;
DROP TABLE IF EXISTS model_likes;
DROP TABLE IF EXISTS 3d_models;

-- Enhanced 3D Models table with detailed information
CREATE TABLE IF NOT EXISTS 3d_models (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    task_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category ENUM('sofa', 'chair', 'table', 'bed', 'storage', 'lighting', 'decor', 'other') DEFAULT 'other',
    style ENUM('modern', 'scandinavian', 'traditional', 'industrial', 'minimalist', 'luxury', 'vintage', 'contemporary') DEFAULT 'modern',
    dimensions VARCHAR(100), -- e.g., "200×90×85 cm"
    material VARCHAR(200), -- e.g., "Leather, Wood, Metal"
    colors VARCHAR(200), -- Available colors
    estimated_price DECIMAL(10,2) DEFAULT 0.00,
    original_image_url TEXT,
    thumbnail_url TEXT,
    model_url TEXT, -- URL to download the 3D model file
    model_format ENUM('obj', 'fbx', 'gltf', 'ply') DEFAULT 'obj',
    file_size INT, -- in bytes
    polycount INT DEFAULT 0,
    texture_quality ENUM('low', 'medium', 'high', 'ultra') DEFAULT 'medium',
    generation_status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    generation_progress INT DEFAULT 0, -- 0-100
    meshy_task_id VARCHAR(100),
    processing_time_seconds INT DEFAULT 0,
    quality_score DECIMAL(3,2) DEFAULT 0.00, -- AI quality assessment 0-10
    is_public BOOLEAN DEFAULT FALSE,
    is_featured BOOLEAN DEFAULT FALSE,
    view_count INT DEFAULT 0,
    download_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    
    -- Indexes for performance
    INDEX idx_user_id (user_id),
    INDEX idx_category (category),
    INDEX idx_style (style),
    INDEX idx_status (generation_status),
    INDEX idx_public (is_public),
    INDEX idx_created (created_at),
    INDEX idx_featured (is_featured),
    INDEX idx_price (estimated_price),
    
    -- Foreign key constraint
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create model_collections table for organizing models
CREATE TABLE IF NOT EXISTS model_collections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_public (is_public)
);

-- Create junction table for models in collections
CREATE TABLE IF NOT EXISTS model_collection_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    collection_id INT,
    model_id INT,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (collection_id) REFERENCES model_collections(id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES 3d_models(id) ON DELETE CASCADE,
    UNIQUE KEY unique_collection_model (collection_id, model_id),
    INDEX idx_collection_id (collection_id),
    INDEX idx_model_id (model_id)
);

-- Create downloads tracking table
CREATE TABLE IF NOT EXISTS model_downloads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    model_id INT,
    user_id INT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    download_size BIGINT,
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (model_id) REFERENCES 3d_models(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_model_id (model_id),
    INDEX idx_user_id (user_id),
    INDEX idx_downloaded_at (downloaded_at)
);

-- Create likes/favorites table
CREATE TABLE IF NOT EXISTS model_likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    model_id INT,
    user_id INT,
    liked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (model_id) REFERENCES 3d_models(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_model_like (user_id, model_id),
    INDEX idx_model_id (model_id),
    INDEX idx_user_id (user_id)
);

-- Create model tags table for better categorization
CREATE TABLE IF NOT EXISTS model_tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for model tags
CREATE TABLE IF NOT EXISTS model_tag_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    model_id INT,
    tag_id INT,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (model_id) REFERENCES 3d_models(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES model_tags(id) ON DELETE CASCADE,
    UNIQUE KEY unique_model_tag (model_id, tag_id),
    INDEX idx_model_id (model_id),
    INDEX idx_tag_id (tag_id)
);

-- Insert some default tags
INSERT INTO model_tags (name, description) VALUES
('modern', 'Contemporary and sleek designs'),
('vintage', 'Classic and retro-inspired pieces'),
('minimalist', 'Clean and simple designs'),
('luxury', 'High-end and premium furniture'),
('outdoor', 'Suitable for outdoor use'),
('compact', 'Space-saving designs'),
('ergonomic', 'Designed for comfort and health'),
('eco-friendly', 'Sustainable and environmentally conscious');

-- Create analytics views for better reporting

-- Popular models view
CREATE VIEW popular_models AS
SELECT 
    m.*,
    u.username as creator_username,
    m.view_count + m.download_count * 2 as popularity_score,
    COUNT(ml.id) as likes_count
FROM 3d_models m
LEFT JOIN users u ON m.user_id = u.id
LEFT JOIN model_likes ml ON m.id = ml.model_id
WHERE m.is_public = TRUE AND m.generation_status = 'completed'
GROUP BY m.id
ORDER BY popularity_score DESC;

-- User model statistics view
CREATE VIEW user_model_stats AS
SELECT 
    u.id as user_id,
    u.username,
    COUNT(m.id) as total_models,
    COUNT(CASE WHEN m.generation_status = 'completed' THEN 1 END) as completed_models,
    COUNT(CASE WHEN m.generation_status = 'failed' THEN 1 END) as failed_models,
    SUM(m.view_count) as total_views,
    SUM(m.download_count) as total_downloads,
    AVG(m.quality_score) as avg_quality_score
FROM users u
LEFT JOIN 3d_models m ON u.id = m.user_id
GROUP BY u.id, u.username;

-- Daily generation statistics view
CREATE VIEW daily_generation_stats AS
SELECT 
    DATE(created_at) as generation_date,
    COUNT(*) as total_generations,
    COUNT(CASE WHEN generation_status = 'completed' THEN 1 END) as successful_generations,
    COUNT(CASE WHEN generation_status = 'failed' THEN 1 END) as failed_generations,
    AVG(processing_time_seconds) as avg_processing_time,
    SUM(download_count) as total_downloads
FROM 3d_models
GROUP BY DATE(created_at)
ORDER BY generation_date DESC;

-- Category popularity view
CREATE VIEW category_stats AS
SELECT 
    category,
    COUNT(*) as model_count,
    AVG(estimated_price) as avg_price,
    SUM(view_count) as total_views,
    SUM(download_count) as total_downloads
FROM 3d_models
WHERE generation_status = 'completed'
GROUP BY category
ORDER BY model_count DESC;

-- Trigger to update download count
DELIMITER $$
CREATE TRIGGER update_download_count 
AFTER INSERT ON model_downloads
FOR EACH ROW
BEGIN
    UPDATE 3d_models 
    SET download_count = download_count + 1 
    WHERE id = NEW.model_id;
END$$
DELIMITER ;

-- Show created tables and views
SHOW TABLES;
SELECT 'Enhanced 3D Models Database Schema Created Successfully!' as STATUS;