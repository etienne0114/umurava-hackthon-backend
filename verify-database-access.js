/**
 * Comprehensive Database Access Verification
 * 
 * This script verifies:
 * 1. MongoDB connection is working
 * 2. Database name being used
 * 3. All collections (tables) in the database
 * 4. Document counts in each collection
 * 5. Sample data from collections with data
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

console.log('\n' + '='.repeat(100));
console.log('COMPREHENSIVE DATABASE ACCESS VERIFICATION');
console.log('='.repeat(100));

async function verifyDatabaseAccess() {
  try {
    // Parse connection string to show configuration
    console.log('\n📋 CONNECTION CONFIGURATION:');
    console.log('-'.repeat(100));
    const uriParts = MONGODB_URI.split('@');
    const credentials = uriParts[0].split('://')[1];
    const username = credentials.split(':')[0];
    const hostAndDb = uriParts[1];
    const host = hostAndDb.split('/')[0];
    const dbNameFromUri = hostAndDb.split('/')[1]?.split('?')[0] || 'NOT SPECIFIED';
    
    console.log(`   Username: ${username}`);
    console.log(`   Host: ${host}`);
    console.log(`   Database (from URI): ${dbNameFromUri}`);
    console.log(`   Full URI: ${MONGODB_URI.replace(/:[^:@]+@/, ':****@')}`);

    // Connect to MongoDB
    console.log('\n🔌 CONNECTING TO MONGODB...');
    console.log('-'.repeat(100));
    const startTime = Date.now();
    
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });
    
    const connectionTime = Date.now() - startTime;
    console.log(`   ✅ Connected successfully in ${connectionTime}ms`);

    // Get actual database name being used
    const actualDbName = mongoose.connection.db.databaseName;
    console.log(`   📊 Actual Database Name: ${actualDbName}`);
    
    if (actualDbName !== dbNameFromUri && dbNameFromUri !== 'NOT SPECIFIED') {
      console.log(`   ⚠️  WARNING: Database name mismatch!`);
      console.log(`      Expected: ${dbNameFromUri}`);
      console.log(`      Actual: ${actualDbName}`);
    }

    // List all collections
    console.log('\n📁 DATABASE COLLECTIONS (TABLES):');
    console.log('-'.repeat(100));
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    if (collections.length === 0) {
      console.log('   ⚠️  No collections found in database');
      console.log('   💡 Collections will be created automatically when data is inserted');
    } else {
      console.log(`   Found ${collections.length} collection(s):\n`);
      
      let totalDocuments = 0;
      const collectionDetails = [];
      
      // Get details for each collection
      for (const collection of collections) {
        const collectionName = collection.name;
        const count = await mongoose.connection.db.collection(collectionName).countDocuments();
        totalDocuments += count;
        
        collectionDetails.push({
          name: collectionName,
          count: count,
          hasData: count > 0
        });
      }
      
      // Sort by document count (descending)
      collectionDetails.sort((a, b) => b.count - a.count);
      
      // Display collection details
      console.log('   Collection Name                    Documents    Status');
      console.log('   ' + '-'.repeat(96));
      
      for (const coll of collectionDetails) {
        const nameCol = coll.name.padEnd(35);
        const countCol = coll.count.toString().padStart(8);
        const status = coll.hasData ? '✅ Has Data' : '⚪ Empty';
        console.log(`   ${nameCol} ${countCol}    ${status}`);
      }
      
      console.log('   ' + '-'.repeat(96));
      console.log(`   TOTAL:                             ${totalDocuments.toString().padStart(8)} documents`);
      
      // Show sample data from collections with data
      const collectionsWithData = collectionDetails.filter(c => c.hasData);
      
      if (collectionsWithData.length > 0) {
        console.log('\n📄 SAMPLE DATA FROM COLLECTIONS:');
        console.log('-'.repeat(100));
        
        for (const coll of collectionsWithData.slice(0, 3)) { // Show first 3 collections with data
          console.log(`\n   Collection: ${coll.name} (${coll.count} documents)`);
          console.log('   ' + '-'.repeat(96));
          
          const sample = await mongoose.connection.db.collection(coll.name).findOne();
          if (sample) {
            const fields = Object.keys(sample);
            console.log(`   Fields (${fields.length}): ${fields.slice(0, 10).join(', ')}${fields.length > 10 ? '...' : ''}`);
            
            // Show a few sample field values
            const sampleFields = ['_id', 'name', 'title', 'email', 'status', 'createdAt', 'updatedAt'];
            const displayFields = sampleFields.filter(f => sample[f] !== undefined);
            
            if (displayFields.length > 0) {
              console.log('   Sample values:');
              for (const field of displayFields) {
                let value = sample[field];
                if (typeof value === 'object' && value !== null) {
                  value = JSON.stringify(value).substring(0, 50) + '...';
                } else if (typeof value === 'string' && value.length > 50) {
                  value = value.substring(0, 50) + '...';
                }
                console.log(`      ${field}: ${value}`);
              }
            }
          }
        }
        
        if (collectionsWithData.length > 3) {
          console.log(`\n   ... and ${collectionsWithData.length - 3} more collection(s) with data`);
        }
      }
    }

    // Test database operations
    console.log('\n🧪 TESTING DATABASE OPERATIONS:');
    console.log('-'.repeat(100));
    
    const testCollection = mongoose.connection.db.collection('_connection_test');
    
    // Write test
    console.log('   ✍️  Write test...');
    const writeStart = Date.now();
    await testCollection.insertOne({
      test: true,
      timestamp: new Date(),
      message: 'Database write test successful'
    });
    const writeTime = Date.now() - writeStart;
    console.log(`   ✅ Write successful (${writeTime}ms)`);
    
    // Read test
    console.log('   📖 Read test...');
    const readStart = Date.now();
    const doc = await testCollection.findOne({ test: true });
    const readTime = Date.now() - readStart;
    console.log(`   ✅ Read successful (${readTime}ms)`);
    
    // Update test
    console.log('   ✏️  Update test...');
    const updateStart = Date.now();
    await testCollection.updateOne(
      { test: true },
      { $set: { updated: true, updateTime: new Date() } }
    );
    const updateTime = Date.now() - updateStart;
    console.log(`   ✅ Update successful (${updateTime}ms)`);
    
    // Delete test
    console.log('   🗑️  Delete test...');
    const deleteStart = Date.now();
    await testCollection.deleteOne({ test: true });
    const deleteTime = Date.now() - deleteStart;
    console.log(`   ✅ Delete successful (${deleteTime}ms)`);

    // Connection details
    console.log('\n🔗 CONNECTION DETAILS:');
    console.log('-'.repeat(100));
    console.log(`   Host: ${mongoose.connection.host}`);
    console.log(`   Port: ${mongoose.connection.port || 27017}`);
    console.log(`   Database: ${mongoose.connection.name}`);
    console.log(`   Ready State: ${mongoose.connection.readyState} (1 = connected)`);
    console.log(`   Connection String: ${MONGODB_URI.replace(/:[^:@]+@/, ':****@')}`);

    // Summary
    console.log('\n' + '='.repeat(100));
    console.log('✅ DATABASE ACCESS VERIFICATION COMPLETE');
    console.log('='.repeat(100));
    console.log(`   ✓ MongoDB connection: WORKING`);
    console.log(`   ✓ Database name: ${actualDbName}`);
    console.log(`   ✓ Collections found: ${collections.length}`);
    console.log(`   ✓ Total documents: ${collections.length > 0 ? totalDocuments : 0}`);
    console.log(`   ✓ Read/Write operations: WORKING`);
    console.log('='.repeat(100));
    console.log('');

  } catch (error) {
    console.error('\n' + '='.repeat(100));
    console.error('❌ DATABASE ACCESS VERIFICATION FAILED');
    console.error('='.repeat(100));
    console.error(`   Error Type: ${error.name}`);
    console.error(`   Message: ${error.message}`);
    
    if (error.message.includes('ENOTFOUND')) {
      console.error('\n💡 TROUBLESHOOTING:');
      console.error('   - Check if the cluster hostname is correct');
      console.error('   - Verify your internet connection');
    } else if (error.message.includes('authentication failed')) {
      console.error('\n💡 TROUBLESHOOTING:');
      console.error('   - Verify username and password are correct');
      console.error('   - Check if database user has proper permissions');
    } else if (error.message.includes('timeout') || error.message.includes('IP')) {
      console.error('\n💡 TROUBLESHOOTING:');
      console.error('   - Check network access settings in MongoDB Atlas');
      console.error('   - Ensure IP address 0.0.0.0/0 is whitelisted (required for Vercel)');
      console.error('   - Verify firewall settings');
      console.error('   - Try accessing from MongoDB Atlas dashboard');
    }
    
    console.error('='.repeat(100));
    console.error('');
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('🔌 Connection closed.\n');
    }
  }
}

// Run verification
verifyDatabaseAccess().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
