const fs = require('fs');
let code = fs.readFileSync('app.js', 'utf8');

code = code.replace(/CATEGORIES\.find/g, 'getAllCategories().find');
code = code.replace(/CATEGORIES\.forEach/g, 'getAllCategories().forEach');
code = code.replace(/CATEGORIES\.map/g, 'getAllCategories().map');
code = code.replace(/CATEGORIES\[CATEGORIES\.length - 1\]/g, 'getAllCategories()[getAllCategories().length - 1]');

fs.writeFileSync('app.js', code, 'utf8');
