#!/usr/bin/env bash
# Ensures packaged Linux protocol handlers receive the URI from the desktop.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <deb-directory>" >&2
  exit 2
fi

DEB_DIR="$1"
found_deb=false

for deb_file in "$DEB_DIR"/*.deb; do
  [ -f "$deb_file" ] || continue
  found_deb=true

  package_dir="$(mktemp -d)"
  cleanup() {
    rm -rf "$package_dir"
  }
  trap cleanup RETURN

  dpkg-deb -R "$deb_file" "$package_dir"

  applications_dir="$package_dir/usr/share/applications"
  desktop_file="$(find "$applications_dir" -maxdepth 1 -name '*.desktop' | head -n 1)"
  test -n "$desktop_file"
  test -f "$desktop_file"

  # Keep the packaged binary path, only ensure the URI placeholder is present.
  if ! grep -Eq '^Exec=.*%U' "$desktop_file"; then
    sed -i -E 's|^Exec=(.*)$|Exec=\1 %U|' "$desktop_file"
  fi

  # Register both the new canonical scheme and the legacy one for migration.
  if grep -q '^MimeType=' "$desktop_file"; then
    sed -i 's|^MimeType=.*|MimeType=x-scheme-handler/retubematrix;x-scheme-handler/youwee;|' "$desktop_file"
  else
    printf '\nMimeType=x-scheme-handler/retubematrix;x-scheme-handler/youwee;\n' >> "$desktop_file"
  fi

  grep -Eq '^Exec=.*%U' "$desktop_file"
  grep -Fqx 'MimeType=x-scheme-handler/retubematrix;x-scheme-handler/youwee;' "$desktop_file"

  dpkg-deb --build "$package_dir" "$deb_file"
  trap - RETURN
  cleanup
done

if [ "$found_deb" = false ]; then
  echo "No .deb packages found in $DEB_DIR" >&2
  exit 1
fi
