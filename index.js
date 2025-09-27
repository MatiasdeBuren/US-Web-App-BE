// Entry point for production deployment
const path = require('path');

// Register ts-node for TypeScript support
require('ts-node').register({
  project: path.resolve(__dirname, 'tsconfig.json')
});

// Load the main TypeScript file
require('./src/index.ts');