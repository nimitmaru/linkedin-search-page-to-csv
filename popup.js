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
  
  // Load previously stored data on popup open
  function loadStoredProfiles() {
    chrome.storage.local.get(['linkedInSearches', 'appendMode'], function(result) {
      // Get the current active tab to determine the search ID
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const activeTab = tabs[0];
        
        // Update append mode checkbox if available
        if (typeof result.appendMode !== 'undefined') {
          isAppendMode = result.appendMode;
          const appendCheckbox = document.getElementById('append-mode');
          if (appendCheckbox) {
            appendCheckbox.checked = isAppendMode;
          }
        }
        
        // If no searches are stored yet, create an empty object
        if (!result.linkedInSearches) {
          allStoredSearches = {};
          return;
        }
        
        // Store all searches
        allStoredSearches = result.linkedInSearches;
        
        // Execute the content script to get the current search ID
        chrome.tabs.sendMessage(activeTab.id, {action: "extract"}, function(response) {
          if (chrome.runtime.lastError || !response || !response.searchInfo) {
            console.error("Error getting search info:", chrome.runtime.lastError);
            return;
          }
          
          // Set the current search ID
          currentSearchId = response.searchInfo.searchId;
          
          // Load profiles specific to this search
          if (allStoredSearches[currentSearchId]) {
            storedProfiles = allStoredSearches[currentSearchId].profiles || [];
            
            // Update status to show stored profiles for this search
            if (storedProfiles.length > 0) {
              statusDiv.textContent = `${storedProfiles.length} profiles in memory from previous pages of this search`;
            }
          } else {
            // No stored profiles for this search
            storedProfiles = [];
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
              const combinedProfiles = combineProfiles(storedProfiles, extractedData);
              statusDiv.textContent += ` | Total: ${combinedProfiles.length} profiles`;
            }
          } else {
            statusDiv.textContent = `Found ${extractedData.length} profiles`;
          }
          
          // Reset selection state
          selectedProfiles.clear();
          
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
  
  // Function to combine profiles from multiple pages with duplicate detection
  function combineProfiles(existingProfiles, newProfiles) {
    if (!existingProfiles || existingProfiles.length === 0) {
      return newProfiles;
    }
    
    // Create a Set of URLs to avoid duplicates
    const existingUrls = new Set(existingProfiles.map(profile => profile.url));
    
    // Add only profiles that we don't already have
    const uniqueNewProfiles = newProfiles.filter(profile => !existingUrls.has(profile.url));
    
    // Return combined array
    return [...existingProfiles, ...uniqueNewProfiles];
  }
  
  // Function to save extracted profiles to storage
  function saveProfilesToStorage() {
    if (!extractedData || extractedData.length === 0 || !currentSearchId) return;
    
    let profilesToSave = extractedData;
    
    // If in append mode, combine with existing profiles for this search
    if (isAppendMode && storedProfiles.length > 0) {
      profilesToSave = combineProfiles(storedProfiles, extractedData);
    }
    
    // Track the selected profiles and add a selected: true property to them
    const selectedProfilesData = getSelectedProfilesData();
    
    // Mark profiles as selected
    profilesToSave = profilesToSave.map(profile => {
      // Check if this profile is selected
      const isSelected = selectedProfilesData.some(selectedProfile => 
        selectedProfile.url === profile.url
      );
      
      return {
        ...profile,
        selected: isSelected
      };
    });
    
    // Update the profiles for this specific search
    allStoredSearches[currentSearchId] = {
      ...allStoredSearches[currentSearchId],
      profiles: profilesToSave,
      lastAccessed: new Date().toISOString()
    };
    
    // Save all searches to storage
    chrome.storage.local.set({
      linkedInSearches: allStoredSearches,
      appendMode: isAppendMode
    }, function() {
      console.log(`Saved ${profilesToSave.length} profiles for search ${currentSearchId}`);
      storedProfiles = profilesToSave;
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
  
  // Handler for export button
  exportButton.addEventListener('click', function() {
    // Save to storage before exporting
    saveProfilesToStorage();
    const selectedData = getSelectedProfilesData();
    
    if (selectedData.length === 0) {
      showToast('Please select at least one profile');
      return;
    }
    
    // Convert data to CSV
    const csvContent = convertToCSV(selectedData);
    
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
  
  // Handler for copy to clipboard button
  copyButton.addEventListener('click', function() {
    const selectedData = getSelectedProfilesData();
    
    if (selectedData.length === 0) {
      showToast('Please select at least one profile');
      return;
    }
    
    // Convert data to CSV
    const csvContent = convertToCSV(selectedData);
    
    // Copy to clipboard
    navigator.clipboard.writeText(csvContent).then(function() {
      showToast('Copied to clipboard');
    }, function(err) {
      console.error('Could not copy text: ', err);
      showToast('Failed to copy to clipboard');
    });
  });
  
  // Helper to display results with checkboxes
  function displayResultsWithCheckboxes(data) {
    if (data.length === 0) {
      resultsDiv.innerHTML = '<p class="instructions">No results found</p>';
      return;
    }
    
    let html = '';
    
    // If in append mode, show stored profiles + current profiles
    const displayData = isAppendMode && storedProfiles.length > 0 ? 
      combineProfiles(storedProfiles, data) : data;
    
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
  
  // Update export buttons state
  function updateExportButtonsState() {
    // Check both the selectedProfiles set and profiles with selected: true property
    let hasSelectedProfiles = selectedProfiles.size > 0;
    
    if (!hasSelectedProfiles) {
      // Check if any profiles are marked as selected in the data
      const dataSource = isAppendMode && storedProfiles.length > 0 ? 
        combineProfiles(storedProfiles, extractedData) : extractedData;
      
      hasSelectedProfiles = dataSource.some(profile => profile.selected);
    }
    
    exportButton.disabled = !hasSelectedProfiles;
    copyButton.disabled = !hasSelectedProfiles;
  }
  
  // Helper to convert data to CSV
  function convertToCSV(data) {
    const headers = ['Name', 'LinkedIn URL', 'Title'];
    const rows = data.map(row => [
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
});