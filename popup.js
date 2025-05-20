// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
  const refreshButton = document.getElementById('refresh');
  const exportButton = document.getElementById('export');
  const copyButton = document.getElementById('copy-clipboard');
  const selectAllCheckbox = document.getElementById('select-all');
  const deselectAllButton = document.getElementById('deselect-all');
  const selectControls = document.querySelector('.select-controls');
  const statusDiv = document.getElementById('status');
  const resultsDiv = document.getElementById('results');
  
  let extractedData = [];
  let selectedProfiles = new Set();
  let storedProfiles = [];
  let isAppendMode = true;
  let currentSearchId = ''; // Identifier for the current search
  let allStoredSearches = {}; // Store all searches
  
  /**
   * Normalizes and migrates any existing search data
   * This ensures profiles aren't lost when we fix the search ID format
   */
  function migrateSearchData(allSearches) {
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
  
  // Load previously stored data on popup open
  function loadStoredProfiles() {
    console.log("loadStoredProfiles: Starting to load stored profiles");
    
    chrome.storage.local.get(['linkedInSearches', 'appendMode'], function(result) {
      // Get the current active tab to determine the search ID
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const activeTab = tabs[0];
        console.log("loadStoredProfiles: Current URL:", activeTab.url);
        
        // Update append mode checkbox if available
        if (typeof result.appendMode !== 'undefined') {
          isAppendMode = result.appendMode;
          const appendCheckbox = document.getElementById('append-mode');
          if (appendCheckbox) {
            appendCheckbox.checked = isAppendMode;
          }
          console.log(`loadStoredProfiles: Append mode is ${isAppendMode ? 'enabled' : 'disabled'}`);
        }
        
        // If no searches are stored yet, create an empty object
        if (!result.linkedInSearches) {
          console.log("loadStoredProfiles: No stored searches found");
          allStoredSearches = {};
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
        allStoredSearches = migrateSearchData(originalSearches);
        
        console.log("loadStoredProfiles: After migration:", Object.keys(allStoredSearches).map(key => ({
          id: key,
          profileCount: allStoredSearches[key]?.profiles?.length || 0
        })));
        
        // Save the migrated data back to storage
        chrome.storage.local.set({ linkedInSearches: allStoredSearches });
        
        // Execute the content script to get the current search ID
        chrome.tabs.sendMessage(activeTab.id, {action: "extract"}, function(response) {
          if (chrome.runtime.lastError || !response || !response.searchInfo) {
            console.error("Error getting search info:", chrome.runtime.lastError);
            return;
          }
          
          // Set the current search ID
          currentSearchId = response.searchInfo.searchId;
          console.log("loadStoredProfiles: Current search ID:", currentSearchId);
          
          // Debug - log the connection name if available
          if (response.searchInfo.connectionName) {
            console.log(`loadStoredProfiles: Connection name: "${response.searchInfo.connectionName}"`);
          }
          
          // Always capture extracted data right away to ensure we don't lose it
          if (response.data && response.data.length > 0) {
            extractedData = response.data;
          }
          
          // Load profiles specific to this search
          if (allStoredSearches[currentSearchId]) {
            storedProfiles = allStoredSearches[currentSearchId].profiles || [];
            console.log(`loadStoredProfiles: Found ${storedProfiles.length} stored profiles for current search ID`);
            
            // Update status to show stored profiles for this search
            if (storedProfiles.length > 0) {
              statusDiv.textContent = `${storedProfiles.length} profiles in memory from previous pages of this search`;
              
              // If we have extracted data and stored profiles, save them together immediately
              if (extractedData && extractedData.length > 0) {
                console.log(`loadStoredProfiles: Combining ${extractedData.length} new profiles with ${storedProfiles.length} stored profiles`);
                
                // Display the combined data and save it
                displayResultsWithCheckboxes(extractedData);
                saveProfilesToStorage();
                
                // Make sure export buttons are enabled since we have data
                updateExportButtonsState();
                
                // Debug - log profile counts after combining
                const totalProfiles = getAllProfilesForCurrentSearch();
                console.log(`loadStoredProfiles: After combining, we have ${totalProfiles.length} total profiles`);
              }
            }
          } else {
            // Initialize new search entry
            storedProfiles = [];
            console.log("Starting new search collection");
            
            // If we have extracted data, save it right away
            if (extractedData && extractedData.length > 0) {
              allStoredSearches[currentSearchId] = {
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
              updateExportButtonsState();
            }
          }
        });
      });
    });
  }
  
  // Function to extract data from LinkedIn
  function extractLinkedInData() {
    statusDiv.textContent = 'Extracting data...';
    resultsDiv.innerHTML = `
      <div class="loading-indicator">
        <div class="spinner"></div>
        <p>Extracting LinkedIn profiles...</p>
      </div>
    `;
    console.log('extractedData before extraction: ', extractedData)
    
    // Query the active tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const activeTab = tabs[0];
      
      // Check if we're on a LinkedIn search page
      if (!activeTab.url.includes('linkedin.com/search/results')) {
        statusDiv.textContent = 'Error: Please navigate to a LinkedIn search results page';
        resultsDiv.innerHTML = '<p class="instructions">This extension only works on LinkedIn search results pages.</p>';
        return;
      }
      
      // Execute content script to extract data
      chrome.tabs.sendMessage(activeTab.id, {action: "extract"}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
          resultsDiv.innerHTML = '<p class="instructions">An error occurred. Try refreshing the page and opening the extension again.</p>';
          return;
        }
        
        if (response && response.data && response.data.length > 0) {
          extractedData = response.data;
          
          // Capture search information
          if (response.searchInfo) {
            currentSearchId = response.searchInfo.searchId;
            
            // If this is a new search we haven't seen before
            if (!allStoredSearches[currentSearchId]) {
              allStoredSearches[currentSearchId] = {
                profiles: [],
                searchPath: response.searchInfo.urlPath,
                connectionIdentifier: response.searchInfo.connectionIdentifier,
                connectionName: response.searchInfo.connectionName,
                searchType: response.searchInfo.searchType,
                lastAccessed: new Date().toISOString()
              };
            }
            
            // If we're on a new search, but not in append mode, clear any previously stored profiles
            // for this specific search (we'll continue appending to profiles from the same search)
            if (!isAppendMode) {
              storedProfiles = [];
            } else {
              // In append mode, make sure we're using profiles from the current search
              console.log('currentSearchId: ', currentSearchId)
              console.log('allStoredSearches: ', allStoredSearches)
              storedProfiles = allStoredSearches[currentSearchId].profiles || [];
            }
          }
          
          // Handle pagination info if available
          if (response.pagination) {
            const { currentPage, totalPages } = response.pagination;
            
            // Update status text with pagination info
            statusDiv.textContent = `Found ${extractedData.length} profiles (Page ${currentPage} of ${totalPages})`;
            
            // If in append mode and we have stored profiles for this search, combine them
            if (isAppendMode && storedProfiles.length > 0) {
              console.log(`extractLinkedInData: Combining ${extractedData.length} current profiles with ${storedProfiles.length} stored profiles`);
              const combinedProfiles = combineProfiles(storedProfiles, extractedData);
              statusDiv.textContent += ` | Total: ${combinedProfiles.length} profiles`;
              
              // Update our in-memory copy of stored profiles with the combined data
              // This ensures getAllProfilesForCurrentSearch() gets the right data
              if (allStoredSearches[currentSearchId]) {
                allStoredSearches[currentSearchId].profiles = combinedProfiles;
                storedProfiles = combinedProfiles;
                console.log(`extractLinkedInData: Updated storedProfiles to ${storedProfiles.length} combined profiles`);
              }
            }
          } else {
            statusDiv.textContent = `Found ${extractedData.length} profiles`;
          }
          
          // Reset selection state
          selectedProfiles.clear();
          
          // Always save profiles to storage right after extraction, regardless of selections
          // This ensures profiles are saved when navigating between pages
          console.log('extractedData saved right after extraction: ', extractedData)
          saveProfilesToStorage();
          
          // Display extracted data with checkboxes
          displayResultsWithCheckboxes(extractedData);
          
          // Show select controls
          selectControls.classList.remove('hidden');
          
          // Enable export buttons
          exportButton.disabled = false;
          copyButton.disabled = false;
        } else {
          statusDiv.textContent = 'No profiles found on this page';
          resultsDiv.innerHTML = '<p class="instructions">No LinkedIn profiles were found on the current page.</p>';
          
          // Hide select controls
          selectControls.classList.add('hidden');
          
          // Disable export buttons
          exportButton.disabled = true;
          copyButton.disabled = true;
        }
      });
    });
  }
  
  /**
   * Combines profiles from multiple pages with duplicate detection
   * Ensures profile data is properly merged and selection state is preserved
   * 
   * @param {Array} existingProfiles - Profiles already stored
   * @param {Array} newProfiles - New profiles to add
   * @return {Array} Combined profiles with duplicates removed
   */
  function combineProfiles(existingProfiles, newProfiles) {
    console.log(`combineProfiles: Combining ${existingProfiles?.length || 0} existing profiles with ${newProfiles?.length || 0} new profiles`);
    
    // Handle empty arrays
    if (!existingProfiles || existingProfiles.length === 0) {
      console.log(`combineProfiles: No existing profiles, returning just new profiles`);
      return newProfiles || [];
    }
    
    if (!newProfiles || newProfiles.length === 0) {
      console.log(`combineProfiles: No new profiles, returning just existing profiles`);
      return existingProfiles;
    }
    
    // Create a map for faster lookups
    const profileMap = new Map();
    
    // Add existing profiles to map first
    existingProfiles.forEach(profile => {
      if (profile && profile.url) {
        profileMap.set(profile.url, { ...profile });
      }
    });
    
    // Process new profiles, either adding or updating existing ones
    let updatedCount = 0;
    let newCount = 0;
    
    newProfiles.forEach(newProfile => {
      if (!newProfile || !newProfile.url) return;
      
      const existingProfile = profileMap.get(newProfile.url);
      
      if (existingProfile) {
        // Update existing profile with any new information
        // Keep selection state from existing profile if it exists
        profileMap.set(newProfile.url, {
          ...existingProfile,
          name: newProfile.name || existingProfile.name,
          title: newProfile.title || existingProfile.title,
          imageUrl: newProfile.imageUrl || existingProfile.imageUrl,
          selected: existingProfile.selected === true // Preserve selection status
        });
        updatedCount++;
      } else {
        // Add new profile
        profileMap.set(newProfile.url, { ...newProfile });
        newCount++;
      }
    });
    
    // Convert map back to array
    const result = Array.from(profileMap.values());
    console.log(`combineProfiles: Updated ${updatedCount} profiles, added ${newCount} new profiles, total: ${result.length} profiles`);
    
    return result;
  }
  
  /**
   * Saves extracted profiles to Chrome storage, preserving selection state
   * This is a critical function that ensures profile data persists between page
   * navigations and popup sessions.
   */
  function saveProfilesToStorage() {
    // Validate required data
    if (!currentSearchId) {
      console.error("Cannot save profiles: missing search ID");
      return;
    }
    
    console.log(`saveProfilesToStorage: Starting with search ID ${currentSearchId}`);
    console.log(`saveProfilesToStorage: Initial state - extractedData: ${extractedData?.length || 0}, storedProfiles: ${storedProfiles?.length || 0}`);
    
    // Don't require extractedData to exist - we might just be updating selection state
    // for existing profiles
    
    // Start with current extracted data, or an empty array if none exists
    let profilesToSave = extractedData || [];
    
    // If we're in append mode and have stored profiles, merge them with new profiles
    if (isAppendMode && storedProfiles && storedProfiles.length > 0) {
      console.log(`saveProfilesToStorage: Combining ${profilesToSave.length} profiles with ${storedProfiles.length} stored profiles`);
      // Combine stored profiles with newly extracted profiles
      profilesToSave = combineProfiles(storedProfiles, profilesToSave);
      console.log(`saveProfilesToStorage: After combining, we have ${profilesToSave.length} profiles`);
    }
    
    // Get current UI checkbox state
    const selectedUrls = new Set();
    document.querySelectorAll('.profile-checkbox:checked').forEach(checkbox => {
      const url = checkbox.getAttribute('data-url');
      if (url) {
        selectedUrls.add(url);
      }
    });
    console.log(`saveProfilesToStorage: Found ${selectedUrls.size} checked checkboxes`);
    
    // Update the selection state in the profiles
    profilesToSave = profilesToSave.map(profile => {
      return {
        ...profile,
        // Use the checkbox state to determine selection
        selected: selectedUrls.has(profile.url)
      };
    });
    
    // Update the profiles for this specific search
    allStoredSearches[currentSearchId] = {
      ...allStoredSearches[currentSearchId],
      profiles: profilesToSave,
      lastAccessed: new Date().toISOString()
    };
    
    // Additional logging to track what's being stored
    console.log(`saveProfilesToStorage: About to save ${profilesToSave.length} profiles for search ID ${currentSearchId}`);
    console.log(`saveProfilesToStorage: allStoredSearches before save:`, Object.keys(allStoredSearches).map(key => ({
      id: key,
      profileCount: allStoredSearches[key]?.profiles?.length || 0
    })));
    
    // Save all searches to Chrome storage
    chrome.storage.local.set({
      linkedInSearches: allStoredSearches,
      appendMode: isAppendMode
    }, function() {
      console.log(`Saved ${profilesToSave.length} profiles for search ${currentSearchId}`);
      // Update our local copy of stored profiles to maintain consistency
      storedProfiles = profilesToSave;
      
      // Verify what we've stored
      console.log(`saveProfilesToStorage: Updated storedProfiles to ${storedProfiles.length} profiles`);
      console.log(`saveProfilesToStorage: allStoredSearches after save:`, Object.keys(allStoredSearches).map(key => ({
        id: key,
        profileCount: allStoredSearches[key]?.profiles?.length || 0
      })));
      
      // Show a mini toast notification if we have auto-saved profiles during page navigation
      // Only show this if we're not responding to a manual checkbox action
      if (!document.activeElement || !document.activeElement.classList.contains('profile-checkbox')) {
        showMiniToast(`Auto-saved ${profilesToSave.length} profiles`);
      }
    });
  }
  
  // Function to clear stored profiles
  function clearStoredProfiles() {
    if (currentSearchId && allStoredSearches[currentSearchId]) {
      // Clear only profiles for the current search
      allStoredSearches[currentSearchId].profiles = [];
      
      // Save the updated searches
      chrome.storage.local.set({ linkedInSearches: allStoredSearches }, function() {
        storedProfiles = [];
        showToast('Stored profiles for this search cleared');
        statusDiv.textContent = 'All stored profiles for this search have been cleared';
      });
    } else {
      // Clear all stored profiles for all searches
      chrome.storage.local.remove(['linkedInSearches'], function() {
        allStoredSearches = {};
        storedProfiles = [];
        showToast('All stored profiles cleared');
        statusDiv.textContent = 'All stored profiles for all searches have been cleared';
      });
    }
  }
  
  // Function to clear ALL stored profiles (across all searches)
  function clearAllStoredProfiles() {
    chrome.storage.local.remove(['linkedInSearches'], function() {
      allStoredSearches = {};
      storedProfiles = [];
      showToast('All stored profiles cleared');
      statusDiv.textContent = 'All stored profiles for all searches have been cleared';
    });
  }

  // Extract data automatically when popup opens
  loadStoredProfiles();
  extractLinkedInData();
  
  // Handler for refresh button
  refreshButton.addEventListener('click', extractLinkedInData);
  
  // Create a clear button to remove stored profiles from current search
  const clearButton = document.createElement('button');
  clearButton.id = 'clear-data';
  clearButton.textContent = 'Clear This Search';
  clearButton.classList.add('secondary-button');
  clearButton.addEventListener('click', clearStoredProfiles);
  
  // Create a clear all button to remove profiles from all searches
  const clearAllButton = document.createElement('button');
  clearAllButton.id = 'clear-all-data';
  clearAllButton.textContent = 'Clear All Searches';
  clearAllButton.classList.add('secondary-button', 'danger-button');
  clearAllButton.addEventListener('click', clearAllStoredProfiles);
  
  // Create an append mode checkbox
  const appendModeContainer = document.createElement('div');
  appendModeContainer.className = 'option-container';
  
  const appendCheckbox = document.createElement('input');
  appendCheckbox.type = 'checkbox';
  appendCheckbox.id = 'append-mode';
  appendCheckbox.checked = isAppendMode;
  
  const appendLabel = document.createElement('label');
  appendLabel.htmlFor = 'append-mode';
  appendLabel.textContent = 'Append Mode (Combine data across pages)';
  
  appendModeContainer.appendChild(appendCheckbox);
  appendModeContainer.appendChild(appendLabel);
  
  // Add the new elements to the page
  const optionsContainer = document.querySelector('.options-container') || document.body;
  optionsContainer.appendChild(appendModeContainer);
  
  // Create a button container for our clear buttons
  const clearButtonsContainer = document.createElement('div');
  clearButtonsContainer.className = 'clear-buttons-container';
  clearButtonsContainer.appendChild(clearButton);
  clearButtonsContainer.appendChild(clearAllButton);
  
  optionsContainer.appendChild(clearButtonsContainer);
  
  // Handler for append mode checkbox
  appendCheckbox.addEventListener('change', function() {
    isAppendMode = this.checked;
    chrome.storage.local.set({ appendMode: isAppendMode });
    
    if (isAppendMode && storedProfiles.length > 0) {
      showToast(`Append mode enabled (${storedProfiles.length} stored profiles)`);
    } else if (!isAppendMode) {
      showToast('Append mode disabled');
    }
  });
  
  // Handler for select all checkbox
  selectAllCheckbox.addEventListener('change', function() {
    const checkboxes = document.querySelectorAll('.profile-checkbox');
    const isChecked = this.checked;
    
    checkboxes.forEach(checkbox => {
      checkbox.checked = isChecked;
      
      const profileId = checkbox.getAttribute('data-id');
      if (isChecked) {
        selectedProfiles.add(profileId);
      } else {
        selectedProfiles.delete(profileId);
      }
    });
    
    updateExportButtonsState();
  });
  
  // Handler for deselect all button
  deselectAllButton.addEventListener('click', function() {
    const checkboxes = document.querySelectorAll('.profile-checkbox');
    
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
    
    selectAllCheckbox.checked = false;
    selectedProfiles.clear();
    
    updateExportButtonsState();
  });
  
  /**
   * Handles the export button click event
   * Exports ALL stored profiles to CSV, with a selection indicator
   */
  exportButton.addEventListener('click', function() {
    // Save to storage before exporting
    saveProfilesToStorage();
    
    // Get ALL profiles for this search
    const allProfiles = getAllProfilesForCurrentSearch();
    
    if (allProfiles.length === 0) {
      showToast('No profiles found to export');
      return;
    }
    
    // Convert data to CSV, including selection status
    const csvContent = convertToCSV(allProfiles);
    
    // Create a download
    const blob = new Blob([csvContent], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    chrome.downloads.download({
      url: url,
      filename: `linkedin-data-${timestamp}.csv`,
      saveAs: true
    }, function() {
      showToast('CSV file downloaded');
    });
  });
  
  /**
   * Handles the copy to clipboard button click event
   * Copies ALL stored profiles to clipboard, with a selection indicator
   */
  copyButton.addEventListener('click', function() {
    // Get ALL profiles for this search
    const allProfiles = getAllProfilesForCurrentSearch();
    
    if (allProfiles.length === 0) {
      showToast('No profiles found to copy');
      return;
    }
    
    // Convert data to CSV, including selection status
    const csvContent = convertToCSV(allProfiles);
    
    // Copy to clipboard
    navigator.clipboard.writeText(csvContent).then(function() {
      showToast('Copied to clipboard');
    }, function(err) {
      console.error('Could not copy text: ', err);
      showToast('Failed to copy to clipboard');
    });
  });
  
  /**
   * Helper to display results with checkboxes
   * Handles displaying both current page profiles and stored profiles
   */
  function displayResultsWithCheckboxes(data) {
    console.log(`displayResultsWithCheckboxes: Starting with ${data.length} profiles`);
    
    if (data.length === 0) {
      resultsDiv.innerHTML = '<p class="instructions">No results found</p>';
      return;
    }
    
    let html = '';
    
    // If in append mode, show stored profiles + current profiles
    const displayData = isAppendMode && storedProfiles.length > 0 ? 
      combineProfiles(storedProfiles, data) : data;
    
    console.log(`displayResultsWithCheckboxes: displayData contains ${displayData.length} profiles (combined: ${isAppendMode && storedProfiles.length > 0})`);
    
    // Log URLs of first few profiles to help debugging
    if (displayData.length > 0) {
      console.log(`displayResultsWithCheckboxes: First few profile URLs:`, 
        displayData.slice(0, Math.min(5, displayData.length)).map(p => p.url));
    }
    
    // Show a summary at the top with search context and combined data info
    if (currentSearchId) {
      let summaryText = '';
      
      // Format the search name for display - use the human-readable connection name if available
      let searchDisplayName = 'Current search';
      if (allStoredSearches[currentSearchId]) {
        const searchData = allStoredSearches[currentSearchId];
        
        // Build the display name based on available information
        if (searchData.connectionName) {
          // This is a "Connections of X" search with a proper name
          searchDisplayName = searchData.connectionName;
        } else if (searchData.connectionIdentifier) {
          // Fallback to the identifier if name is not available
          searchDisplayName = `Connections of ${searchData.connectionIdentifier.split('_')[0]}`;
        } else if (searchData.searchType) {
          // This is a general search
          searchDisplayName = `${searchData.searchType} Search`;
          
          // Try to extract keyword if available
          if (currentSearchId.includes('_kw_')) {
            const keyword = currentSearchId.split('_kw_')[1].split('_')[0];
            if (keyword) {
              searchDisplayName += `: "${decodeURIComponent(keyword)}"`;
            }
          }
        }
      }
      
      if (isAppendMode && storedProfiles.length > 0 && data.length > 0) {
        summaryText = `Showing ${displayData.length} total profiles (${data.length} from current page + ${storedProfiles.length} from previous pages)`;
      } else {
        summaryText = `Showing ${data.length} profiles from current page`;
      }
      
      html += `
      <div class="summary-banner">
        <div class="search-context">Mutual Contacts of ${searchDisplayName}</div>
        <div class="summary-text">
          ${summaryText}
        </div>
      </div>
      `;
    }
    
    // Separate current and stored profiles
    const currentPageProfiles = data;
    const storedOnlyProfiles = isAppendMode ? 
      displayData.filter(p => !currentPageProfiles.some(cp => cp.url === p.url)) : [];
    
    // Display current page profiles first
    if (currentPageProfiles.length > 0) {
      html += `
        <div class="section-header">
          <h3>Current Page Profiles</h3>
        </div>
      `;
      
      currentPageProfiles.forEach((profile, index) => {
        const profileId = `profile-current-${index}`;
        // Check if this profile exists in stored profiles and has selected status
        const storedVersion = storedProfiles.find(p => p.url === profile.url);
        const isSelected = profile.selected || (storedVersion && storedVersion.selected);
        
        // Extract image URL from profile if available
        const imageUrl = profile.imageUrl || '/icons/icon48.png'; // Default image as fallback
        
        html += `
        <div class="profile-item">
          <div class="checkbox-container">
            <input type="checkbox" id="${profileId}" class="profile-checkbox" data-id="${profileId}" data-url="${profile.url}" ${isSelected ? 'checked' : ''}>
          </div>
          <div class="profile-image">
            <img src="${imageUrl}" alt="${escapeHtml(profile.name)}" class="profile-avatar">
          </div>
          <div class="profile-info">
            <div class="profile-name">${escapeHtml(profile.name)}</div>
            <div class="profile-title">${escapeHtml(profile.title)}</div>
            <a href="${profile.url}" class="profile-url" target="_blank" title="${escapeHtml(profile.url)}">${escapeHtml(profile.url)}</a>
          </div>
        </div>
        `;
      });
    }
    
    // Display stored profiles in a collapsible section
    if (storedOnlyProfiles.length > 0) {
      html += `
        <div class="stored-section">
          <div class="section-header collapsible" id="stored-profiles-header">
            <h3>Previously Stored Profiles (${storedOnlyProfiles.length})</h3>
            <span class="collapse-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="plus-icon">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </span>
          </div>
          <div class="stored-profiles-container collapsed" id="stored-profiles-container">
      `;
      
      storedOnlyProfiles.forEach((profile, index) => {
        const profileId = `profile-stored-${index}`;
        const isSelected = profile.selected;
        
        // Extract image URL from profile if available
        const imageUrl = profile.imageUrl || '/icons/icon48.png'; // Default image as fallback
        
        html += `
        <div class="profile-item stored-profile">
          <div class="checkbox-container">
            <input type="checkbox" id="${profileId}" class="profile-checkbox" data-id="${profileId}" data-url="${profile.url}" ${isSelected ? 'checked' : ''}>
          </div>
          <div class="profile-image">
            <img src="${imageUrl}" alt="${escapeHtml(profile.name)}" class="profile-avatar">
          </div>
          <div class="profile-info">
            <div class="profile-name">${escapeHtml(profile.name)}</div>
            <div class="profile-title">${escapeHtml(profile.title)}</div>
            <a href="${profile.url}" class="profile-url" target="_blank" title="${escapeHtml(profile.url)}">${escapeHtml(profile.url)}</a>
            <div class="stored-badge">Previously stored</div>
          </div>
        </div>
        `;
      });
      
      html += `
          </div>
        </div>
      `;
    }
    
    resultsDiv.innerHTML = html;
    
    // Add event listeners to checkboxes
    document.querySelectorAll('.profile-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', function() {
        const profileId = this.getAttribute('data-id');
        const profileUrl = this.getAttribute('data-url');
        
        if (this.checked) {
          selectedProfiles.add(profileId);
        } else {
          selectedProfiles.delete(profileId);
          
          // Uncheck "Select All" if any individual item is unchecked
          selectAllCheckbox.checked = false;
        }
        
        // Mark profile as selected/unselected in the data
        const allProfiles = combineProfiles(storedProfiles, extractedData);
        const profileToUpdate = allProfiles.find(p => p.url === profileUrl);
        if (profileToUpdate) {
          profileToUpdate.selected = this.checked;
        }
        
        // Save the selection status immediately
        saveProfilesToStorage();
        
        updateExportButtonsState();
      });
    });
    
    // Add event listener for collapsible section
    const storedHeader = document.getElementById('stored-profiles-header');
    const storedContainer = document.getElementById('stored-profiles-container');
    
    if (storedHeader && storedContainer) {
      storedHeader.addEventListener('click', function() {
        storedContainer.classList.toggle('collapsed');
        const collapseIcon = this.querySelector('.collapse-icon');
        if (collapseIcon) {
          // Replace the icon based on collapsed state
          if (storedContainer.classList.contains('collapsed')) {
            collapseIcon.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="plus-icon">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            `;
          } else {
            collapseIcon.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="minus-icon">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            `;
          }
        }
      });
    }
    
    // If we've combined profiles, save them
    if (isAppendMode && storedProfiles.length > 0 && data.length > 0) {
      saveProfilesToStorage();
    }
  }
  
  // Get the data for selected profiles
  function getSelectedProfilesData() {
    if (selectedProfiles.size === 0) {
      // Check if any profiles are marked as selected in the data
      const dataSource = isAppendMode && storedProfiles.length > 0 ? 
        combineProfiles(storedProfiles, extractedData) : extractedData;
      
      const selectedData = dataSource.filter(profile => profile.selected);
      if (selectedData.length > 0) {
        return selectedData;
      }
      
      return [];
    }
    
    // Use combined data if available, otherwise just extracted data
    const dataSource = isAppendMode && storedProfiles.length > 0 ? 
      combineProfiles(storedProfiles, extractedData) : extractedData;
    
    // Get the URLs of the selected profiles
    const selectedUrls = new Set();
    document.querySelectorAll('.profile-checkbox:checked').forEach(checkbox => {
      const url = checkbox.getAttribute('data-url');
      if (url) {
        selectedUrls.add(url);
      }
    });
    
    return dataSource.filter(profile => selectedUrls.has(profile.url));
  }
  
  /**
   * Updates the export/copy button states
   * Enables buttons if there are any profiles to export (regardless of selection)
   */
  function updateExportButtonsState() {
    // Get all profiles for the current search
    const allProfiles = getAllProfilesForCurrentSearch();
    
    // Enable buttons if there are any profiles to export
    const hasProfiles = allProfiles.length > 0;
    
    // Enable export buttons if there are any profiles
    exportButton.disabled = !hasProfiles;
    copyButton.disabled = !hasProfiles;
  }
  
  /**
   * Gets all profiles for the current search, combining stored and extracted data
   * 
   * @return {Array} All profiles for the current search
   */
  function getAllProfilesForCurrentSearch() {
    if (!currentSearchId) return [];
    
    // Get profiles from storage for this search
    const storedProfilesForSearch = allStoredSearches[currentSearchId]?.profiles || [];
    
    console.log(`getAllProfilesForCurrentSearch: Found ${storedProfilesForSearch.length} stored profiles and ${extractedData.length} extracted profiles`);
    
    // Combine with any newly extracted profiles
    const combinedProfiles = combineProfiles(storedProfilesForSearch, extractedData);
    
    console.log(`getAllProfilesForCurrentSearch: Returning ${combinedProfiles.length} combined profiles`);
    
    return combinedProfiles;
  }
  
  /**
   * Converts profile data to CSV format
   * Includes selection status indicator in the output
   * 
   * @param {Array} data - Array of profile objects to convert
   * @return {string} CSV formatted data
   */
  function convertToCSV(data) {
    const headers = ['Selected', 'Name', 'LinkedIn URL', 'Title'];
    const rows = data.map(row => [
      // Include selection status as 'Yes'/'No'
      `"${row.selected ? 'Yes' : 'No'}"`,
      `"${(row.name || '').replace(/"/g, '""')}"`,
      `"${(row.url || '').replace(/"/g, '""')}"`,
      `"${(row.title || '').replace(/"/g, '""')}"`
    ]);
    
    return [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
  }
  
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
});