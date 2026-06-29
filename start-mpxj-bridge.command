#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")/mpp-bridge"

echo "Building MPXJ bridge..."
mvn -q package

echo "Starting MPXJ bridge at http://127.0.0.1:3908"
java -jar target/mpp-bridge-0.1.0.jar server 3908
