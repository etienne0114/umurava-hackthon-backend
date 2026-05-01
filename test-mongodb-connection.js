/**
 * MongoDB Connection Test Script
 * 
 * This script tests:
 * 1. Connection to MongoDB Atlas
 * 2. Database access
 * 3. Lists all collections (tables)
 * 4. Shows sample document count from each collection
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

console.log('='.repeat(80));
console.log('MongoDB Connection Test');
console.log('='.repeat(80));
console.log('\n📋 Configuration:');
console.log(`   MongoDB URI: ${MONGODB_URI.replace(/:[^:@]+@/, ':****@')}`);
console.log(`   Database: ${MONGODB_URI.split('/').pop().split('?')[0] || 'NOT SPECIFIED'}`);
console.log('\n');

async function testConnection() {
  try {
    console.log('🔌 Connecting to MongoDB Atlas...');
    const startTime = Date.now();
    
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    
    const connectionTime = Date.now() - startTime;
    console.log(`✅ Connected successfully in ${connectionTime}ms\n`);

    // Get database name
    const dbName = mongoose.connection.db.databaseName;
    console.log(`📊 Database Name: ${dbName}\n`);

    // List all collections
    console.log('📁 Collections (Tables) in database:');
    console.log('-'.repeat(80));
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    if (collections.length === 0) {
      console.log('   ⚠️  No collections found in database');
      console.log('   💡 This is normal for a new database - collections will be created when data is inserted\n');
    } else {
      console.log(`   Found ${collections.length} collection(s):\n`);
      
      // Get document count for each collection
      for (const collection of collections) {
        const collectionName = collection.name;
        const count = await mongoose.connection.db.collection(collectionName).countDocuments();
        const sizeInfo = collection.options?.size ? ` (${(collection.options.size / 1024).toFixed(2)} KB)` : '';
        
        console.log(`   📦 ${collectionName.padEnd(30)} - ${count.toString().padStart(6)} documents${sizeInfo}`);
        
        // Show sample document structure for collections with data
        if (count > 0 && count <= 5) {
          const sample = await mongoose.connection.db.collection(collectionName).findOne();
          console.log(`      Sample fields: ${Object.keys(sample).join(', ')}`);
        }
      }
      console.log('');
    }

    // Test database operations
    console.log('🧪 Testing Database Operations:');
    console.log('-'.repeat(80));
    
    // Test write operation
    const testCollection = mongoose.connection.db.collection('_connection_test');
    const testDoc = {
      test: true,
      timestamp: new Date(),
      message: 'Connection test successful'
    };
    
    console.log('   ✍️  Testing write operation...');
    await testCollection.insertOne(testDoc);
    console.log('   ✅ Write operation successful');
    
    // Test read operation
    console.log('   📖 Testing read operation...');
    const readDoc = await testCollection.findOne({ test: true });
    console.log('   ✅ Read operation successful');
    
    // Clean up test document
    console.log('   🧹 Cleaning up test data...');
    await testCollection.deleteOne({ test: true });
    console.log('   ✅ Cleanup successful\n');

    // Connection info
    console.log('🔗 Connection Details:');
    console.log('-'.repeat(80));
    console.log(`   Host: ${mongoose.connection.host}`);
    console.log(`   Port: ${mongoose.connection.port || 'default'}`);
    console.log(`   Database: ${mongoose.connection.name}`);
    console.log(`   Ready State: ${mongoose.connection.readyState} (1 = connected)`);
    console.log('');

    console.log('='.repeat(80));
    console.log('✅ All tests passed! MongoDB is properly configured and accessible.');
    console.log('='.repeat(80));
    console.log('');

  } catch (error) {
    console.error('\n❌ Connection Error:');
    console.error('-'.repeat(80));
    console.error(`   Error Type: ${error.name}`);
    console.error(`   Message: ${error.message}`);
    
    if (error.message.includes('ENOTFOUND')) {
      console.error('\n💡 Troubleshooting:');
      console.error('   - Check if the cluster hostname is correct');
      console.error('   - Verify your internet connection');
    } else if (error.message.includes('authentication failed')) {
      console.error('\n💡 Troubleshooting:');
      console.error('   - Verify username and password are correct');
      console.error('   - Check if database user has proper permissions');
    } else if (error.message.includes('timeout')) {
      console.error('\n💡 Troubleshooting:');
      console.error('   - Check network access settings in MongoDB Atlas');
      console.error('   - Ensure IP address 0.0.0.0/0 is whitelisted (for Vercel)');
      console.error('   - Verify firewall settings');
    }
    
    console.error('\n' + '='.repeat(80));
    console.error('❌ Connection test failed!');
    console.error('='.repeat(80));
    console.error('');
    
    process.exit(1);
  } finally {
    // Close connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('🔌 Connection closed.\n');
    }
  }
}

// Run the test
testConnection().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
