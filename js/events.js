/**
 * Events.js - Event handlers for the LinkedIn Chrome Extension
 */

import { showToast } from './utils.js';
import { state, saveProfilesToStorage, updateAppendMode, updateDevMode, clearStoredProfiles, clearAllStoredProfiles } from './storage.js';
import { displayResults, updateExportButtonsState, updatePartnerInfoDisplay } from './ui.js';
import { convertToCSV } from './profiles.js';
import { exportDataToAPI, prepareAirtableData } from './api.js';

/**
 * Function to extract data from LinkedIn
 */
function extractLinkedInData() {
  const statusDiv = document.getElementById('status');
  const resultsDiv = document.getElementById('results');
  
  if (!statusDiv || !resultsDiv) return;
  
  statusDiv.textContent = 'Extracting data...';
  resultsDiv.innerHTML = `
    <div class="loading-indicator">
      <div class="spinner"></div>
      <p>Extracting LinkedIn profiles...</p>
    </div>
  `;
  console.log('extractedData before extraction: ', state.extractedData);
  
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
        state.extractedData = response.data;
        
        // Capture search information
        if (response.searchInfo) {
          state.currentSearchId = response.searchInfo.searchId;
          
          // If this is a new search we haven't seen before
          if (!state.allStoredSearches[state.currentSearchId]) {
            state.allStoredSearches[state.currentSearchId] = {
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
          if (!state.isAppendMode) {
            state.storedProfiles = [];
          } else {
            // In append mode, make sure we're using profiles from the current search
            console.log('currentSearchId: ', state.currentSearchId);
            console.log('allStoredSearches: ', state.allStoredSearches);
            state.storedProfiles = state.allStoredSearches[state.currentSearchId].profiles || [];
          }
        }
        
        // Handle pagination info if available
        if (response.pagination) {
          const { currentPage, totalPages } = response.pagination;
          
          // Update status text with pagination info
          statusDiv.textContent = `Found ${state.extractedData.length} profiles (Page ${currentPage} of ${totalPages})`;
          
          // If in append mode and we have stored profiles for this search, combine them
          if (state.isAppendMode && state.storedProfiles.length > 0) {
            console.log(`extractLinkedInData: Combining ${state.extractedData.length} current profiles with ${state.storedProfiles.length} stored profiles`);
            
            // Update status text with combined count
            const totalCount = state.extractedData.length + state.storedProfiles.length;
            statusDiv.textContent += ` | Total: ${totalCount} profiles`;
          }
        } else {
          statusDiv.textContent = `Found ${state.extractedData.length} profiles`;
        }
        
        // Always save profiles to storage right after extraction
        saveProfilesToStorage();
        
        // Display extracted data
        displayResults(state.extractedData);
        
        // Enable export buttons
        updateExportButtonsState();
      } else {
        statusDiv.textContent = 'No profiles found on this page';
        resultsDiv.innerHTML = '<p class="instructions">No LinkedIn profiles were found on the current page.</p>';
        
        // Disable export buttons
        const exportButton = document.getElementById('export');
        const copyButton = document.getElementById('copy-clipboard');
        const exportApiButton = document.getElementById('export-api');
        
        if (exportButton) exportButton.disabled = true;
        if (copyButton) copyButton.disabled = true;
        if (exportApiButton) exportApiButton.disabled = true;
      }
    });
  });
}

/**
 * Function to show the VC partner form
 */
function showPartnerForm() {
  const partnerInfoContainer = document.getElementById('partner-info-container');
  const partnerFormContainer = document.getElementById('partner-form-container');
  
  if (partnerInfoContainer && partnerFormContainer) {
    partnerInfoContainer.classList.add('hidden');
    partnerFormContainer.classList.remove('hidden');
  }
  
  // Check if we're on a LinkedIn profile page
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const activeTab = tabs[0];
    
    chrome.tabs.sendMessage(activeTab.id, {action: "checkProfilePage"}, function(response) {
      if (chrome.runtime.lastError) {
        console.error("Error checking profile page:", chrome.runtime.lastError);
        return;
      }
      
      const scrapeButton = document.getElementById('scrape-linkedin');
      if (scrapeButton) {
        // Only enable the scrape button if we're on a LinkedIn profile page
        if (response && response.isProfilePage) {
          scrapeButton.disabled = false;
        } else {
          scrapeButton.disabled = true;
        }
      }
    });
  });
}

/**
 * Function to clear VC partner information
 */
function clearPartnerInfo() {
  // Clear partner info in state
  state.partnerInfo = {
    linkedInURL: '',
    fullName: '',
    title: '',
    company: '',
    isOnLinkedInProfile: false
  };
  
  // Update the UI
  updatePartnerInfoDisplay();
  
  // Save empty partner info to storage
  import('./storage.js').then(module => {
    module.savePartnerInfoToStorage();
  });
  
  // Update export button state
  updateExportButtonsState();
}

/**
 * Function to scrape VC partner information from LinkedIn profile
 */
function scrapePartnerFromLinkedIn() {
  console.log('scrapePartnerFromLinkedIn');
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const activeTab = tabs[0];
    
    chrome.tabs.sendMessage(activeTab.id, {action: "scrapeVCPartner"}, function(response) {
      if (chrome.runtime.lastError) {
        console.error("Error scraping VC partner info:", chrome.runtime.lastError);
        return;
      }
      
      if (response && response.vcPartnerInfo) {
        const vcPartnerInfo = response.vcPartnerInfo;
        
        // Fill the form fields with the scraped information
        const fullNameInput = document.getElementById('partner-fullname');
        const companyInput = document.getElementById('partner-company');
        const titleInput = document.getElementById('partner-title');
        const linkedInURLInput = document.getElementById('partner-linkedin-url');
        
        if (fullNameInput) fullNameInput.value = vcPartnerInfo.fullName || '';
        if (companyInput) companyInput.value = vcPartnerInfo.company || '';
        if (titleInput) titleInput.value = vcPartnerInfo.title || '';
        if (linkedInURLInput) linkedInURLInput.value = vcPartnerInfo.linkedInURL || '';
      }
    });
  });
}

/**
 * Function to save VC partner information from the form
 */
function savePartnerInfo(event) {
  event.preventDefault();
  
  // Get values from form
  const fullNameInput = document.getElementById('partner-fullname');
  const companyInput = document.getElementById('partner-company');
  const titleInput = document.getElementById('partner-title');
  const linkedInURLInput = document.getElementById('partner-linkedin-url');
  
  // Validate required fields
  if (fullNameInput && !fullNameInput.value.trim()) {
    alert('Please enter the VC partner\'s full name.');
    return;
  }
  
  // Update state with form values
  state.partnerInfo = {
    fullName: fullNameInput ? fullNameInput.value.trim() : '',
    company: companyInput ? companyInput.value.trim() : '',
    title: titleInput ? titleInput.value.trim() : '',
    linkedInURL: linkedInURLInput ? linkedInURLInput.value.trim() : '',
    isOnLinkedInProfile: false
  };
  
  // Hide form and show partner info
  const partnerInfoContainer = document.getElementById('partner-info-container');
  const partnerFormContainer = document.getElementById('partner-form-container');
  
  if (partnerInfoContainer && partnerFormContainer) {
    partnerFormContainer.classList.add('hidden');
    partnerInfoContainer.classList.remove('hidden');
  }
  
  // Update the UI
  updatePartnerInfoDisplay();
  
  // Save partner info to storage
  import('./storage.js').then(module => {
    module.savePartnerInfoToStorage();
  });
  
  // Update export button state
  updateExportButtonsState();
}

/**
 * Function to cancel adding a VC partner
 */
function cancelPartnerForm() {
  const partnerInfoContainer = document.getElementById('partner-info-container');
  const partnerFormContainer = document.getElementById('partner-form-container');
  
  if (partnerInfoContainer && partnerFormContainer) {
    partnerFormContainer.classList.add('hidden');
    partnerInfoContainer.classList.remove('hidden');
  }
  
  // Reset form fields
  const partnerForm = document.getElementById('partner-form');
  if (partnerForm) {
    partnerForm.reset();
  }
}

/**
 * Function to handle exporting to CSV
 */
function handleExportCSV() {
  // Save to storage before exporting
  saveProfilesToStorage();
  
  // Get profiles from storage
  import('./storage.js').then(module => {
    const allProfiles = module.getAllProfilesForCurrentSearch();
    
    if (allProfiles.length === 0) {
      showToast('No profiles found to export');
      return;
    }
    
    // Ensure closeness index is properly set for all profiles
    const profilesWithCloseness = allProfiles.map(profile => ({
      ...profile,
      closenessIndex: profile.closenessIndex !== undefined ? profile.closenessIndex : 1
    }));
    
    // Convert data to CSV, including closeness index and VC Partner info
    const csvContent = convertToCSV(profilesWithCloseness, state.partnerInfo);
    
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
}

/**
 * Function to handle copying JSON to clipboard
 */
function handleCopyToClipboard() {
  // First check if partner info is available
  if (!state.partnerInfo.linkedInURL) {
    showToast('Please select a VC partner first');
    // Trigger partner info prompt
    document.dispatchEvent(new CustomEvent('promptPartnerInfo'));
    return;
  }

  // Get formatted data from shared function
  const airtableData = prepareAirtableData();
  
  if (!airtableData) {
    showToast('No profiles found to copy');
    return;
  }
  
  // Convert to formatted JSON string with indentation
  const jsonContent = JSON.stringify(airtableData, null, 2);
  
  // Copy to clipboard
  navigator.clipboard.writeText(jsonContent).then(function() {
    showToast('JSON copied to clipboard');
  }, function(err) {
    console.error('Could not copy text: ', err);
    showToast('Failed to copy to clipboard');
  });
}

/**
 * Set up event listeners for the UI
 */
function setupEventListeners() {
  // Get button elements
  const refreshButton = document.getElementById('refresh');
  const exportButton = document.getElementById('export');
  const exportApiButton = document.getElementById('export-api');
  const copyButton = document.getElementById('copy-clipboard');
  const addPartnerButton = document.getElementById('add-partner');
  const clearPartnerButton = document.getElementById('clear-partner');
  const scrapeLinkedInButton = document.getElementById('scrape-linkedin');
  const savePartnerButton = document.getElementById('save-partner');
  const cancelPartnerButton = document.getElementById('cancel-partner');
  
  // Set up button handlers
  if (refreshButton) {
    refreshButton.addEventListener('click', extractLinkedInData);
  }
  
  if (exportButton) {
    exportButton.addEventListener('click', handleExportCSV);
  }
  
  if (exportApiButton) {
    exportApiButton.addEventListener('click', exportDataToAPI);
  }
  
  if (copyButton) {
    copyButton.addEventListener('click', handleCopyToClipboard);
  }
  
  // VC Partner buttons
  if (addPartnerButton) {
    addPartnerButton.addEventListener('click', showPartnerForm);
  }
  
  if (clearPartnerButton) {
    clearPartnerButton.addEventListener('click', clearPartnerInfo);
  }
  
  if (scrapeLinkedInButton) {
    scrapeLinkedInButton.addEventListener('click', scrapePartnerFromLinkedIn);
  }
  
  // Partner form handling
  const partnerForm = document.getElementById('partner-form');
  if (partnerForm) {
    partnerForm.addEventListener('submit', savePartnerInfo);
  }
  
  if (savePartnerButton) {
    savePartnerButton.addEventListener('click', (event) => {
      event.preventDefault();
      savePartnerInfo(event);
    });
  }
  
  if (cancelPartnerButton) {
    cancelPartnerButton.addEventListener('click', cancelPartnerForm);
  }
  
  // Create and add UI elements dynamically
  
  // Create an append mode checkbox
  const appendModeContainer = document.createElement('div');
  appendModeContainer.className = 'option-container';
  
  const appendCheckbox = document.createElement('input');
  appendCheckbox.type = 'checkbox';
  appendCheckbox.id = 'append-mode';
  appendCheckbox.checked = state.isAppendMode;
  
  const appendLabel = document.createElement('label');
  appendLabel.htmlFor = 'append-mode';
  appendLabel.textContent = 'Append Mode (Combine data across pages)';
  
  appendModeContainer.appendChild(appendCheckbox);
  appendModeContainer.appendChild(appendLabel);
  
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
  
  // Add the elements to the page
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
    updateAppendMode(this.checked);
    
    if (state.isAppendMode && state.storedProfiles.length > 0) {
      showToast(`Append mode enabled (${state.storedProfiles.length} stored profiles)`);
    } else if (!state.isAppendMode) {
      showToast('Append mode disabled');
    }
  });
  
  // Handler for dev mode toggle
  const devModeToggle = document.getElementById('dev-mode');
  const devToggleSwitch = document.querySelector('.dev-toggle-switch');
  const devToggleContainer = document.querySelector('.dev-toggle');
  
  if (devModeToggle) {
    // Handle checkbox change
    devModeToggle.addEventListener('change', function() {
      updateDevMode(this.checked);
      showToast(`Dev mode ${this.checked ? 'enabled' : 'disabled'}`);
    });
    
    // Handle click on the toggle switch itself
    if (devToggleSwitch) {
      devToggleSwitch.addEventListener('click', function() {
        devModeToggle.checked = !devModeToggle.checked;
        devModeToggle.dispatchEvent(new Event('change'));
      });
    }
    
    // Handle click on the entire toggle container
    if (devToggleContainer) {
      devToggleContainer.addEventListener('click', function() {
        devModeToggle.checked = !devModeToggle.checked;
        devModeToggle.dispatchEvent(new Event('change'));
      });
    }
  }
  
}

// Export event handling functions
export {
  extractLinkedInData,
  showPartnerForm,
  clearPartnerInfo,
  scrapePartnerFromLinkedIn,
  savePartnerInfo,
  cancelPartnerForm,
  setupEventListeners
};