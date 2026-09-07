const fs = require('fs');
let text = fs.readFileSync('index.html', 'utf8');

text = text.replace(/<div class="segmented-control" id="inventory-locations">[\s\S]*?<\/div>/, '<div class="segmented-control" id="inventory-locations"><\/div>');
text = text.replace(/<div class="segmented-control" id="receipt-location"[^>]*>[\s\S]*?<\/div>/, '<div class="segmented-control" id="receipt-location" style="margin-top: 4px;"><\/div>');
text = text.replace(/<div class="segmented-control" id="form-location">[\s\S]*?<\/div>/, '<div class="segmented-control" id="form-location"><\/div>');

fs.writeFileSync('index.html', text, 'utf8');
