# LinkedIn Data Extractor Chrome Extension

A Chrome extension that extracts contact information from LinkedIn search results pages and exports data to CSV for Airtable import.

## Features

- Extract name, LinkedIn URL, and job title from search results
- Export data to CSV format
- Simple interface with extract and export buttons
- Works on LinkedIn search results pages
- Support for pagination across multiple result pages
- Save and combine data from multiple pages

## Installation

### Developer Mode Installation

1. Clone or download this repository to your local machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" using the toggle in the top right corner
4. Click "Load unpacked" button
5. Select the `linkedin-extension` directory
6. The extension should now appear in your Chrome extensions list

## Usage

1. Go to LinkedIn and perform a search for contacts
2. Click the LinkedIn Data Extractor extension icon in your browser toolbar
3. In the popup, click "Extract Data" to pull information from the current search results page
4. Review the extracted data in the popup
5. To collect data from multiple pages:
   - Ensure "Append Mode" is checked (enabled by default)
   - Navigate to the next page of LinkedIn search results
   - Open the extension again to extract and combine with previous data
   - Repeat for all desired pages
6. Click "Export to CSV" to download the combined data as a CSV file
7. Import the CSV file into Airtable
8. Use "Clear Stored Data" to start a new extraction session

## Airtable Integration

Future versions will include direct Airtable integration. For now:

1. Export data to CSV using the extension
2. In Airtable, create a table with columns for Name, LinkedIn URL, and Title
3. Import the CSV file into your Airtable base

## Limitations

- Works only on LinkedIn search results pages
- LinkedIn may change their page structure, requiring updates to the selectors
- Manual navigation between pages is required (automatic pagination is not implemented to avoid triggering LinkedIn's anti-scraping measures)

## Development

The extension consists of:
- `manifest.json`: Extension configuration
- `popup.html/js/css`: The UI when clicking the extension icon
- `content.js`: Script that runs on LinkedIn pages to extract data
- `background.js`: Background service worker script

To modify the extraction logic, edit the selectors in `js/content.js`.

## License

MIT