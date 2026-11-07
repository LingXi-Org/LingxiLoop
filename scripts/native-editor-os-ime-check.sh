#!/usr/bin/env bash
# 真实 Linux/X11 拼音输入法回归；仅使用受控 HTTP 文档夹具。
set -euo pipefail

if [[ "${1:-}" != --session ]]; then
  for task_command in xvfb-run dbus-run-session fcitx5 fcitx5-remote xdotool scrot node; do
    command -v "$task_command" >/dev/null || { echo "缺少系统输入法验收依赖：$task_command" >&2; exit 1; }
  done
  task_output=$(realpath -m "${1:?请指定验收结果目录}")
  task_browser=${NATIVE_IME_BROWSER:-/usr/bin/chromium}
  mkdir -p "$task_output"
  task_config=$(mktemp -d)
  task_runtime=$(mktemp -d)
  trap 'rm -rf "$task_config" "$task_runtime"' EXIT
  export XDG_CONFIG_HOME="$task_config" XDG_RUNTIME_DIR="$task_runtime"
  export GTK_IM_MODULE=fcitx QT_IM_MODULE=fcitx XMODIFIERS=@im=fcitx LANG=C.UTF-8
  mkdir -p "$XDG_CONFIG_HOME/fcitx5"
  cat > "$XDG_CONFIG_HOME/fcitx5/profile" <<'PROFILE'
[Groups/0]
Name=Default
Default Layout=us
DefaultIM=pinyin

[Groups/0/Items/0]
Name=keyboard-us
Layout=

[Groups/0/Items/1]
Name=pinyin
Layout=

[GroupOrder]
0=Default
PROFILE
  xvfb-run -a -s '-screen 0 1440x1100x24 -nolisten tcp' dbus-run-session -- bash "$0" --session "$task_output" "$task_browser"
  exit
fi

task_output=$2
task_browser=$3
fcitx5 --version > "$task_output/fcitx5-version.txt" 2>&1
fcitx5 --disable=wayland > "$task_output/fcitx5.log" 2>&1 &
task_ime_pid=$!
trap 'kill "$task_ime_pid" 2>/dev/null || true; wait "$task_ime_pid" 2>/dev/null || true' EXIT
task_target=${NATIVE_IME_TARGET:-text}
task_mode=both
if [[ "$task_target" == board-title || "$task_target" == element-link || "$task_target" == element-sizing ]]; then task_mode=design; fi
node --import tsx scripts/native-editor-ui-acceptance.mjs --mode="$task_mode" --ime-target="$task_target" --checks=os-ime --headed=true --browser="$task_browser" --output="$task_output"
