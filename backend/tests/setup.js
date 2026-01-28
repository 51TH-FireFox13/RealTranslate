/**
 * Jest setup - runs before all tests
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Set test database path
process.env.DB_FILE = path.join(__dirname, '..', 'test-realtranslate.db');
