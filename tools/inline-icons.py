# Rewrites src/iconsheet.js from assets/icons.png (run from the project root).
import base64, re
b = base64.b64encode(open('assets/icons.png', 'rb').read()).decode()
p = 'src/iconsheet.js'
s = open(p).read()
s = re.sub(r"ICON_SHEET_URL = '[^']*'", "ICON_SHEET_URL = 'data:image/png;base64," + b + "'", s)
open(p, 'w').write(s)
