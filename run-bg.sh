#!/bin/bash
cd "$(dirname "$0")"
git pull
npm i
node server.js > nodegit.log 2>&1 &