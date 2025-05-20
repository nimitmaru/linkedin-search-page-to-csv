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
  
  // Load stored data
  loadStoredProfiles(storageCallbacks);
  loadPartnerInfoFromStorage(updatePartnerInfoDisplay);
  
  // Extract data from LinkedIn
  extractLinkedInData();
});