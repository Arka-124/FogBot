-- Initialize Database Schema for Login Portal
CREATE DATABASE IF NOT EXISTS login_portal;
USE login_portal;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial test user:
-- Username: admin
-- Password: password123
INSERT INTO users (user_id, password_hash)
VALUES ('admin', 'password123')
ON DUPLICATE KEY UPDATE user_id = user_id;
