// Background script to handle events that require background processing
chrome.runtime.onInstalled.addListener(() => {
  console.log('LinkedIn Data Extractor extension installed');
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle any background processing here if needed in the future
  return true;
});