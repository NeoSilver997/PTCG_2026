-- Create database
CREATE DATABASE ptcg_carddb;

-- Connect to the new database
\c ptcg_carddb

-- Create user (optional - can use postgres user for development)
-- CREATE USER ptcg_user WITH PASSWORD 'ptcg_password';
-- GRANT ALL PRIVILEGES ON DATABASE ptcg_carddb TO ptcg_user;
-- GRANT ALL ON SCHEMA public TO ptcg_user;
