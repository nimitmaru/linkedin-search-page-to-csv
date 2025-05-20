/**
 * Utils.js - Helper functions for the LinkedIn Chrome Extension
 */

// Helper to escape HTML to prevent XSS
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Normalizes and migrates any existing search data
 * This ensures profiles aren't lost when we fix the search ID format
 */
function migrateSearchData(allSearches, combineProfiles) {
  if (!allSearches || Object.keys(allSearches).length === 0) {
    return allSearches;
  }
  
  console.log("Migrating search data to normalized format");
  const migratedSearches = {};
  const connectionIdMap = new Map();
  
  // First pass - identify similar search IDs that need to be merged
  for (const searchId in allSearches) {
    // Extract the path and connection ID parts
    const parts = searchId.split('_');
    const path = parts[0];
    let connectionId = parts.slice(1).join('_');
    
    // Skip if no connection ID
    if (!connectionId) {
      migratedSearches[searchId] = allSearches[searchId];
      continue;
    }
    
    // Normalize the connection ID by removing brackets and quotes
    try {
      // Handle JSON array format
      if (connectionId.startsWith('[') && connectionId.endsWith(']')) {
        try {
          const parsed = JSON.parse(connectionId);
          if (Array.isArray(parsed) && parsed.length > 0) {
            connectionId = parsed[0];
          }
        } catch (e) {
          // If parsing fails, just remove brackets manually
          connectionId = connectionId.replace(/^\[|\]$/g, '').replace(/^"|"$/g, '');
        }
      }
      
      // Clean up any remaining quotes
      connectionId = connectionId.replace(/^"|"$/g, '');
    } catch (e) {
      console.error("Error normalizing connection ID:", e);
    }
    
    // Create normalized search ID
    const normalizedId = `${path}_${connectionId}`;
    
    // Track which original IDs map to which normalized ID
    if (!connectionIdMap.has(normalizedId)) {
      connectionIdMap.set(normalizedId, []);
    }
    connectionIdMap.get(normalizedId).push(searchId);
  }
  
  // Second pass - merge profiles from similar search IDs
  connectionIdMap.forEach((originalIds, normalizedId) => {
    if (originalIds.length === 1) {
      // No merging needed, just use normalized ID
      migratedSearches[normalizedId] = allSearches[originalIds[0]];
    } else {
      // We need to merge multiple entries
      console.log(`Merging ${originalIds.length} searches into ${normalizedId}`);
      
      // Start with the first entry's data
      migratedSearches[normalizedId] = { ...allSearches[originalIds[0]] };
      migratedSearches[normalizedId].profiles = [...(allSearches[originalIds[0]].profiles || [])];
      
      // Merge in profiles from additional entries
      for (let i = 1; i < originalIds.length; i++) {
        const additionalProfiles = allSearches[originalIds[i]].profiles || [];
        if (additionalProfiles.length > 0) {
          console.log(`Merging in ${additionalProfiles.length} additional profiles from ${originalIds[i]}`);
          migratedSearches[normalizedId].profiles = combineProfiles(
            migratedSearches[normalizedId].profiles,
            additionalProfiles
          );
        }
      }
    }
  });
  
  console.log(`Migration complete. Original searches: ${Object.keys(allSearches).length}, Migrated searches: ${Object.keys(migratedSearches).length}`);
  return migratedSearches;
}

// Helper to show toast notification
function showToast(message) {
  // Create toast if it doesn't exist
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  
  // Set message and show
  toast.textContent = message;
  toast.classList.add('visible');
  
  // Hide after 2 seconds
  setTimeout(() => {
    toast.classList.remove('visible');
  }, 2000);
}

// Helper to show a mini toast notification
// Less intrusive for automatic operations like auto-saving
function showMiniToast(message) {
  // Create mini-toast if it doesn't exist
  let miniToast = document.querySelector('.mini-toast');
  if (!miniToast) {
    miniToast = document.createElement('div');
    miniToast.className = 'mini-toast';
    
    // Style the mini-toast to be less intrusive
    miniToast.style.position = 'fixed';
    miniToast.style.bottom = '10px';
    miniToast.style.right = '10px';
    miniToast.style.backgroundColor = 'rgba(25, 118, 210, 0.7)';
    miniToast.style.color = 'white';
    miniToast.style.padding = '5px 10px';
    miniToast.style.borderRadius = '4px';
    miniToast.style.fontSize = '12px';
    miniToast.style.zIndex = '1000';
    miniToast.style.transition = 'opacity 0.3s ease-in-out';
    miniToast.style.opacity = '0';
    
    document.body.appendChild(miniToast);
  }
  
  // Set message and show
  miniToast.textContent = message;
  miniToast.style.opacity = '1';
  
  // Hide after 1.5 seconds (shorter than regular toast)
  setTimeout(() => {
    miniToast.style.opacity = '0';
  }, 1500);
}

// Export all utility functions
export {
  escapeHtml,
  migrateSearchData,
  showToast,
  showMiniToast
};