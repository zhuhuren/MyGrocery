import os

with open('index.html', 'rb') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    try:
        decoded = line.decode('utf-8', errors='ignore')
        
        if 'id="btn-open-settings"' in decoded:
            new_lines.append(b'      <button id="btn-open-settings" class="btn btn-outline" style="width: 100%; margin-bottom: 8px;">\xe2\x9a\x99\xef\xb8\x8f Settings</button>\n')
            continue
            
        if 'Settings</h2>' in decoded and '<h2>' in decoded:
            new_lines.append(b'        <h2>\xe2\x9a\x99\xef\xb8\x8f Settings</h2>\n')
            continue
            
        if 'id="close-settings"' in decoded:
            new_lines.append(b'        <button class="close-btn" id="close-settings">\xc3\x97</button>\n')
            continue
            
        if 'id="new-cat-emoji"' in decoded:
            new_lines.append(b'            <input type="text" id="new-cat-emoji" placeholder="Emoji (\xf0\x9f\x8f\xb7\xef\xb8\x8f)" class="form-input" style="margin:0; width: 80px; text-align: center;">\n')
            continue
            
    except Exception:
        pass
        
    new_lines.append(line)

with open('index.html', 'wb') as f:
    for line in new_lines:
        f.write(line)
