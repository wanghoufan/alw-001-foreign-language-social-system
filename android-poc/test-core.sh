#!/bin/sh
set -eu
cd "$(dirname "$0")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
javac -encoding UTF-8 -d "$tmp" app/src/main/java/app/socialmate/dualmic/StereoAnalyzer.java app/src/main/java/app/socialmate/dualmic/ChannelAssessment.java app/src/main/java/app/socialmate/dualmic/WavWriter.java tests/CoreTest.java
java -cp "$tmp" CoreTest
