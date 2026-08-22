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

echo "Installed CineStage Terminal at $bin_dir/cinestage"
echo "Run: cinestage status"
