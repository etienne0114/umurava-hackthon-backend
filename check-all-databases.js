/**
 * Check All Databases Script
 * 
 * This script lists all databases and their collections
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

console.log('='.repeat(80));
console.log('MongoDB - List All Databases and Collections');
console.log('='.repeat(80));
console.log('\n');

async function checkDatabases() {
  try {
    console.log('🔌 Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected successfully\n');

    // Get admin database to list all databases
    const adminDb = mongoose.connection.db.admin();
    const { databases } = await adminDb.listDatabases();

    console.log(`📊 Found ${databases.length} database(s):\n`);
    console.log('='.repeat(80));

    for (const db of databases) {
      console.log(`\n📁 Database: ${db.name}`);
      console.log(`   Size: ${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Empty: ${db.empty ? 'Yes' : 'No'}`);
      
      // Connect to this database and list collections
      const database = mongoose.connection.client.db(db.name);
      const collections = await database.listCollections().toArray();
      
      if (collections.length > 0) {
        console.log(`   Collections (${collections.length}):`);
        for (const coll of collections) {
          const count = await database.collection(coll.name).countDocuments();
          console.log(`      - ${coll.name.padEnd(30)} (${count} documents)`);
        }
      } else {
        console.log(`   Collections: None`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Database scan complete!');
    console.log('='.repeat(80));
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('🔌 Connection closed.\n');
    }
  }
}

checkDatabases().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
