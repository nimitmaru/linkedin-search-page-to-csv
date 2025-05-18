// Additional script to handle the specific LinkedIn layout shown in the screenshot
// This will be included in the extension

// Create a new extraction method specifically for the layout in the screenshot
function extractFromScreenshotPattern() {
  const profiles = [];
  
  try {
    // In the screenshot, each profile has:
    // 1. Name - large text with LinkedIn icon
    // 2. Title - text below name
    // 3. Location - text below title
    // 4. Message button - at top right
    
    // Look for Message buttons which are prominent in the screenshot
    const messageButtons = document.querySelectorAll('button, a');
    const messageElements = [];
    
    // Find all elements with text exactly matching "Message"
    messageButtons.forEach(el => {
      const buttonText = el.textContent.trim();
      if (buttonText === 'Message') {
        messageElements.push(el);
      }
    });
    
    // For each message button, find the corresponding profile
    messageElements.forEach(messageBtn => {
      try {
        // Get parent container that holds all profile info
        let profileContainer = messageBtn.closest('[class*="profile"], [class*="card"], [class*="search-result"], article, li, div[id]');
        
        if (!profileContainer) {
          // Try getting a parent container by traversing up a few levels
          let current = messageBtn.parentElement;
          for (let i = 0; i < 5 && current; i++) {
            if (current.clientHeight > 100) { // Profiles are usually tall elements
              profileContainer = current;
              break;
            }
            current = current.parentElement;
          }
        }
        
        if (!profileContainer) return;
        
        // Find name - Usually a large text near the top
        let nameElement = profileContainer.querySelector('h1, h2, h3, [class*="title"], [class*="name"], strong');
        
        // If no direct element found, look for patterns in the screenshot like "Name • 1st"
        if (!nameElement) {
          const textElements = profileContainer.querySelectorAll('*');
          for (const el of textElements) {
            const text = el.textContent.trim();
            // Look for patterns like "Name • 1st" or just a prominent name
            if (text && (text.includes(' • 1st') || text.includes(' • 2nd') || text.includes(' • 3rd'))) {
              nameElement = el;
              break;
            }
          }
        }
        
        // Extract and clean name
        let name = nameElement ? nameElement.textContent.trim() : '';
        name = name.replace(/\s*•\s*\d+(?:st|nd|rd|th)$/, ''); // Remove connection degree
        
        if (!name) return;
        
        // Find LinkedIn URL
        const urlElement = profileContainer.querySelector('a[href*="/in/"]');
        if (!urlElement) return;
        
        const url = urlElement.href;
        const cleanURL = new URL(url);
        const canonicalURL = cleanURL.origin + cleanURL.pathname;
        
        // Find title - in the screenshot it appears right below the name
        let title = '';
        const potentialTitles = profileContainer.querySelectorAll('div, p, span');
        
        for (const el of potentialTitles) {
          const text = el.textContent.trim();
          
          // Titles typically include phrases like "at", "CEO", etc.
          if (text && text !== name && text.length < 100 && 
              !text.includes('Message') && !text.includes('connections') && 
              !text.includes('followers') && !text.includes('mutual')) {
            
            // Check for common title patterns
            if (text.includes(' at ') || 
                text.includes('CEO') || 
                text.includes('Founder') ||
                text.includes('Manager') ||
                text.includes('Director') ||
                text.includes('Engineer') ||
                text.includes('Leader') ||
                text.includes('Head of') ||
                text.includes('Partner')) {
              title = text;
              break;
            }
          }
        }
        
        // Look for profile image
        let imageUrl = '';
        const imgElement = profileContainer.querySelector('img');
        if (imgElement && imgElement.src) {
          imageUrl = imgElement.src;
        }
        
        // If we found valid data, add to profiles
        if (name && canonicalURL && !profiles.some(p => p.url === canonicalURL)) {
          profiles.push({
            name,
            url: canonicalURL,
            title,
            imageUrl
          });
        }
      } catch (e) {
        console.error('Error extracting profile near Message button:', e);
      }
    });
  } catch (e) {
    console.error('Error in screenshot pattern extraction:', e);
  }
  
  return profiles;
}

// Export the function
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractFromScreenshotPattern };
} else {
  // For direct browser usage
  window.extractFromScreenshotPattern = extractFromScreenshotPattern;
}