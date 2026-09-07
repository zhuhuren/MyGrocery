import re

with open('index.html', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(
    r'<div class="segmented-control" id="inventory-locations">.*?</div>',
    '<div class="segmented-control" id="inventory-locations"></div>',
    text,
    flags=re.DOTALL
)

text = re.sub(
    r'<div class="segmented-control" id="receipt-location"[^>]*>.*?</div>',
    '<div class="segmented-control" id="receipt-location" style="margin-top: 4px;"></div>',
    text,
    flags=re.DOTALL
)

text = re.sub(
    r'<div class="segmented-control" id="form-location">.*?</div>',
    '<div class="segmented-control" id="form-location"></div>',
    text,
    flags=re.DOTALL
)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(text)
