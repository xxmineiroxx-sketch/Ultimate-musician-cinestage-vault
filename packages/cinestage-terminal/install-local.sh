#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
bin_dir="${HOME}/bin"
mkdir -p "$bin_dir"

if [[ -x "$bin_dir/cinestage" ]] && ! grep -q "packages/cinestage-terminal/bin/cinestage.js" "$bin_dir/cinestage"; then
  cp "$bin_dir/cinestage" "$bin_dir/cinestage-legacy"
fi

cat > "$bin_dir/cinestage" <<EOF
#!/usr/bin/env bash
set -e
exec node "$repo_root/packages/cinestage-terminal/bin/cinestage.js" "\$@"
EOF

chmod +x "$bin_dir/cinestage"
if [[ -f "$bin_dir/cinestage-legacy" ]]; then
  chmod +x "$bin_dir/cinestage-legacy"
fi

zshrc="${HOME}/.zshrc"
if [[ -f "$zshrc" ]]; then
  python3 - "$zshrc" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
text = path.read_text()
replacement = 'alias cinestage="$HOME/bin/cinestage"'
pattern = re.compile(r'alias cinestage=(?:"[^"]*"|[^\n]*)(?:\n\s+e" && python cinestage/cli/main\.py)?')
if pattern.search(text):
    text = pattern.sub(replacement, text)
else:
    text = text.rstrip() + "\n" + replacement + "\n"
path.write_text(text)
PY
fi

echo "Installed CineStage Terminal at $bin_dir/cinestage"
echo "Updated shell alias in $zshrc"
echo "Run: cinestage status"
