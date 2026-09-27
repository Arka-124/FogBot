-- Initialize Database Schema for FogBot Command Center & RBAC
CREATE DATABASE IF NOT EXISTS login_portal;
USE login_portal;

-- Create users table with role and full_name support
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'operator',
  full_name VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial multi-role accounts:
-- 1. admin (role: admin) -> password123
-- 2. operator (role: operator) -> operator123
-- 3. driver (role: field_worker) -> driver123
-- 4. judge (role: guest) -> guest123
INSERT INTO users (user_id, password_hash, role, full_name)
VALUES 
  ('admin', 'password123', 'admin', 'Chief Systems Engineer'),
  ('operator', 'operator123', 'operator', 'Pit Control Dispatcher'),
  ('driver', 'driver123', 'field_worker', 'CAT 777D Haul Truck Driver'),
  ('judge', 'guest123', 'guest', 'Visiting SIH 2026 Judge / Auditor')
ON DUPLICATE KEY UPDATE 
  role = VALUES(role),
  full_name = VALUES(full_name);
