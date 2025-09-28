// Simple test script to debug admin issues
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

async function testAdminDebug() {
  try {
    console.log('🧪 Testing admin functionality...');
    
    // Test 1: Database connection
    console.log('1️⃣ Testing database connection...');
    const userCount = await prisma.user.count();
    console.log(`✅ Database connected. Total users: ${userCount}`);
    
    // Test 2: Find admin users
    console.log('2️⃣ Looking for admin users...');
    const adminUsers = await prisma.user.findMany({
      where: { role: 'admin' },
      select: { id: true, email: true, name: true, role: true }
    });
    console.log(`✅ Admin users found:`, adminUsers);
    
    // Test 3: JWT Secret
    console.log('3️⃣ Testing JWT Secret...');
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) {
      console.log(`✅ JWT_SECRET está configurado (longitud: ${jwtSecret.length})`);
      
      // Test JWT creation and verification
      if (adminUsers.length > 0) {
        const testPayload = { id: adminUsers[0].id, email: adminUsers[0].email };
        const testToken = jwt.sign(testPayload, jwtSecret);
        const decoded = jwt.verify(testToken, jwtSecret);
        console.log(`✅ JWT creation/verification works:`, decoded);
      }
    } else {
      console.log('❌ JWT_SECRET no está configurado');
    }
    
  } catch (error) {
    console.error('❌ Error en test de debug:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testAdminDebug();