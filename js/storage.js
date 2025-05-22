/**
 * Storage.js - Storage operations for the LinkedIn Chrome Extension
 */

import { migrateSearchData, showToast, showMiniToast } from './utils.js';
import { combineProfiles } from './profiles.js';

// Global state to be shared and managed
const state = {
  extractedData: [],
  storedProfiles: [],
  isAppendMode: true,
  currentSearchId: '',
  allStoredSearches: {},
  partnerInfo: {
    linkedInURL: '',
    fullName: '',
    title: '',
    company: '',
    isOnLinkedInProfile: false
  },
  devMode: true // Default to dev mode ON
};

/**
 * Loads previously stored data on popup open
 * @param {Object} callbacks - Callbacks to be called after data is loaded
 *   @param {Function} callbacks.onDataLoaded - Called when data is loaded
 *   @param {Function} callbacks.updateUI - Called to update UI
 *   @param {Function} callbacks.updateExportButtonsState - Called to update export buttons
 *   @param {Function} callbacks.onPartnerInfoLoaded - Called when partner info is loaded
 */
function loadStoredProfiles(callbacks) {
  console.log("loadStoredProfiles: Starting to load stored profiles");
  
  chrome.storage.local.get(['linkedInSearches', 'appendMode'], function(result) {
    // Get the current active tab to determine the search ID
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const activeTab = tabs[0];
      console.log("loadStoredProfiles: Current URL:", activeTab.url);
      
      // Update append mode checkbox if available
      if (typeof result.appendMode !== 'undefined') {
        state.isAppendMode = result.appendMode;
        const appendCheckbox = document.getElementById('append-mode');
        if (appendCheckbox) {
          appendCheckbox.checked = state.isAppendMode;
        }
        console.log(`loadStoredProfiles: Append mode is ${state.isAppendMode ? 'enabled' : 'disabled'}`);
      }
      
      // If no searches are stored yet, create an empty object
      if (!result.linkedInSearches) {
        console.log("loadStoredProfiles: No stored searches found");
        state.allStoredSearches = {};
        return;
      }
      
      // Store all searches, but first migrate them to the normalized format
      // This ensures we don't lose existing data due to format changes
      const originalSearches = result.linkedInSearches;
      console.log("loadStoredProfiles: Original searches:", Object.keys(originalSearches).map(key => ({
        id: key,
        profileCount: originalSearches[key]?.profiles?.length || 0
      })));
      
      // Migrate and normalize the search data
      state.allStoredSearches = migrateSearchData(originalSearches, combineProfiles);
      
      console.log("loadStoredProfiles: After migration:", Object.keys(state.allStoredSearches).map(key => ({
        id: key,
        profileCount: state.allStoredSearches[key]?.profiles?.length || 0
      })));
      
      // Save the migrated data back to storage
      chrome.storage.local.set({ linkedInSearches: state.allStoredSearches });
      
      // Execute the content script to get the current search ID
      chrome.tabs.sendMessage(activeTab.id, {action: "extract"}, function(response) {
        if (chrome.runtime.lastError || !response || !response.searchInfo) {
          console.error("Error getting search info:", chrome.runtime.lastError);
          return;
        }
        
        // Set the current search ID
        state.currentSearchId = response.searchInfo.searchId;
        console.log("loadStoredProfiles: Current search ID:", state.currentSearchId);
        
        // Debug - log the connection name if available
        if (response.searchInfo.connectionName) {
          console.log(`loadStoredProfiles: Connection name: "${response.searchInfo.connectionName}"`);
          
          // Check if the connection name matches the stored VC partner name
          // This helps associate the current search with the correct VC partner
          if (state.partnerInfo && state.partnerInfo.fullName) {
            const connectionName = response.searchInfo.connectionName.toLowerCase().trim();
            const partnerName = state.partnerInfo.fullName.toLowerCase().trim();
            
            // Look for a match between connection name and partner name
            // Using includes instead of exact match to handle partial names
            if (connectionName.includes(partnerName) || partnerName.includes(connectionName)) {
              console.log(`Match found between connection name "${connectionName}" and VC partner "${partnerName}"`);
              // Connection matches our stored VC partner - ensure the UI reflects this
              if (callbacks.onPartnerInfoLoaded) {
                callbacks.onPartnerInfoLoaded();
              }
            } else {
              console.log(`No match between connection name "${connectionName}" and VC partner "${partnerName}"`);
            }
          }
        }
        
        // Always capture extracted data right away to ensure we don't lose it
        if (response.data && response.data.length > 0) {
          state.extractedData = response.data;
          if (callbacks.onDataLoaded) {
            callbacks.onDataLoaded(response.data);
          }
        }
        
        // Load profiles specific to this search
        if (state.allStoredSearches[state.currentSearchId]) {
          state.storedProfiles = state.allStoredSearches[state.currentSearchId].profiles || [];
          console.log(`loadStoredProfiles: Found ${state.storedProfiles.length} stored profiles for current search ID`);
          
          // Update status to show stored profiles for this search
          const statusDiv = document.getElementById('status');
          if (state.storedProfiles.length > 0 && statusDiv) {
            statusDiv.textContent = `${state.storedProfiles.length} profiles in memory from previous pages of this search`;
            
            // If we have extracted data and stored profiles, save them together immediately
            if (state.extractedData && state.extractedData.length > 0) {
              console.log(`loadStoredProfiles: Combining ${state.extractedData.length} new profiles with ${state.storedProfiles.length} stored profiles`);
              
              // Display the combined data and save it
              if (callbacks.updateUI) {
                callbacks.updateUI(state.extractedData);
              }
              saveProfilesToStorage();
              
              // Make sure export buttons are enabled since we have data
              if (callbacks.updateExportButtonsState) {
                callbacks.updateExportButtonsState();
              }
              
              // Debug - log profile counts after combining
              const totalProfiles = getAllProfilesForCurrentSearch();
              console.log(`loadStoredProfiles: After combining, we have ${totalProfiles.length} total profiles`);
            }
          }
        } else {
          // Initialize new search entry
          state.storedProfiles = [];
          console.log("Starting new search collection");
          
          // If we have extracted data, save it right away
          if (state.extractedData && state.extractedData.length > 0) {
            state.allStoredSearches[state.currentSearchId] = {
              profiles: [],
              searchPath: response.searchInfo.urlPath,
              connectionIdentifier: response.searchInfo.connectionIdentifier,
              connectionName: response.searchInfo.connectionName,
              searchType: response.searchInfo.searchType,
              lastAccessed: new Date().toISOString()
            };
            
            // Save initial data
            saveProfilesToStorage();
            
            // Update export button states based on available data
            if (callbacks.updateExportButtonsState) {
              callbacks.updateExportButtonsState();
            }
          }
        }
      });
    });
  });
}

/**
 * Saves extracted profiles to Chrome storage, preserving selection state
 * This is a critical function that ensures profile data persists between page
 * navigations and popup sessions.
 */
function saveProfilesToStorage() {
  // Validate required data
  if (!state.currentSearchId) {
    console.error("Cannot save profiles: missing search ID");
    return;
  }
  
  console.log(`saveProfilesToStorage: Starting with search ID ${state.currentSearchId}`);
  console.log(`saveProfilesToStorage: Initial state - extractedData: ${state.extractedData?.length || 0}, storedProfiles: ${state.storedProfiles?.length || 0}`);
  
  // Don't require extractedData to exist - we might just be updating selection state
  // for existing profiles
  
  // Start with current extracted data, or an empty array if none exists
  let profilesToSave = state.extractedData || [];
  
  // If we're in append mode and have stored profiles, merge them with new profiles
  if (state.isAppendMode && state.storedProfiles && state.storedProfiles.length > 0) {
    console.log(`saveProfilesToStorage: Combining ${profilesToSave.length} profiles with ${state.storedProfiles.length} stored profiles`);
    // Combine stored profiles with newly extracted profiles
    profilesToSave = combineProfiles(state.storedProfiles, profilesToSave);
    console.log(`saveProfilesToStorage: After combining, we have ${profilesToSave.length} profiles`);
  }
  
  // Check for closeness index values from pill selectors
  const closenessValues = new Map();
  document.querySelectorAll('.pill-selector').forEach(pill => {
    const url = pill.getAttribute('data-url');
    const value = parseInt(pill.getAttribute('data-value'));
    if (url && !isNaN(value)) {
      closenessValues.set(url, value);
    }
  });
  
  // Update the profiles with closeness index and selection state
  profilesToSave = profilesToSave.map(profile => {
    // Get closeness index from UI if available, otherwise preserve existing value
    const closenessIndex = closenessValues.has(profile.url) ? 
                         closenessValues.get(profile.url) : 
                         (profile.closenessIndex !== undefined ? profile.closenessIndex : 1);
    
    return {
      ...profile,
      // Use the pill value to determine closeness index
      closenessIndex: closenessIndex
    };
  });
  
  // Update the profiles for this specific search
  state.allStoredSearches[state.currentSearchId] = {
    ...state.allStoredSearches[state.currentSearchId],
    profiles: profilesToSave,
    lastAccessed: new Date().toISOString()
  };
  
  // Additional logging to track what's being stored
  console.log(`saveProfilesToStorage: About to save ${profilesToSave.length} profiles for search ID ${state.currentSearchId}`);
  console.log(`saveProfilesToStorage: allStoredSearches before save:`, Object.keys(state.allStoredSearches).map(key => ({
    id: key,
    profileCount: state.allStoredSearches[key]?.profiles?.length || 0
  })));
  
  // Save all searches to Chrome storage
  chrome.storage.local.set({
    linkedInSearches: state.allStoredSearches,
    appendMode: state.isAppendMode
  }, function() {
    console.log(`Saved ${profilesToSave.length} profiles for search ${state.currentSearchId}`);
    // Update our local copy of stored profiles to maintain consistency
    state.storedProfiles = profilesToSave;
    
    // Verify what we've stored
    console.log(`saveProfilesToStorage: Updated storedProfiles to ${state.storedProfiles.length} profiles`);
    console.log(`saveProfilesToStorage: allStoredSearches after save:`, Object.keys(state.allStoredSearches).map(key => ({
      id: key,
      profileCount: state.allStoredSearches[key]?.profiles?.length || 0
    })));
    
    // Show a mini toast notification if we have auto-saved profiles during page navigation
    // Only show this if we're not responding to a manual checkbox action
    if (!document.activeElement || !document.activeElement.classList.contains('profile-checkbox')) {
      showMiniToast(`Auto-saved ${profilesToSave.length} profiles`);
    }
  });
}

/**
 * Function to clear stored profiles for the current search
 */
function clearStoredProfiles() {
  if (state.currentSearchId && state.allStoredSearches[state.currentSearchId]) {
    // Clear only profiles for the current search
    state.allStoredSearches[state.currentSearchId].profiles = [];
    
    // Save the updated searches
    chrome.storage.local.set({ linkedInSearches: state.allStoredSearches }, function() {
      state.storedProfiles = [];
      showToast('Stored profiles for this search cleared');
      const statusDiv = document.getElementById('status');
      if (statusDiv) {
        statusDiv.textContent = 'All stored profiles for this search have been cleared';
      }
    });
  } else {
    // Clear all stored profiles for all searches
    chrome.storage.local.remove(['linkedInSearches'], function() {
      state.allStoredSearches = {};
      state.storedProfiles = [];
      showToast('All stored profiles cleared');
      const statusDiv = document.getElementById('status');
      if (statusDiv) {
        statusDiv.textContent = 'All stored profiles for all searches have been cleared';
      }
    });
  }
}

/**
 * Function to clear ALL stored profiles (across all searches)
 */
function clearAllStoredProfiles() {
  chrome.storage.local.remove(['linkedInSearches'], function() {
    state.allStoredSearches = {};
    state.storedProfiles = [];
    showToast('All stored profiles cleared');
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
      statusDiv.textContent = 'All stored profiles for all searches have been cleared';
    }
  });
}

/**
 * Gets all profiles for the current search, combining stored and extracted data
 * 
 * @return {Array} All profiles for the current search
 */
function getAllProfilesForCurrentSearch() {
  if (!state.currentSearchId) return [];
  
  // Get profiles from storage for this search
  const storedProfilesForSearch = state.allStoredSearches[state.currentSearchId]?.profiles || [];
  
  console.log(`getAllProfilesForCurrentSearch: Found ${storedProfilesForSearch.length} stored profiles and ${state.extractedData.length} extracted profiles`);
  
  // Combine with any newly extracted profiles
  const combinedProfiles = combineProfiles(storedProfilesForSearch, state.extractedData);
  
  console.log(`getAllProfilesForCurrentSearch: Returning ${combinedProfiles.length} combined profiles`);
  
  return combinedProfiles;
}

/**
 * Function to save partner info to storage
 */
function savePartnerInfoToStorage() {
  chrome.storage.local.set({ 'partnerInfo': state.partnerInfo });
}

/**
 * Function to load partner info from storage
 * @param {Function} onPartnerInfoLoaded - Callback to be called when partner info is loaded
 */
function loadPartnerInfoFromStorage(onPartnerInfoLoaded) {
  chrome.storage.local.get('partnerInfo', function(result) {
    console.log('loadPartnerInfoFromStorage', result);
    if (result.partnerInfo) {
      // Update state with stored partner info
      state.partnerInfo = result.partnerInfo;
      console.log('Loaded VC Partner info from storage:', state.partnerInfo);
      
      // After partner info is loaded, check if it matches the current search context
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const activeTab = tabs[0];
        
        // If we're on a search page, try to associate with the current context
        if (activeTab.url.includes('linkedin.com/search/results')) {
          try {
            // Extract connection name from URL if possible
            const url = new URL(activeTab.url);
            if (url.searchParams.has('connectionOf') || url.searchParams.has('facetConnectionOf')) {
              // Get connection info from search params, likely need content script to get human name
              console.log('On a connections search page, will check for VC partner match');
              // We'll rely on the loadStoredProfiles function to handle this matching
            }
          } catch (e) {
            console.error('Error checking URL for connection context:', e);
          }
        }
        
        // Call callback regardless
        if (onPartnerInfoLoaded) {
          onPartnerInfoLoaded();
        }
      });
    } else {
      // No stored partner info, but still call the callback
      if (onPartnerInfoLoaded) {
        onPartnerInfoLoaded();
      }
    }
  });
}

/**
 * Updates the append mode setting
 * @param {boolean} isAppendMode - Whether append mode is enabled
 */
function updateAppendMode(isAppendMode) {
  state.isAppendMode = isAppendMode;
  chrome.storage.local.set({ appendMode: state.isAppendMode });
}

/**
 * Updates the dev mode setting
 * @param {boolean} isDevMode - Whether dev mode is enabled
 */
function updateDevMode(isDevMode) {
  state.devMode = isDevMode;
  chrome.storage.local.set({ devMode: state.devMode });
}

/**
 * Function to load dev mode from storage
 * @param {Function} onDevModeLoaded - Callback to be called when dev mode is loaded
 */
function loadDevModeFromStorage(onDevModeLoaded) {
  chrome.storage.local.get('devMode', function(result) {
    if (result.devMode !== undefined) {
      state.devMode = result.devMode;
    }
    if (onDevModeLoaded) {
      onDevModeLoaded();
    }
  });
}

export {
  state,
  loadStoredProfiles,
  saveProfilesToStorage,
  clearStoredProfiles,
  clearAllStoredProfiles,
  getAllProfilesForCurrentSearch,
  savePartnerInfoToStorage,
  loadPartnerInfoFromStorage,
  updateAppendMode,
  updateDevMode,
  loadDevModeFromStorage
};