const fs = require('fs');
const path = require('path');

// Lire et parser le .env manuellement
const envPath = path.join(__dirname, '.env');
const envVars = {};
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
});

module.exports = {
  apps: [{
    name: 'rdv-aime',
    script: './app.js',
    cwd: '/home/aire2407/rdv-aime',
    env: envVars
  }]
};