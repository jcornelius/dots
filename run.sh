#!/bin/bash
set -e
cd "$(dirname "$0")"
# Install dependencies if needed
if ! bundle check > /dev/null 2>&1; then
  echo "Installing Ruby dependencies..."
  bundle install
fi
# Kill any existing Jekyll/livereload processes on our ports
lsof -ti :4000 -ti :35729 2>/dev/null | xargs kill 2>/dev/null || true
echo "Starting Jekyll server at http://localhost:4000"
bundle exec jekyll serve --livereload
