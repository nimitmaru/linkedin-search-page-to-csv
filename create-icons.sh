#!/bin/bash

# This script creates simple placeholder icons for the Chrome extension
# You would normally replace these with actual designed icons

# Function to create a simple icon with text size using ImageMagick
create_icon() {
  local size=$1
  local output="/Users/nimit/Work/projects/linkedin-extension/icons/icon${size}.png"
  
  # Create a colored square with "LI" text
  magick -size ${size}x${size} xc:#0077b5 -fill white -gravity center \
    -pointsize $((size/2)) -annotate 0 "LI" "$output"
  
  echo "Created $output"
}

# Check if ImageMagick is installed
if ! command -v magick &> /dev/null; then
  echo "ImageMagick is not installed. Please install it to generate icons."
  echo "On macOS: brew install imagemagick"
  echo "Icons not created. You'll need to add your own icons to the icons/ directory."
  exit 1
fi

# Create icons of different sizes
create_icon 16
create_icon 32
create_icon 48
create_icon 128

echo "Icon creation complete. Replace with your own designed icons for production use."