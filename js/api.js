/**
 * API.js - API functionality for the LinkedIn Chrome Extension
 */

import { showToast } from './utils.js';
import { state } from './storage.js';
import { getAllProfilesForCurrentSearch } from './storage.js';

/**
 * Function to export data to API
 * Sends selected profiles along with VC partner information to the API
 */
function exportDataToAPI() {
  const exportApiButton = document.getElementById('export-api');
  if (!exportApiButton) return;
  
  // First check if partner info is available
  if (!state.partnerInfo.linkedInURL) {
    showToast('Please select a VC partner first');
    // Trigger partner info prompt via events.js
    document.dispatchEvent(new CustomEvent('promptPartnerInfo'));
    return;
  }
  
  // Get all profiles
  const allProfiles = getAllProfilesForCurrentSearch();
  
  if (allProfiles.length === 0) {
    showToast('No profiles found to export');
    return;
  }
  
  // Prepare data for API
  const apiData = {
    partnerInfo: {
      linkedInURL: state.partnerInfo.linkedInURL,
      fullName: state.partnerInfo.fullName || '',
      title: state.partnerInfo.title || ''
    },
    contacts: allProfiles.map(profile => ({
      fullName: profile.name || '',
      linkedInURL: profile.url || '',
      title: profile.title || '',
      closenessIndex: profile.closenessIndex !== undefined ? profile.closenessIndex : 1
    }))
  };
  
  // Show loading state
  exportApiButton.disabled = true;
  exportApiButton.textContent = 'Sending...';
  
  // Make API call
  fetch('https://flywithkite.com/api/exportToAirtable', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(apiData)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    showToast('Data exported successfully!');
    console.log('API response:', data);
  })
  .catch(error => {
    showToast(`Failed to export data: ${error.message}`);
    console.error('API error:', error);
  })
  .finally(() => {
    // Restore button state
    exportApiButton.disabled = false;
    exportApiButton.textContent = 'Send to Airtable';
  });
}

// Export API functions
export {
  exportDataToAPI
};