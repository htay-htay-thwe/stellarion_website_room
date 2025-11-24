-- 3D Models Database Schema
-- Add this to your existing stellarion_furniture database

USE stellarion_furniture;

-- Create 3d_models table to store generated models
CREATE TABLE IF NOT EXISTS 3d_models (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    name VARCHAR(255) NOT NULL,
    task_id VARCHAR(255) UNIQUE,
    original_image_url TEXT,
    thumbnail_url TEXT,
    download_url TEXT,
    file_path VARCHAR(500),
    file_size BIGINT DEFAULT 0,
    status ENUM('generating', 'completed', 'failed') DEFAULT 'generating',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_task_id (task_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
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

-- Create model_downloads table to track downloads
CREATE TABLE IF NOT EXISTS model_downloads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    model_id INT,
    user_id INT,
    download_ip VARCHAR(45),
    download_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (model_id) REFERENCES 3d_models(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_model_id (model_id),
    INDEX idx_user_id (user_id),
    INDEX idx_download_at (download_at)
);

-- Create model_likes table for user interactions
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

-- Insert sample data
INSERT INTO model_collections (user_id, name, description, is_public) VALUES
(1, 'My First Collection', 'My personal 3D model collection', FALSE),
(1, 'Furniture Models', 'Collection of furniture 3D models', TRUE),
(1, 'Architecture Models', 'Buildings and structures', FALSE);

-- Create views for easy data access
CREATE OR REPLACE VIEW model_gallery AS
SELECT 
    m.id,
    m.name,
    m.thumbnail_url,
    m.download_url,
    m.status,
    m.created_at,
    u.username as creator,
    COUNT(DISTINCT l.id) as likes_count,
    COUNT(DISTINCT d.id) as downloads_count
FROM 3d_models m
LEFT JOIN users u ON m.user_id = u.id
LEFT JOIN model_likes l ON m.id = l.model_id
LEFT JOIN model_downloads d ON m.id = d.model_id
WHERE m.status = 'completed'
GROUP BY m.id, m.name, m.thumbnail_url, m.download_url, m.status, m.created_at, u.username
ORDER BY m.created_at DESC;

-- Create view for user's personal models
CREATE OR REPLACE VIEW user_models AS
SELECT 
    m.id,
    m.name,
    m.thumbnail_url,
    m.download_url,
    m.status,
    m.created_at,
    m.file_size,
    COUNT(DISTINCT l.id) as likes_count,
    COUNT(DISTINCT d.id) as downloads_count
FROM 3d_models m
LEFT JOIN model_likes l ON m.id = l.model_id
LEFT JOIN model_downloads d ON m.id = d.model_id
GROUP BY m.id, m.name, m.thumbnail_url, m.download_url, m.status, m.created_at, m.file_size
ORDER BY m.created_at DESC;

-- Add indexes for better performance
ALTER TABLE 3d_models ADD INDEX idx_name_status (name, status);
ALTER TABLE 3d_models ADD INDEX idx_user_created (user_id, created_at);

-- Update the users table to track model statistics (if not exists)
ALTER TABLE users 
ADD COLUMN models_count INT DEFAULT 0,
ADD COLUMN total_downloads INT DEFAULT 0,
ADD COLUMN total_likes INT DEFAULT 0;

-- Create triggers to update user statistics
DELIMITER //

CREATE TRIGGER update_user_model_count_insert
    AFTER INSERT ON 3d_models
    FOR EACH ROW
BEGIN
    UPDATE users 
    SET models_count = (
        SELECT COUNT(*) 
        FROM 3d_models 
        WHERE user_id = NEW.user_id AND status = 'completed'
    )
    WHERE id = NEW.user_id;
END//

CREATE TRIGGER update_user_model_count_update
    AFTER UPDATE ON 3d_models
    FOR EACH ROW
BEGIN
    UPDATE users 
    SET models_count = (
        SELECT COUNT(*) 
        FROM 3d_models 
        WHERE user_id = NEW.user_id AND status = 'completed'
    )
    WHERE id = NEW.user_id;
END//

CREATE TRIGGER update_user_downloads_count
    AFTER INSERT ON model_downloads
    FOR EACH ROW
BEGIN
    UPDATE users u
    JOIN 3d_models m ON m.id = NEW.model_id
    SET u.total_downloads = u.total_downloads + 1
    WHERE u.id = m.user_id;
END//

CREATE TRIGGER update_user_likes_count_insert
    AFTER INSERT ON model_likes
    FOR EACH ROW
BEGIN
    UPDATE users u
    JOIN 3d_models m ON m.id = NEW.model_id
    SET u.total_likes = u.total_likes + 1
    WHERE u.id = m.user_id;
END//

CREATE TRIGGER update_user_likes_count_delete
    AFTER DELETE ON model_likes
    FOR EACH ROW
BEGIN
    UPDATE users u
    JOIN 3d_models m ON m.id = OLD.model_id
    SET u.total_likes = u.total_likes - 1
    WHERE u.id = m.user_id;
END//

DELIMITER ;

-- Sample queries for common operations
-- 
-- Get all models by user:
-- SELECT * FROM user_models WHERE id IN (SELECT id FROM 3d_models WHERE user_id = ?);
--
-- Get popular models:
-- SELECT * FROM model_gallery ORDER BY likes_count DESC, downloads_count DESC LIMIT 10;
--
-- Get user's collections:
-- SELECT c.*, COUNT(ci.model_id) as model_count 
-- FROM model_collections c 
-- LEFT JOIN model_collection_items ci ON c.id = ci.collection_id 
-- WHERE c.user_id = ? 
-- GROUP BY c.id;
--
-- Search models:
-- SELECT * FROM model_gallery WHERE name LIKE '%search_term%' OR creator LIKE '%search_term%';
--
-- Get models in a collection:
-- SELECT m.* FROM model_gallery m
-- JOIN model_collection_items ci ON m.id = ci.model_id
-- WHERE ci.collection_id = ?;