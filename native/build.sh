#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p build
xcrun clang -std=c11 -D_DEFAULT_SOURCE -O2 -Wall -Wextra -Werror -Isrc src/native-host.c src/client.c -o build/PowerABrowserHost
codesign --force --sign - build/PowerABrowserHost
