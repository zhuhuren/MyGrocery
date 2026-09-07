const fs = require('fs');
let text = fs.readFileSync('index.html', 'utf8');

text = text.replace('<h2>??? Settings</h2>', '<h2>⚙️ Settings</h2>');
text = text.replace('<button class="close-btn" id="close-settings"></button>', '<button class="close-btn" id="close-settings">×</button>');
text = text.replace('placeholder="Emoji (??)"', 'placeholder="Emoji (🏷️)"');

fs.writeFileSync('index.html', text, 'utf8');
