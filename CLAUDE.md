# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LinkedIn Data Extractor is a Chrome extension that extracts contact information from LinkedIn search results pages and exports data to CSV for Airtable import. The extension can extract names, LinkedIn URLs, job titles, and profile images from search results pages.

## Code Architecture

The extension consists of these key components:

1. **Content Scripts** - Run on LinkedIn search pages to extract data:
   - `js/content.js` - Main script that listens for messages and coordinates extraction
   - `js/linkedin-extractor.js` - Specialized extractor targeting LinkedIn's exact DOM structure
   - `js/screenshot-parser.js` - Alternative extractor that uses a pattern-matching approach

2. **Popup Interface** - The UI shown when clicking the extension icon:
   - `popup.html` - HTML structure for the popup interface
   - `popup.js` - Handles popup logic, data storage, and export functions
   - `css/popup.css` - Styling for the popup interface

3. **Background Service** - Chrome extension background worker:
   - `js/background.js` - Background script that loads on extension installation

4. **Configuration**:
   - `manifest.json` - Chrome extension configuration file that defines permissions, scripts, etc.

## Extension Workflow

1. The extension activates on LinkedIn search results pages
2. User clicks the extension icon to open the popup
3. The popup sends a message to the content script to extract data from the current page
4. Content script uses multiple extraction methods to find profile data
5. Data is returned to the popup and displayed
6. User can extract data from multiple pages and combine them using "Append Mode"
7. User exports combined data as CSV for import into Airtable

## Key Features

- Extraction of name, LinkedIn URL, job title, and profile image
- Support for pagination across multiple result pages
- Data persistence between page navigations
- Export to CSV functionality
- Profile selection for targeted exports
- Adaptive extraction techniques to handle LinkedIn's changing DOM structure

## Development Tasks

### Local Testing

1. Load the extension in Chrome developer mode:
   ```
   1. Open Chrome and navigate to chrome://extensions/
   2. Enable "Developer mode" using the toggle in the top right corner
   3. Click "Load unpacked" button
   4. Select the linkedin-extension directory
   ```

2. Make changes to the code and refresh the extension:
   ```
   1. Make your changes to the codebase
   2. Go to chrome://extensions/
   3. Find the LinkedIn Data Extractor extension
   4. Click the refresh icon to reload the extension
   ```

### Modifying Extraction Logic

The main extraction logic is spread across three files:

1. `js/content.js` - Contains several extraction methods and fallbacks
2. `js/linkedin-extractor.js` - Specialized for extracting from LinkedIn's exact DOM structure
3. `js/screenshot-parser.js` - Pattern-based extraction following the layout shown in screenshots

When modifying selectors, update all extraction methods to ensure the extension continues to work if LinkedIn's DOM structure changes.

### Extension Limitations

- Only works on LinkedIn search results pages
- Requires manual navigation between pages (automatic pagination is not implemented to avoid triggering LinkedIn's anti-scraping measures)
- LinkedIn may change their DOM structure, requiring updates to selectors

## Important Notes

1. The extension uses multiple extraction methods as fallbacks in case LinkedIn changes their DOM structure.
2. When updating selectors, check all extraction methods to ensure consistent data extraction.
3. The extension handles pagination by storing data in Chrome's local storage and combining it with new extractions.
4. The extension includes profile selection for targeted exports.