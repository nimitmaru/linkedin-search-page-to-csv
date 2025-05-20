/**
 * UI.js - UI rendering for the LinkedIn Chrome Extension
 */

import { escapeHtml } from './utils.js';
import { state, saveProfilesToStorage, getAllProfilesForCurrentSearch } from './storage.js';
import { combineProfiles } from './profiles.js';

/**
 * Updates the partner info display
 */
function updatePartnerInfoDisplay() {
  const partnerNameDiv = document.getElementById('partner-name');
  const partnerInfoContainer = document.getElementById('partner-info-container');
  
  if (!partnerNameDiv || !partnerInfoContainer) return;
  
  if (state.partnerInfo.linkedInURL) {
    partnerNameDiv.textContent = state.partnerInfo.fullName || "VC Partner";
    partnerInfoContainer.classList.remove('hidden');
  } else {
    partnerNameDiv.textContent = "No VC Partner Selected";
    partnerInfoContainer.classList.add('hidden');
  }
}

/**
 * Helper to display results with pill selectors for closeness index
 * Handles displaying both current page profiles and stored profiles
 * 
 * @param {Array} data - Array of profile data to display
 */
function displayResults(data) {
  const resultsDiv = document.getElementById('results');
  if (!resultsDiv) return;
  
  console.log(`displayResults: Starting with ${data.length} profiles`);
  
  if (data.length === 0) {
    resultsDiv.innerHTML = '<p class="instructions">No results found</p>';
    return;
  }
  
  let html = '';
  
  // If in append mode, show stored profiles + current profiles
  const displayData = state.isAppendMode && state.storedProfiles.length > 0 ? 
    combineProfiles(state.storedProfiles, data) : data;
  
  console.log(`displayResults: displayData contains ${displayData.length} profiles (combined: ${state.isAppendMode && state.storedProfiles.length > 0})`);
  
  // Log URLs of first few profiles to help debugging
  if (displayData.length > 0) {
    console.log(`displayResults: First few profile URLs:`, 
      displayData.slice(0, Math.min(5, displayData.length)).map(p => p.url));
  }
  
  // Show a summary at the top with search context and combined data info
  if (state.currentSearchId) {
    let summaryText = '';
    
    // Format the search name for display - use the human-readable connection name if available
    let searchDisplayName = 'Current search';
    if (state.allStoredSearches[state.currentSearchId]) {
      const searchData = state.allStoredSearches[state.currentSearchId];
      
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
        if (state.currentSearchId.includes('_kw_')) {
          const keyword = state.currentSearchId.split('_kw_')[1].split('_')[0];
          if (keyword) {
            searchDisplayName += `: "${decodeURIComponent(keyword)}"`;
          }
        }
      }
    }
    
    if (state.isAppendMode && state.storedProfiles.length > 0 && data.length > 0) {
      summaryText = `Showing ${displayData.length} total profiles (${data.length} from current page + ${state.storedProfiles.length} from previous pages)`;
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
    
    // Show VC partner information
    const partnerInfoContainer = document.getElementById('partner-info-container');
    if (partnerInfoContainer) {
      partnerInfoContainer.classList.remove('hidden');
    }
  }
  
  // Separate current and stored profiles
  const currentPageProfiles = data;
  const storedOnlyProfiles = state.isAppendMode ? 
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
      // Check if this profile exists in stored profiles
      const storedVersion = state.storedProfiles.find(p => p.url === profile.url);
      // Get closeness index, default to 1
      const closenessIndex = profile.closenessIndex !== undefined ? profile.closenessIndex : 
                            (storedVersion && storedVersion.closenessIndex !== undefined ? storedVersion.closenessIndex : 1);
      
      // Extract image URL from profile if available
      const imageUrl = profile.imageUrl || '/icons/icon48.png'; // Default image as fallback
      
      html += `
      <div class="profile-item">
        <div class="profile-actions">
          <div class="pill-selector pill-value-${closenessIndex}" data-url="${profile.url}" data-value="${closenessIndex}"></div>
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
      // Get closeness index, default to 1
      const closenessIndex = profile.closenessIndex !== undefined ? profile.closenessIndex : 1;
      
      // Extract image URL from profile if available
      const imageUrl = profile.imageUrl || '/icons/icon48.png'; // Default image as fallback
      
      html += `
      <div class="profile-item stored-profile">
        <div class="profile-actions">
          <div class="pill-selector pill-value-${closenessIndex}" data-url="${profile.url}" data-value="${closenessIndex}"></div>
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
  
  // Add event listeners to pill selectors
  document.querySelectorAll('.pill-selector').forEach(pill => {
    pill.addEventListener('click', function() {
      const profileUrl = this.getAttribute('data-url');
      let currentValue = parseInt(this.getAttribute('data-value'));
      
      // Cycle through values: 0, 1, 2, 3, then back to 0
      currentValue = (currentValue + 1) % 4;
      
      // Update the pill display
      this.classList.remove('pill-value-0', 'pill-value-1', 'pill-value-2', 'pill-value-3');
      this.classList.add(`pill-value-${currentValue}`);
      this.setAttribute('data-value', currentValue);
      
      // Update the profile data
      const allProfiles = combineProfiles(state.storedProfiles, state.extractedData);
      const profileToUpdate = allProfiles.find(p => p.url === profileUrl);
      if (profileToUpdate) {
        profileToUpdate.closenessIndex = currentValue;
      }
      
      // Save the updated closeness index
      saveProfilesToStorage();
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
  if (state.isAppendMode && state.storedProfiles.length > 0 && data.length > 0) {
    saveProfilesToStorage();
  }
}

/**
 * Updates the export/copy button states
 * Enables buttons if there are any profiles to export
 */
function updateExportButtonsState() {
  const exportButton = document.getElementById('export');
  const copyButton = document.getElementById('copy-clipboard');
  const exportApiButton = document.getElementById('export-api');
  
  if (!exportButton || !copyButton || !exportApiButton) return;
  
  // Get profiles from storage
  const allProfiles = getAllProfilesForCurrentSearch();
  
  // Enable buttons if there are any profiles to export
  const hasProfiles = allProfiles.length > 0;
  
  // Enable export buttons if there are any profiles
  exportButton.disabled = !hasProfiles;
  copyButton.disabled = !hasProfiles;
  exportApiButton.disabled = !hasProfiles || !state.partnerInfo.linkedInURL;
}

// Export UI rendering functions
export {
  updatePartnerInfoDisplay,
  displayResults,
  updateExportButtonsState
};