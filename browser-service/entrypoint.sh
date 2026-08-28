#!/bin/sh
set -eu

export DISPLAY="${DISPLAY:-:99}"
mkdir -p /browser-profiles

mkdir -p /tmp/.X11-unix
display_number="${DISPLAY#*:}"
# Stale lock/socket de um restart impedem o Xvfb de subir: remove antes de iniciar.
rm -f "/tmp/.X${display_number}-lock" "/tmp/.X11-unix/X${display_number}"

Xvfb "$DISPLAY" -screen 0 1440x1000x24 -ac +extension RANDR >/tmp/browser-xvfb.log 2>&1 &
XVFB_PID=$!

for _attempt in 1 2 3 4 5 6 7 8 9 10; do
    if [ -S "/tmp/.X11-unix/X${display_number}" ]; then
        break
    fi
    sleep 0.1
done

[ -S "/tmp/.X11-unix/X${display_number}" ]
x11vnc -display "$DISPLAY" -localhost -rfbport 5900 -forever -shared -nopw >/tmp/browser-x11vnc.log 2>&1 &
X11VNC_PID=$!
websockify 127.0.0.1:6080 127.0.0.1:5900 >/tmp/browser-websockify.log 2>&1 &
WEBSOCKIFY_PID=$!

cleanup() {
    kill "$WEBSOCKIFY_PID" "$X11VNC_PID" "$XVFB_PID" 2>/dev/null || true
    wait "$WEBSOCKIFY_PID" "$X11VNC_PID" "$XVFB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if command -v gosu >/dev/null 2>&1; then
    exec gosu browser "$@"
fi
exec "$@"
