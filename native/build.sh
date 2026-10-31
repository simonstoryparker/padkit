#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p build
flags='-O2 -Wall -Wextra -Werror -Wno-deprecated-declarations -Isrc'
xcrun clang $flags -std=c11 -c src/gamepad.c -o build/gamepad.o
xcrun clang $flags -std=c11 -c src/usb.c -o build/usb.o
xcrun clang $flags -fobjc-arc -fblocks src/broker.m build/gamepad.o build/usb.o -framework Foundation -framework IOKit -framework CoreFoundation -o build/PowerAInput
xcrun clang $flags -std=c11 -D_DEFAULT_SOURCE src/native-host.c src/client.c -o build/PowerABrowserHost
codesign --force --sign - build/PowerAInput build/PowerABrowserHost
