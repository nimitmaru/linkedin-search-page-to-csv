/**
 * Popup.js - Main entry point for the LinkedIn Chrome Extension popup
 * This file initializes the UI and sets up all the event handlers
 */

import { loadStoredProfiles, loadPartnerInfoFromStorage, loadDevModeFromStorage, state } from './storage.js';
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
  
  // Load dev mode first, then partner info, then profiles
  loadDevModeFromStorage(() => {
    // Update the dev mode toggle to match the stored state
    const devModeToggle = document.getElementById('dev-mode');
    if (devModeToggle) {
      devModeToggle.checked = state.devMode;
    }
    
    // Then load VC partner info
    loadPartnerInfoFromStorage(() => {
      console.log('loadPartnerInfoFromStorage callback');
      // After partner info is loaded, load the profiles data
      // This ensures proper sequence and that partner info is available
      // when processing the search context and profiles
      loadStoredProfiles(storageCallbacks);
      
      // Make sure the UI correctly shows the partner info
      updatePartnerInfoDisplay();
    });
  });
  
  // Extract data from LinkedIn
  extractLinkedInData();
});