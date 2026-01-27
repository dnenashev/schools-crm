#!/usr/bin/env node
/**
 * Migration script: Import JSON data to MongoDB
 * 
 * Usage:
 *   MONGODB_URI=mongodb+srv://... node scripts/migrate-to-mongodb.js
 * 
 * Options:
 *   --dry-run    Preview changes without writing to MongoDB
 *   --force      Skip confirmation prompts
 *   --hash-passwords  Convert plaintext passwords to bcrypt hashes
 */

import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'schools_crm';

// Data file paths
const DATA_DIR = path.join(__dirname, '..', 'server', 'data');
const SCHOOLS_FILE = path.join(DATA_DIR, 'schools.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PLANS_FILE = path.join(DATA_DIR, 'plans.json');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const HASH_PASSWORDS = args.includes('--hash-passwords');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log();
  log(`═══════════════════════════════════════════`, 'cyan');
  log(`  ${title}`, 'cyan');
  log(`═══════════════════════════════════════════`, 'cyan');
}

// Read JSON file safely
function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    log(`Error reading ${filePath}: ${error.message}`, 'red');
    return null;
  }
}

// Validate school data
function validateSchool(school, index) {
  const errors = [];
  
  if (!school.id) {
    errors.push(`School #${index}: missing 'id' field`);
  }
  if (!school.name) {
    errors.push(`School #${index} (${school.id || 'unknown'}): missing 'name' field`);
  }
  
  return errors;
}

// Validate user data
function validateUser(user, index) {
  const errors = [];
  
  if (!user.id) {
    errors.push(`User #${index}: missing 'id' field`);
  }
  if (!user.password && !user.passwordHash) {
    errors.push(`User #${index} (${user.id || 'unknown'}): missing password`);
  }
  if (!user.role) {
    errors.push(`User #${index} (${user.id || 'unknown'}): missing 'role' field`);
  }
  
  return errors;
}

// Hash password using bcrypt
async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, 10);
}

// Main migration function
async function migrate() {
  logSection('Schools CRM - MongoDB Migration');
  
  if (!MONGODB_URI) {
    log('Error: MONGODB_URI environment variable is required', 'red');
    log('Usage: MONGODB_URI=mongodb+srv://... node scripts/migrate-to-mongodb.js', 'dim');
    process.exit(1);
  }
  
  if (DRY_RUN) {
    log('🔍 DRY RUN MODE - No changes will be made to the database', 'yellow');
  }
  
  // Read data files
  logSection('Reading Data Files');
  
  const schoolsData = readJsonFile(SCHOOLS_FILE);
  const usersData = readJsonFile(USERS_FILE);
  const plansData = readJsonFile(PLANS_FILE);
  
  const schools = Array.isArray(schoolsData) ? schoolsData : [];
  const users = usersData?.users || [];
  const plans = plansData?.plans || [];
  
  log(`📚 Schools: ${schools.length} records`, schools.length > 0 ? 'green' : 'yellow');
  log(`👥 Users: ${users.length} records`, users.length > 0 ? 'green' : 'yellow');
  log(`📋 Plans: ${plans.length} records`, plans.length > 0 ? 'green' : 'yellow');
  
  // Validate data
  logSection('Validating Data');
  
  const validationErrors = [];
  
  schools.forEach((school, index) => {
    validationErrors.push(...validateSchool(school, index));
  });
  
  users.forEach((user, index) => {
    validationErrors.push(...validateUser(user, index));
  });
  
  if (validationErrors.length > 0) {
    log(`Found ${validationErrors.length} validation errors:`, 'red');
    validationErrors.slice(0, 10).forEach(err => log(`  - ${err}`, 'red'));
    if (validationErrors.length > 10) {
      log(`  ... and ${validationErrors.length - 10} more`, 'red');
    }
    
    if (!FORCE) {
      log('\nUse --force to proceed despite validation errors', 'yellow');
      process.exit(1);
    }
  } else {
    log('✅ All data validated successfully', 'green');
  }
  
  // Process users (hash passwords if requested)
  if (HASH_PASSWORDS) {
    logSection('Hashing Passwords');
    
    for (const user of users) {
      if (user.password && !user.password.startsWith('$2')) {
        const hashed = await hashPassword(user.password);
        log(`  Hashed password for user: ${user.id}`, 'dim');
        user.passwordHash = hashed;
        delete user.password;
      }
    }
    
    log('✅ Passwords hashed', 'green');
  }
  
  // Deduplicate schools
  logSection('Deduplicating Schools');
  
  const schoolsById = new Map();
  let duplicates = 0;
  
  schools.forEach(school => {
    if (school.id) {
      if (schoolsById.has(school.id)) {
        duplicates++;
        // Merge with existing
        const existing = schoolsById.get(school.id);
        schoolsById.set(school.id, { ...existing, ...school });
      } else {
        schoolsById.set(school.id, school);
      }
    }
  });
  
  const dedupedSchools = Array.from(schoolsById.values());
  
  if (duplicates > 0) {
    log(`⚠️  Found and merged ${duplicates} duplicate schools`, 'yellow');
  }
  log(`📚 Schools after deduplication: ${dedupedSchools.length}`, 'green');
  
  // Connect to MongoDB
  if (DRY_RUN) {
    logSection('Migration Summary (DRY RUN)');
    log(`Would import:`, 'cyan');
    log(`  - ${dedupedSchools.length} schools to 'schools' collection`);
    log(`  - ${users.length} users to 'users' collection`);
    log(`  - ${plans.length} plans to 'plans' collection`);
    log('\nRun without --dry-run to perform the actual migration', 'yellow');
    return;
  }
  
  logSection('Connecting to MongoDB');
  
  let client;
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    log('✅ Connected to MongoDB', 'green');
    
    const db = client.db(DB_NAME);
    
    // Import schools
    logSection('Importing Schools');
    
    const schoolsCollection = db.collection('schools');
    
    // Create indexes
    await schoolsCollection.createIndex({ id: 1 }, { unique: true });
    await schoolsCollection.createIndex({ region: 1 });
    await schoolsCollection.createIndex({ inWorkDate: 1 });
    log('✅ Schools indexes created', 'green');
    
    // Upsert schools
    let schoolsImported = 0;
    let schoolsUpdated = 0;
    
    for (const school of dedupedSchools) {
      const result = await schoolsCollection.updateOne(
        { id: school.id },
        { $set: school },
        { upsert: true }
      );
      
      if (result.upsertedCount > 0) {
        schoolsImported++;
      } else if (result.modifiedCount > 0) {
        schoolsUpdated++;
      }
    }
    
    log(`✅ Schools: ${schoolsImported} imported, ${schoolsUpdated} updated`, 'green');
    
    // Import users
    logSection('Importing Users');
    
    const usersCollection = db.collection('users');
    await usersCollection.createIndex({ id: 1 }, { unique: true });
    log('✅ Users indexes created', 'green');
    
    let usersImported = 0;
    let usersUpdated = 0;
    
    for (const user of users) {
      const result = await usersCollection.updateOne(
        { id: user.id },
        { $set: user },
        { upsert: true }
      );
      
      if (result.upsertedCount > 0) {
        usersImported++;
      } else if (result.modifiedCount > 0) {
        usersUpdated++;
      }
    }
    
    log(`✅ Users: ${usersImported} imported, ${usersUpdated} updated`, 'green');
    
    // Import plans
    logSection('Importing Plans');
    
    const plansCollection = db.collection('plans');
    await plansCollection.createIndex({ id: 1 }, { unique: true });
    await plansCollection.createIndex({ month: 1 }, { unique: true });
    log('✅ Plans indexes created', 'green');
    
    let plansImported = 0;
    let plansUpdated = 0;
    
    for (const plan of plans) {
      const result = await plansCollection.updateOne(
        { month: plan.month },
        { $set: plan },
        { upsert: true }
      );
      
      if (result.upsertedCount > 0) {
        plansImported++;
      } else if (result.modifiedCount > 0) {
        plansUpdated++;
      }
    }
    
    log(`✅ Plans: ${plansImported} imported, ${plansUpdated} updated`, 'green');
    
    // Create versions collection with indexes
    logSection('Setting up Versions Collection');
    
    const versionsCollection = db.collection('versions');
    await versionsCollection.createIndex({ timestamp: -1 });
    await versionsCollection.createIndex({ createdAt: -1 });
    log('✅ Versions indexes created', 'green');
    
    // Final summary
    logSection('Migration Complete');
    
    const finalCounts = {
      schools: await schoolsCollection.countDocuments(),
      users: await usersCollection.countDocuments(),
      plans: await plansCollection.countDocuments(),
      versions: await versionsCollection.countDocuments()
    };
    
    log('Database contents:', 'cyan');
    log(`  📚 Schools: ${finalCounts.schools}`);
    log(`  👥 Users: ${finalCounts.users}`);
    log(`  📋 Plans: ${finalCounts.plans}`);
    log(`  📦 Versions: ${finalCounts.versions}`);
    
    log('\n✅ Migration completed successfully!', 'green');
    
  } catch (error) {
    log(`\n❌ Migration failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      log('MongoDB connection closed', 'dim');
    }
  }
}

// Run migration
migrate().catch(console.error);
