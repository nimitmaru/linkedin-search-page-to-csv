/**
 * Popup.js - Main entry point for the LinkedIn Chrome Extension popup
 * This file initializes the UI and sets up all the event handlers
 */

import { loadStoredProfiles, loadPartnerInfoFromStorage } from './storage.js';
import { displayResults, updatePartnerInfoDisplay, updateExportButtonsState } from './ui.js';
import { extractLinkedInData, setupEventListeners } from './events.js';

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
  // Initialize the UI and set up event listeners
  setupEventListeners();
  
  // Callback functions for storage operations
  const storageCallbacks = {
    onDataLoaded: (data) => {
      // Handle data loaded from storage
    },
    updateUI: (data) => displayResults(data),
    updateExportButtonsState: updateExportButtonsState,
    onPartnerInfoLoaded: updatePartnerInfoDisplay
  };
  
  // First load the VC partner info to ensure it's available
  loadPartnerInfoFromStorage(() => {
    console.log('loadPartnerInfoFromStorage callback');
    // After partner info is loaded, load the profiles data
    // This ensures proper sequence and that partner info is available
    // when processing the search context and profiles
    loadStoredProfiles(storageCallbacks);
    
    // Make sure the UI correctly shows the partner info
    updatePartnerInfoDisplay();
  });
  
  // Extract data from LinkedIn
  extractLinkedInData();
});