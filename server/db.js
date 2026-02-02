import { MongoClient } from 'mongodb';

// MongoDB connection string from environment
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB_NAME || 'schools_crm';

let client = null;
let db = null;

/**
 * Connect to MongoDB
 * @returns {Promise<import('mongodb').Db>}
 */
export async function connectDB() {
  if (db) return db;

  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log(`✅ Connected to MongoDB: ${DB_NAME}`);

    // Create indexes for better performance
    await createIndexes();

    return db;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Get database instance (must call connectDB first)
 * @returns {import('mongodb').Db}
 */
export function getDB() {
  if (!db) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return db;
}

/**
 * Close MongoDB connection
 */
export async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('MongoDB connection closed');
  }
}

/**
 * Create indexes for collections
 */
async function createIndexes() {
  try {
    // Schools collection indexes
    const schoolsCollection = db.collection('schools');
    await schoolsCollection.createIndex({ id: 1 }, { unique: true });
    await schoolsCollection.createIndex({ region: 1 });
    await schoolsCollection.createIndex({ inWorkDate: 1 });
    await schoolsCollection.createIndex({ name: 'text' });

    // Users collection indexes
    const usersCollection = db.collection('users');
    await usersCollection.createIndex({ id: 1 }, { unique: true });

    // Plans collection indexes
    const plansCollection = db.collection('plans');
    await plansCollection.createIndex({ id: 1 }, { unique: true });
    await plansCollection.createIndex({ month: 1 }, { unique: true });

    // Versions collection indexes (for backups/snapshots)
    const versionsCollection = db.collection('versions');
    await versionsCollection.createIndex({ timestamp: -1 });
    await versionsCollection.createIndex({ createdAt: -1 });

    // Visits collection indexes (calendar)
    const visitsCollection = db.collection('visits');
    await visitsCollection.createIndex({ id: 1 }, { unique: true });
    await visitsCollection.createIndex({ date: 1 });
    await visitsCollection.createIndex({ managerId: 1 });
    await visitsCollection.createIndex({ date: 1, managerId: 1 });

    console.log('✅ MongoDB indexes created');
  } catch (error) {
    console.warn('⚠️ Error creating indexes:', error.message);
  }
}

// ==================== SCHOOLS ====================

/**
 * Get all schools
 * @returns {Promise<Array>}
 */
export async function getAllSchools() {
  const collection = getDB().collection('schools');
  // Return without MongoDB _id field to match existing API format
  return collection.find({}).project({ _id: 0 }).toArray();
}

/**
 * Get school by id
 * @param {string} schoolId
 * @returns {Promise<Object|null>}
 */
export async function getSchoolById(schoolId) {
  const collection = getDB().collection('schools');
  return collection.findOne({ id: schoolId }, { projection: { _id: 0 } });
}

/**
 * Update school by id
 * @param {string} schoolId
 * @param {Object} updates
 * @returns {Promise<Object|null>}
 */
export async function updateSchool(schoolId, updates) {
  const collection = getDB().collection('schools');
  const result = await collection.findOneAndUpdate(
    { id: schoolId },
    { $set: updates },
    { returnDocument: 'after', projection: { _id: 0 } }
  );
  return result;
}

/**
 * Save multiple schools (upsert)
 * @param {Array} schools
 * @returns {Promise<void>}
 */
export async function saveAllSchools(schools) {
  const collection = getDB().collection('schools');

  const operations = schools.map(school => ({
    updateOne: {
      filter: { id: school.id },
      update: { $set: school },
      upsert: true
    }
  }));

  if (operations.length > 0) {
    await collection.bulkWrite(operations);
  }
}

/**
 * Insert a new school
 * @param {Object} school
 * @returns {Promise<void>}
 */
export async function insertSchool(school) {
  const collection = getDB().collection('schools');
  await collection.insertOne(school);
}

// ==================== USERS ====================

/**
 * Get all users
 * @returns {Promise<Array>}
 */
export async function getAllUsers() {
  const collection = getDB().collection('users');
  return collection.find({}).project({ _id: 0 }).toArray();
}

/**
 * Get user by id
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
export async function getUserById(userId) {
  const collection = getDB().collection('users');
  return collection.findOne({ id: userId }, { projection: { _id: 0 } });
}

/**
 * Save users (replace all)
 * @param {Array} users
 * @returns {Promise<void>}
 */
export async function saveAllUsers(users) {
  const collection = getDB().collection('users');

  const operations = users.map(user => ({
    updateOne: {
      filter: { id: user.id },
      update: { $set: user },
      upsert: true
    }
  }));

  if (operations.length > 0) {
    await collection.bulkWrite(operations);
  }
}

// ==================== PLANS ====================

/**
 * Get all plans
 * @returns {Promise<Array>}
 */
export async function getAllPlans() {
  const collection = getDB().collection('plans');
  return collection.find({}).project({ _id: 0 }).toArray();
}

/**
 * Get plan by month
 * @param {string} month - Format: YYYY-MM
 * @returns {Promise<Object|null>}
 */
export async function getPlanByMonth(month) {
  const collection = getDB().collection('plans');
  return collection.findOne({ month }, { projection: { _id: 0 } });
}

/**
 * Save plan (upsert)
 * @param {Object} plan
 * @returns {Promise<void>}
 */
export async function savePlan(plan) {
  const collection = getDB().collection('plans');
  await collection.updateOne(
    { month: plan.month },
    { $set: plan },
    { upsert: true }
  );
}

/**
 * Delete plan by month
 * @param {string} month
 * @returns {Promise<boolean>}
 */
export async function deletePlan(month) {
  const collection = getDB().collection('plans');
  const result = await collection.deleteOne({ month });
  return result.deletedCount > 0;
}

// ==================== VERSIONS (BACKUPS) ====================

const MAX_VERSIONS = 50;
const VERSION_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Create a version (backup snapshot)
 * @param {Array} schools - Current schools data
 * @param {string|null} userId - User who triggered the backup
 * @returns {Promise<string|null>} - Version timestamp or null if skipped
 */
export async function createVersion(schools, userId = null) {
  const collection = getDB().collection('versions');

  // Check if we created a version recently
  const lastVersion = await collection.findOne({}, { sort: { createdAt: -1 } });
  if (lastVersion) {
    const timeSinceLastVersion = Date.now() - new Date(lastVersion.createdAt).getTime();
    if (timeSinceLastVersion < VERSION_INTERVAL_MS) {
      return null; // Too soon for another backup
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const version = {
    timestamp,
    createdAt: new Date(),
    userId,
    schoolsCount: schools.length,
    data: schools // Store the snapshot
  };

  await collection.insertOne(version);

  // Clean up old versions (keep only MAX_VERSIONS)
  const count = await collection.countDocuments();
  if (count > MAX_VERSIONS) {
    const oldVersions = await collection
      .find({})
      .sort({ createdAt: 1 })
      .limit(count - MAX_VERSIONS)
      .toArray();

    const idsToDelete = oldVersions.map(v => v._id);
    await collection.deleteMany({ _id: { $in: idsToDelete } });
  }

  return timestamp;
}

/**
 * Get all versions (metadata only, without data)
 * @returns {Promise<Array>}
 */
export async function getAllVersions() {
  const collection = getDB().collection('versions');
  return collection
    .find({})
    .project({ _id: 0, data: 0 }) // Exclude data for listing
    .sort({ createdAt: -1 })
    .toArray();
}

/**
 * Get version data by timestamp
 * @param {string} timestamp
 * @returns {Promise<Object|null>}
 */
export async function getVersionByTimestamp(timestamp) {
  const collection = getDB().collection('versions');
  return collection.findOne({ timestamp }, { projection: { _id: 0 } });
}

/**
 * Restore schools from a version
 * @param {string} timestamp
 * @returns {Promise<Array|null>} - Schools data or null if version not found
 */
export async function restoreVersion(timestamp) {
  const version = await getVersionByTimestamp(timestamp);
  if (!version || !version.data) {
    return null;
  }
  return version.data;
}

/**
 * Delete the N most recent versions (by createdAt)
 * @param {number} count - Number of versions to delete (1–100)
 * @returns {Promise<{ deleted: number }>}
 */
export async function deleteLastVersions(count) {
  const limit = Math.min(Math.max(1, count), 100);
  const collection = getDB().collection('versions');
  const toDelete = await collection
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  if (toDelete.length === 0) {
    return { deleted: 0 };
  }
  await collection.deleteMany({ _id: { $in: toDelete.map((v) => v._id) } });
  return { deleted: toDelete.length };
}

// ==================== VISITS (CALENDAR) ====================

/**
 * Get visits for a date range
 * @param {string} fromDate - YYYY-MM-DD
 * @param {string} toDate - YYYY-MM-DD
 * @returns {Promise<Array>}
 */
export async function getVisits(fromDate, toDate) {
  const collection = getDB().collection('visits');
  return collection
    .find({
      date: { $gte: fromDate, $lte: toDate }
    })
    .project({ _id: 0 })
    .sort({ date: 1, timeStart: 1 })
    .toArray();
}

/**
 * Get visit by id
 * @param {string} visitId
 * @returns {Promise<Object|null>}
 */
export async function getVisitById(visitId) {
  const collection = getDB().collection('visits');
  return collection.findOne({ id: visitId }, { projection: { _id: 0 } });
}

/**
 * Create a new visit
 * @param {Object} visit
 * @returns {Promise<Object>}
 */
export async function createVisit(visit) {
  const collection = getDB().collection('visits');
  await collection.insertOne(visit);
  return visit;
}

/**
 * Update visit by id
 * @param {string} visitId
 * @param {Object} updates
 * @returns {Promise<Object|null>}
 */
export async function updateVisit(visitId, updates) {
  const collection = getDB().collection('visits');
  const result = await collection.findOneAndUpdate(
    { id: visitId },
    { $set: updates },
    { returnDocument: 'after', projection: { _id: 0 } }
  );
  return result;
}

/**
 * Delete visit by id
 * @param {string} visitId
 * @returns {Promise<boolean>}
 */
export async function deleteVisit(visitId) {
  const collection = getDB().collection('visits');
  const result = await collection.deleteOne({ id: visitId });
  return result.deletedCount > 0;
}
