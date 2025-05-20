# LinkedIn Data Extractor Chrome Extension

A Chrome extension that extracts contact information from LinkedIn search results pages, rates contacts by closeness to a VC partner, and exports data to CSV or Airtable.

## Features

- Extract name, LinkedIn URL, job title, and profile image from search results
- Rate each contact with a "closeness index" (0-3) indicating likelihood of providing an intro
- Export data to CSV format or send directly to Airtable API
- Track VC partner information for intro context
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
3. The extension automatically extracts information from the current search results page
4. Click "Select VC Partner" to enter the partner's LinkedIn URL, name and title
5. Rate each contact using the pill selector to indicate closeness:
   - **0**: Don't know them at all
   - **1**: Know them, but unlikely to provide an intro (default)
   - **2**: Might provide an intro
   - **3**: Definitely would provide an intro
6. To collect data from multiple pages:
   - Ensure "Append Mode" is checked (enabled by default)
   - Navigate to the next page of LinkedIn search results
   - Open the extension again to extract and combine with previous data
   - Repeat for all desired pages
7. Choose your export option:
   - Click "Export CSV" to download the combined data as a CSV file
   - Click "Send to Airtable" to send the data directly to the Airtable API
   - Click "Copy" to copy the data to clipboard in CSV format
8. Use "Clear This Search" to clear data for current search or "Clear All Searches" to start fresh

## Airtable Integration

The extension supports direct Airtable integration:

1. Enter your VC partner information via the "Select VC Partner" button
2. Rate each contact using the closeness index pills
3. Click "Send to Airtable" to export the data directly
4. The API endpoint receives:
   - VC partner information (LinkedIn URL, name, title)
   - Contact data with closeness index for each contact 

Alternatively, you can:
1. Export data to CSV using the extension
2. In Airtable, create a table with columns for Closeness Index, Name, LinkedIn URL, and Title
3. Import the CSV file into your Airtable base

## Limitations

- Works only on LinkedIn search results pages
- LinkedIn may change their page structure, requiring updates to the selectors
- Manual navigation between pages is required (automatic pagination is not implemented to avoid triggering LinkedIn's anti-scraping measures)

## Development

### Code Structure

The extension is organized in a modular pattern:

#### JS Modules
- **js/popup.js**: Main entry point that initializes the UI and sets up event handlers
- **js/utils.js**: Helper functions like escapeHTML, toast notifications, etc.
- **js/storage.js**: Chrome storage operations and state management
- **js/profiles.js**: Profile data management (combining, converting to CSV)
- **js/ui.js**: UI rendering functions
- **js/api.js**: API call functions for Airtable export
- **js/events.js**: Event handlers and UI element creation

#### Content Scripts
- **js/content.js**: Main content script for LinkedIn page interaction
- **js/linkedin-extractor.js**: LinkedIn DOM structure extraction
- **js/screenshot-parser.js**: Pattern-based extraction as fallback

#### Other Files
- **popup.html**: HTML structure for the extension popup
- **css/popup.css**: Styling for the popup UI
- **js/background.js**: Background script for extension initialization
- **manifest.json**: Extension configuration

To modify the extraction logic, edit the selectors in `js/content.js`, `js/linkedin-extractor.js`, or `js/screenshot-parser.js`.

## License

MIT