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
  
  // Load previously stored data on popup open
  function loadStoredProfiles() {
    chrome.storage.local.get(['linkedInProfiles', 'appendMode'], function(result) {
      if (result.linkedInProfiles) {
        storedProfiles = result.linkedInProfiles;
        
        // Update append mode checkbox if available
        if (typeof result.appendMode !== 'undefined') {
          isAppendMode = result.appendMode;
          const appendCheckbox = document.getElementById('append-mode');
          if (appendCheckbox) {
            appendCheckbox.checked = isAppendMode;
          }
        }
        
        // Update status to show stored profiles
        if (storedProfiles.length > 0) {
          statusDiv.textContent = `${storedProfiles.length} profiles in memory from previous pages`;
        }
      }
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
          
          // Handle pagination info if available
          if (response.pagination) {
            const { currentPage, totalPages } = response.pagination;
            
            // Update status text with pagination info
            statusDiv.textContent = `Found ${extractedData.length} profiles (Page ${currentPage} of ${totalPages})`;
            
            // If in append mode and we have stored profiles, combine them
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
    if (!extractedData || extractedData.length === 0) return;
    
    let profilesToSave = extractedData;
    
    // If in append mode, combine with existing profiles
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
    
    // Save to storage
    chrome.storage.local.set({
      linkedInProfiles: profilesToSave,
      appendMode: isAppendMode
    }, function() {
      console.log('Profiles saved to storage:', profilesToSave.length);
      storedProfiles = profilesToSave;
    });
  }
  
  // Function to clear stored profiles
  function clearStoredProfiles() {
    chrome.storage.local.remove(['linkedInProfiles'], function() {
      storedProfiles = [];
      showToast('Stored profiles cleared');
      statusDiv.textContent = 'All stored profiles have been cleared';
    });
  }

  // Extract data automatically when popup opens
  loadStoredProfiles();
  extractLinkedInData();
  
  // Handler for refresh button
  refreshButton.addEventListener('click', extractLinkedInData);
  
  // Create a clear button to remove all stored profiles
  const clearButton = document.createElement('button');
  clearButton.id = 'clear-data';
  clearButton.textContent = 'Clear Stored Data';
  clearButton.classList.add('secondary-button');
  clearButton.addEventListener('click', clearStoredProfiles);
  
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
  optionsContainer.appendChild(clearButton);
  
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
    
    // Show a summary at the top if we have combined data
    if (isAppendMode && storedProfiles.length > 0 && data.length > 0) {
      html += `
      <div class="summary-banner">
        <div class="summary-text">
          Showing ${displayData.length} total profiles (${data.length} from current page + ${storedProfiles.length} from previous pages)
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
            <span class="collapse-icon">▼</span>
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
          collapseIcon.textContent = storedContainer.classList.contains('collapsed') ? '▼' : '▲';
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