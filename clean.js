const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

code = code.replace(/document\.querySelectorAll\('#inventory-locations \.segment'\)\.forEach\(btn => \{[\s\S]*?\}\);\s*\}\);/g, '');
code = code.replace(/document\.querySelectorAll\('#form-location \.segment'\)\.forEach\(btn => \{[\s\S]*?\}\);\s*\}\);/g, '');
code = code.replace(/document\.querySelectorAll\('#receipt-location \.segment'\)\.forEach\(btn => \{[\s\S]*?\}\);\s*\}\);/g, '');

fs.writeFileSync('app.js', code, 'utf8');
