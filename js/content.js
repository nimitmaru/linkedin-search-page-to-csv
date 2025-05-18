// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "extract") {
    const profileData = extractLinkedInProfiles();
    const paginationInfo = detectPaginationInfo();
    sendResponse({
      data: profileData,
      pagination: paginationInfo
    });
  }
  return true; // Keep the message channel open for async response
});

// Function to detect pagination information
function detectPaginationInfo() {
  try {
    let currentPage = 1;
    let totalPages = 1;
    
    // Method 1: Look for the specific LinkedIn pagination structure from the example
    // This is the most reliable method based on the HTML structure provided
    const artdecoPagination = document.querySelector('.artdeco-pagination');
    if (artdecoPagination) {
      // LinkedIn has a convenient page state element that shows "Page X of Y"
      const pageStateElement = artdecoPagination.querySelector('.artdeco-pagination__page-state');
      if (pageStateElement) {
        const pageStateText = pageStateElement.textContent.trim();
        // Extract numbers from text like "Page 1 of 25"
        const matches = pageStateText.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
        if (matches && matches.length >= 3) {
          currentPage = parseInt(matches[1], 10);
          totalPages = parseInt(matches[2], 10);
          return { currentPage, totalPages };
        }
      }
      
      // Method 1b: If page state text not found, look for the active page button
      const activePage = artdecoPagination.querySelector('.artdeco-pagination__indicator--number.active button, .artdeco-pagination__indicator--number.selected button');
      if (activePage) {
        const pageText = activePage.textContent.trim();
        if (/^\d+$/.test(pageText)) {
          currentPage = parseInt(pageText, 10);
        }
        
        // Find the highest page number in the pagination
        const pageButtons = artdecoPagination.querySelectorAll('.artdeco-pagination__indicator--number button');
        let highestPage = 1;
        
        for (const button of pageButtons) {
          const text = button.textContent.trim();
          if (/^\d+$/.test(text)) {
            const pageNum = parseInt(text, 10);
            if (pageNum > highestPage) {
              highestPage = pageNum;
            }
          }
        }
        
        if (highestPage > 1) {
          totalPages = highestPage;
        }
        
        return { currentPage, totalPages };
      }
      
      // Method 1c: Look for aria-live element with page information
      const ariaLiveElement = artdecoPagination.querySelector('[aria-live="polite"]');
      if (ariaLiveElement) {
        const ariaText = ariaLiveElement.textContent.trim();
        const matches = ariaText.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
        if (matches && matches.length >= 3) {
          currentPage = parseInt(matches[1], 10);
          totalPages = parseInt(matches[2], 10);
          return { currentPage, totalPages };
        }
      }
    }
    
    // Method 2: General pagination detection for other pages or if the structure changes
    const paginationElements = document.querySelectorAll('[class*="pagination"], [class*="page"], ul[aria-label*="pagination"], nav[role="navigation"]');
    
    for (const element of paginationElements) {
      // Skip if we already checked this element
      if (element === artdecoPagination) continue;
      
      // Look for the active/selected page
      const selectedPageElement = element.querySelector('li.selected, [aria-current="page"], [class*="selected"], [class*="active"]');
      if (selectedPageElement) {
        const pageText = selectedPageElement.textContent.trim();
        if (/^\d+$/.test(pageText)) {
          currentPage = parseInt(pageText, 10);
        }
        
        // Find all page number elements to determine total pages
        const pageElements = element.querySelectorAll('li, button, a');
        let highestPage = 1;
        
        for (const pageEl of pageElements) {
          const text = pageEl.textContent.trim();
          if (/^\d+$/.test(text)) {
            const pageNum = parseInt(text, 10);
            if (pageNum > highestPage) {
              highestPage = pageNum;
            }
          }
        }
        
        if (highestPage > 1) {
          totalPages = highestPage;
          break;
        }
      }
    }
    
    // Method 3: Alternative detection using URL parameters
    if (currentPage === 1) {
      const urlParams = new URLSearchParams(window.location.search);
      const pageParam = urlParams.get('page');
      if (pageParam && !isNaN(parseInt(pageParam, 10))) {
        currentPage = parseInt(pageParam, 10);
      }
    }
    
    return {
      currentPage: currentPage,
      totalPages: totalPages
    };
  } catch (error) {
    console.error("Error detecting pagination:", error);
    return {
      currentPage: 1,
      totalPages: 1
    };
  }
}

// Function to extract LinkedIn profiles from search results
function extractLinkedInProfiles() {
  try {
    // Method 0: First try the specialized exact structure extractor
    if (typeof extractLinkedInDataFromDOM === 'function') {
      const exactProfiles = extractLinkedInDataFromDOM();
      if (exactProfiles && exactProfiles.length > 0) {
        console.log(`Found ${exactProfiles.length} profiles using exact structure pattern`);
        return exactProfiles;
      }
    }
    
    // Method 1: Try the specialized screenshot pattern extraction
    if (typeof extractFromScreenshotPattern === 'function') {
      const screenshotProfiles = extractFromScreenshotPattern();
      if (screenshotProfiles && screenshotProfiles.length > 0) {
        console.log(`Found ${screenshotProfiles.length} profiles using screenshot pattern`);
        return screenshotProfiles;
      }
    }
    
    // Method 2: Fallback to the original extraction methods
    const profiles = [];
    
    // Using standard selectors targeting list items
    extractProfilesUsingStandardSelectors(profiles);
    
    // If no profiles found, try finding search result containers
    if (profiles.length === 0) {
      extractProfilesUsingAttributeDetection(profiles);
    }
    
    // Using the HTML pattern from the example
    if (profiles.length === 0) {
      extractProfilesFromExample(profiles);
    }
    
    // Last resort - look for any structure that might contain profiles
    if (profiles.length === 0) {
      extractProfilesByText(profiles);
    }
    
    console.log(`Found ${profiles.length} profiles using fallback methods`);
    return profiles;
  } catch (error) {
    console.error("Error in main extraction process:", error);
    return [];
  }
}

// Method 1: Using standard LinkedIn selectors
function extractProfilesUsingStandardSelectors(profiles) {
  try {
    // Updated selectors based on the screenshot
    // First, try to find elements that look like profile cards with a Message button
    const profileCards = Array.from(document.querySelectorAll('section, div, article, li'))
      .filter(el => {
        // Look for elements that:
        // 1. Have a Message button
        // 2. Have an image (profile photo)
        // 3. Are reasonably sized (not too small)
        
        // Check for message button (without jQuery-like :contains)
        const hasMessageButton = Array.from(el.querySelectorAll('button, a')).some(btn => 
          btn.textContent.trim() === 'Message'
        );
        
        return (
          hasMessageButton &&
          el.querySelector('img') &&
          el.offsetHeight > 80 &&
          el.offsetWidth > 200
        );
      });
    
    // Process each profile card
    profileCards.forEach(card => {
      try {
        // Look for name - typically a prominent text element
        let name = '';
        const nameElements = card.querySelectorAll('h1, h2, h3, h4, [class*="name"], [class*="title"], strong');
        
        for (const el of nameElements) {
          const text = el.textContent.trim();
          if (text && text.length > 1 && text.length < 40 && 
              !text.includes('Message') && !text.includes('mutual')) {
            name = text.replace(/\s*•\s*\d+(?:st|nd|rd|th)$/, ''); // Remove "• 1st" etc.
            break;
          }
        }
        
        // If no name found, skip this card
        if (!name) return;
        
        // Find the LinkedIn URL
        const linkElement = card.querySelector('a[href*="/in/"]');
        if (!linkElement) return;
        
        const url = linkElement.href;
        const cleanURL = new URL(url);
        const canonicalURL = cleanURL.origin + cleanURL.pathname;
        
        // Find title - typically near the name or as a subtitle
        let title = '';
        
        // In the screenshot, titles are often right below names
        // Look for elements with words like "CEO", "at", "Founder", etc.
        const allElements = card.querySelectorAll('*');
        
        for (const el of allElements) {
          const text = el.textContent.trim();
          
          if (text && text !== name && text.length < 100 &&
              !text.includes('Message') && !text.includes('mutual') &&
              !text.includes('connections') && !text.includes('followers')) {
            
            // Look for common title patterns
            if (text.match(/(?:CEO|CTO|CFO|Founder|President|Director|Manager|Engineer|Head of|Leader|Partner|at)/i)) {
              title = text;
              break;
            }
          }
        }
        
        // Try to get profile image
        let imageUrl = '';
        const imgElement = card.querySelector('img');
        if (imgElement && imgElement.src) {
          imageUrl = imgElement.src;
        }
        
        // Add the profile if we have a name and URL
        if (name && canonicalURL && !profiles.some(p => p.url === canonicalURL)) {
          profiles.push({
            name,
            url: canonicalURL,
            title,
            imageUrl
          });
        }
      } catch (e) {
        console.error('Error with standard selectors:', e);
      }
    });
    
    // If no profiles found, fall back to original selectors
    if (profiles.length === 0) {
      // Traditional selector patterns
      const oldProfileCards = document.querySelectorAll('li.reusable-search__result-container');
      
      oldProfileCards.forEach(card => {
        try {
          const nameElement = card.querySelector('.entity-result__title-text a');
          if (!nameElement) return;
          
          const name = nameElement.textContent.trim();
          const url = nameElement.href;
          const cleanURL = new URL(url);
          const canonicalURL = cleanURL.origin + cleanURL.pathname;
          
          const titleElement = card.querySelector('.entity-result__primary-subtitle');
          const title = titleElement ? titleElement.textContent.trim() : '';
          
          profiles.push({
            name,
            url: canonicalURL,
            title
          });
        } catch (e) {
          console.error('Error with legacy selectors:', e);
        }
      });
    }
  } catch (e) {
    console.error('Error in standard selectors method:', e);
  }
}

// Method 2: Using attribute detection for LinkedIn's dynamic classes
function extractProfilesUsingAttributeDetection(profiles) {
  // Look for elements that might be profile cards based on attributes
  // Find all li elements that might be search results
  const allListItems = document.querySelectorAll('li');
  
  allListItems.forEach(item => {
    try {
      // Look for anchors with hrefs containing "/in/" (LinkedIn profile URLs)
      const profileLinks = item.querySelectorAll('a[href*="/in/"]');
      
      for (const link of profileLinks) {
        // Get the name from the link
        const name = link.textContent.trim();
        if (!name) continue;
        
        const url = link.href;
        const cleanURL = new URL(url);
        const canonicalURL = cleanURL.origin + cleanURL.pathname;
        
        // Try to find the job title by looking at nearby elements
        let title = '';
        let current = link.parentElement;
        
        // Search up to 3 parent levels for siblings that might contain the title
        for (let i = 0; i < 3 && current; i++) {
          const siblings = [...current.parentElement.children];
          const currentIndex = siblings.indexOf(current);
          
          // Look at the next sibling which often contains the title
          if (currentIndex >= 0 && siblings[currentIndex + 1]) {
            const potentialTitle = siblings[currentIndex + 1].textContent.trim();
            if (potentialTitle && potentialTitle !== name) {
              title = potentialTitle;
              break;
            }
          }
          current = current.parentElement;
        }
        
        // Only add if we haven't already found this profile
        if (!profiles.some(p => p.url === canonicalURL)) {
          profiles.push({
            name,
            url: canonicalURL,
            title
          });
        }
      }
    } catch (e) {
      console.error('Error with attribute detection:', e);
    }
  });
}

// Method 3: Using the HTML structure from the example provided
function extractProfilesFromExample(profiles) {
  try {
    // Look for list items that may contain profile information
    const listItems = document.querySelectorAll('li');
    
    listItems.forEach(item => {
      try {
        // Based on the screenshot, look for profile name near a "Message" button
        // First, check if this is a search result item
        const messageButton = item.querySelector('button:contains("Message"), a:contains("Message")');
        if (!messageButton) return;
        
        // Find profile name - typically a strong heading element before the Message button
        let name = '';
        const nameHeading = item.querySelector('[class*="name"], [aria-label*="name"], h1, h2, h3, strong');
        if (nameHeading) {
          name = nameHeading.textContent.trim();
        }
        
        // If name wasn't found, try broader selectors
        if (!name) {
          // Check all elements with big text that might be a name
          const potentialNameElements = item.querySelectorAll('span[style*="font-size"], [class*="large"], [class*="title"], [class*="name"]');
          for (const element of potentialNameElements) {
            const text = element.textContent.trim();
            if (text && text.length > 1 && text.length < 40 && !text.includes('Message') && !text.includes('•')) {
              name = text;
              break;
            }
          }
        }
        
        // Find LinkedIn URL - look for any link to a profile
        const urlElement = item.querySelector('a[href*="/in/"]');
        if (!urlElement) return;
        
        const url = urlElement.href;
        const cleanURL = new URL(url);
        const canonicalURL = cleanURL.origin + cleanURL.pathname;
        
        // Extract job title - often near location information
        let title = '';
        
        // Try to find title text - it's usually near location text or below the name
        const potentialTitleElements = item.querySelectorAll('[class*="position"], [class*="title"], [class*="headline"], p, span');
        
        for (const element of potentialTitleElements) {
          const text = element.textContent.trim();
          // Title is typically shorter than 100 chars, doesn't contain "Message" or "mutual connections"
          if (text && text.length < 100 && !text.includes('Message') && !text.includes('connections') && 
              !text.includes('follow') && text !== name && !text.includes('•')) {
            // Check if this looks like a title (contains common title keywords or patterns)
            if (text.includes('at') || text.includes('CEO') || text.includes('Founder') || 
                text.includes('Manager') || text.includes('Director') || text.includes('Engineer') ||
                text.includes('Leader') || text.includes('Head of') || text.includes('Partner')) {
              title = text;
              break;
            }
          }
        }
        
        // Only add if we have a name and haven't already found this profile
        if (name && !profiles.some(p => p.url === canonicalURL)) {
          profiles.push({
            name,
            url: canonicalURL,
            title
          });
        }
      } catch (e) {
        console.error('Error extracting from example HTML:', e);
      }
    });
    
    // If still no profiles, try the specific pattern shown in the screenshot
    if (profiles.length === 0) {
      // Look for elements that match the pattern in the screenshot
      const profileElements = document.querySelectorAll('[class*="profile-card"], [class*="search-result"]');
      
      profileElements.forEach(profileCard => {
        try {
          // In the screenshot, names are prominently displayed
          const nameElement = profileCard.querySelector('h3, h2, h1, [class*="name"], [class*="title"]');
          if (!nameElement) return;
          
          const name = nameElement.textContent.trim().replace(/\s*\d+st\s*$/, ''); // Remove "1st" text
          
          // Find LinkedIn URL
          const urlElement = profileCard.querySelector('a[href*="/in/"]');
          if (!urlElement) return;
          
          const url = urlElement.href;
          const cleanURL = new URL(url);
          const canonicalURL = cleanURL.origin + cleanURL.pathname;
          
          // Find job title - in the screenshot it's right below the name
          let title = '';
          const titleContainer = nameElement.parentElement;
          if (titleContainer && titleContainer.nextElementSibling) {
            title = titleContainer.nextElementSibling.textContent.trim();
          }
          
          // If title not found, try other approaches
          if (!title) {
            const potentialTitleElements = profileCard.querySelectorAll('p, [class*="subtitle"], [class*="position"]');
            for (const element of potentialTitleElements) {
              const text = element.textContent.trim();
              if (text && text !== name && !text.includes('Message') && !text.includes('connections')) {
                title = text;
                break;
              }
            }
          }
          
          // Only add if we have a name and haven't already found this profile
          if (name && !profiles.some(p => p.url === canonicalURL)) {
            profiles.push({
              name,
              url: canonicalURL,
              title
            });
          }
        } catch (e) {
          console.error('Error extracting profile from card:', e);
        }
      });
    }
  } catch (e) {
    console.error('Error in example extraction method:', e);
  }
}

// Method 4: Look for any text that might represent names and job titles
function extractProfilesByText(profiles) {
  // This is a last resort approach - it might be less accurate
  try {
    // Get all elements with text content
    const elements = document.querySelectorAll('*');
    const processed = new Set();
    
    for (const element of elements) {
      try {
        if (element.tagName === 'A' && element.href.includes('/in/')) {
          const url = element.href;
          const cleanURL = new URL(url);
          const canonicalURL = cleanURL.origin + cleanURL.pathname;
          
          // Skip if we've already processed this URL
          if (processed.has(canonicalURL)) continue;
          processed.add(canonicalURL);
          
          // Get the profile name
          let name = element.textContent.trim();
          if (!name) {
            const nameElement = element.querySelector('span') || element;
            name = nameElement.textContent.trim();
          }
          
          // Try to find the title by looking at nearby elements
          let title = '';
          let current = element.parentElement;
          
          // Search nearby elements for potential job title
          for (let i = 0; i < 5 && current; i++) {
            const siblings = [...current.parentElement.children];
            const currentIndex = siblings.indexOf(current);
            
            if (currentIndex >= 0) {
              for (let j = 1; j <= 3; j++) {
                if (siblings[currentIndex + j]) {
                  const potentialTitle = siblings[currentIndex + j].textContent.trim();
                  if (potentialTitle && potentialTitle !== name && !potentialTitle.includes('/in/')) {
                    title = potentialTitle;
                    break;
                  }
                }
              }
            }
            
            if (title) break;
            current = current.parentElement;
          }
          
          // Only add if we have a name and haven't already found this profile
          if (name && name.length > 1 && !profiles.some(p => p.url === canonicalURL)) {
            profiles.push({
              name,
              url: canonicalURL,
              title
            });
          }
        }
      } catch (e) {
        // Skip any errors and continue to the next element
      }
    }
  } catch (e) {
    console.error('Error in text extraction fallback:', e);
  }
}