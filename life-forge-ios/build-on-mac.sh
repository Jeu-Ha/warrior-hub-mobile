#!/bin/sh
set -eu
cd "$(dirname "$0")"
xcodebuild -project LifeForge.xcodeproj -scheme LifeForge -destination "generic/platform=iOS" CODE_SIGNING_ALLOWED=NO build
