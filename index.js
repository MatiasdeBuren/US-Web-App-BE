// Entry point for production deployment
const path = require('path');
const { execSync } = require('child_process');

async function startApp() {
  try {
    console.log('🔄 Pushing database schema...');
    
    // Ejecutar prisma db push antes de iniciar la app
    execSync('npx prisma db push --accept-data-loss', { 
      stdio: 'inherit',
      cwd: __dirname 
    });
    
    console.log('✅ Database schema updated successfully');
    
    // Register ts-node for TypeScript support
    require('ts-node').register({
      project: path.resolve(__dirname, 'tsconfig.json')
    });

    // Load the main TypeScript file
    require('./src/index.ts');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

startApp();