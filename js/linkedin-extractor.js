// LinkedIn profile data extractor based on exact HTML structure
// This script targets the specific DOM structure from the shared example

function extractLinkedInDataFromDOM() {
  const profiles = [];
  
  try {
    // Target the list items with the exact class from the example
    const listItems = document.querySelectorAll('li.qPzubtmjDpkgZkyhqgfOqIsyLvpljOXlLfM');
    console.log(`Found ${listItems.length} list items with the primary selector`);
    
    // Process each list item
    listItems.forEach(item => {
      try {
        // Extract name - found in <span aria-hidden="true"> inside the first link with profile link
        const nameElement = item.querySelector('span[dir="ltr"] span[aria-hidden="true"]');
        if (!nameElement) return;
        
        const name = nameElement.textContent.trim();
        if (!name) return;
        
        // Extract profile URL - found in <a> tag with href containing "/in/"
        const urlElement = item.querySelector('a[href*="/in/"]');
        if (!urlElement) return;
        
        const url = urlElement.href;
        // Clean the URL to get canonical form
        const urlObj = new URL(url);
        // Keep only the part up to the profile path (/in/username)
        const pathParts = urlObj.pathname.split('?')[0].split('/');
        const username = pathParts[pathParts.length - 1];
        const canonicalURL = `${urlObj.origin}/in/${username}`;
        
        // Extract job title - found in div with specific class
        const titleElement = item.querySelector('div.OxRVYBPaMbQwEfslyYadmBWjwaQuFvi');
        const title = titleElement ? titleElement.textContent.trim() : '';
        
        // Only add if we have at least the name and URL
        if (name && canonicalURL) {
          profiles.push({
            name,
            url: canonicalURL,
            title
          });
        }
      } catch (e) {
        console.error('Error extracting profile data:', e);
      }
    });
    
    // If no profiles found using primary selector, try alternative approaches
    if (profiles.length === 0) {
      console.log('Primary selector failed, trying alternative selectors');
      
      // Look for other elements with similar structure
      // These might have different class names but similar HTML hierarchy
      const alternativeItems = document.querySelectorAll('li, div[role="listitem"]');
      
      alternativeItems.forEach(item => {
        try {
          // Skip items we've already processed
          if (item.classList.contains('qPzubtmjDpkgZkyhqgfOqIsyLvpljOXlLfM')) return;
          
          // Look for "Message" button as an anchor point
          const messageButton = item.querySelector('button span');
          if (!messageButton || !messageButton.textContent.includes('Message')) return;
          
          // Find profile link and name
          const profileLinks = item.querySelectorAll('a[href*="/in/"]');
          if (profileLinks.length === 0) return;
          
          // Get the first profile link
          const urlElement = profileLinks[0];
          const url = urlElement.href;
          
          // Clean the URL
          const urlObj = new URL(url);
          const pathParts = urlObj.pathname.split('?')[0].split('/');
          const username = pathParts[pathParts.length - 1];
          const canonicalURL = `${urlObj.origin}/in/${username}`;
          
          // Try to find name element
          let name = '';
          const possibleNameElements = item.querySelectorAll('span[aria-hidden="true"], a[href*="/in/"] span, h3, h1, h2');
          
          for (const el of possibleNameElements) {
            const text = el.textContent.trim();
            if (text && !text.includes('Message') && !text.includes('•') && 
                !text.includes('connections') && text.length > 1 && text.length < 30) {
              name = text;
              break;
            }
          }
          
          if (!name) return;
          
          // Extract job title - various possible locations
          let title = '';
          const titleSelectors = [
            'div[class*="t-14 t-black t-normal"]',
            '[class*="primary-subtitle"]',
            '[class*="title"]',
            '[class*="headline"]',
            'p'
          ];
          
          for (const selector of titleSelectors) {
            const titleElements = item.querySelectorAll(selector);
            for (const el of titleElements) {
              const text = el.textContent.trim();
              if (text && text !== name && !text.includes('Message') && 
                  !text.includes('connections') && !text.includes('followers')) {
                // Look for common job title patterns
                if (text.includes('at') || text.includes('CEO') || 
                    text.includes('Founder') || text.includes('Director') ||
                    text.includes('Manager') || text.includes('Lead')) {
                  title = text;
                  break;
                }
              }
            }
            if (title) break;
          }
          
          // Only add if we haven't already added this profile
          if (name && canonicalURL && !profiles.some(p => p.url === canonicalURL)) {
            profiles.push({
              name,
              url: canonicalURL,
              title
            });
          }
        } catch (e) {
          console.error('Error extracting profile with alternative selector:', e);
        }
      });
    }
  } catch (e) {
    console.error('Error in LinkedIn data extraction:', e);
  }
  
  console.log(`Successfully extracted ${profiles.length} profiles`);
  return profiles;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractLinkedInDataFromDOM };
} else {
  // For direct browser usage
  window.extractLinkedInDataFromDOM = extractLinkedInDataFromDOM;
}