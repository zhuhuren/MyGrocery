const fs = require('fs');
let text = fs.readFileSync('index.html', 'utf8');

text = text.replace(/<h2>\?\?\? Settings<\/h2>/g, '<h2>⚙️ Settings</h2>');
text = text.replace(/<button class="close-btn" id="close-settings">.*<\/button>/g, '<button class="close-btn" id="close-settings">×</button>');
text = text.replace(/placeholder="Emoji \(\?\?\)"/g, 'placeholder="Emoji (🏷️)"');

fs.writeFileSync('index.html', text, 'utf8');
