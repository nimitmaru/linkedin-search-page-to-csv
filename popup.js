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
          statusDiv.textContent = `Found ${extractedData.length} profiles`;
          
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
  
  // Extract data automatically when popup opens
  extractLinkedInData();
  
  // Handler for refresh button
  refreshButton.addEventListener('click', extractLinkedInData);
  
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
    
    // Display all results with checkboxes
    data.forEach((profile, index) => {
      const profileId = `profile-${index}`;
      
      html += `
      <div class="profile-item">
        <div class="checkbox-container">
          <input type="checkbox" id="${profileId}" class="profile-checkbox" data-id="${profileId}">
        </div>
        <div class="profile-info">
          <div class="profile-name">${escapeHtml(profile.name)}</div>
          <div class="profile-title">${escapeHtml(profile.title)}</div>
          <a href="${profile.url}" class="profile-url" target="_blank" title="${escapeHtml(profile.url)}">${escapeHtml(profile.url)}</a>
        </div>
      </div>
      `;
    });
    
    resultsDiv.innerHTML = html;
    
    // Add event listeners to checkboxes
    document.querySelectorAll('.profile-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', function() {
        const profileId = this.getAttribute('data-id');
        
        if (this.checked) {
          selectedProfiles.add(profileId);
        } else {
          selectedProfiles.delete(profileId);
          
          // Uncheck "Select All" if any individual item is unchecked
          selectAllCheckbox.checked = false;
        }
        
        updateExportButtonsState();
      });
    });
  }
  
  // Get the data for selected profiles
  function getSelectedProfilesData() {
    if (selectedProfiles.size === 0) return [];
    
    return extractedData.filter((_, index) => {
      const profileId = `profile-${index}`;
      return selectedProfiles.has(profileId);
    });
  }
  
  // Update export buttons state
  function updateExportButtonsState() {
    const hasSelectedProfiles = selectedProfiles.size > 0;
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