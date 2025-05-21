/**
 * Profiles.js - Profile data management for the LinkedIn Chrome Extension
 */

/**
 * Combines profiles from multiple pages with duplicate detection
 * Ensures profile data is properly merged and selection state is preserved
 * 
 * @param {Array} existingProfiles - Profiles already stored
 * @param {Array} newProfiles - New profiles to add
 * @return {Array} Combined profiles with duplicates removed
 */
function combineProfiles(existingProfiles, newProfiles) {
  console.log(`combineProfiles: Combining ${existingProfiles?.length || 0} existing profiles with ${newProfiles?.length || 0} new profiles`);
  
  // Handle empty arrays
  if (!existingProfiles || existingProfiles.length === 0) {
    console.log(`combineProfiles: No existing profiles, returning just new profiles`);
    return newProfiles || [];
  }
  
  if (!newProfiles || newProfiles.length === 0) {
    console.log(`combineProfiles: No new profiles, returning just existing profiles`);
    return existingProfiles;
  }
  
  // Create a map for faster lookups
  const profileMap = new Map();
  
  // Add existing profiles to map first
  existingProfiles.forEach(profile => {
    if (profile && profile.url) {
      profileMap.set(profile.url, { ...profile });
    }
  });
  
  // Process new profiles, either adding or updating existing ones
  let updatedCount = 0;
  let newCount = 0;
  
  newProfiles.forEach(newProfile => {
    if (!newProfile || !newProfile.url) return;
    
    const existingProfile = profileMap.get(newProfile.url);
    
    if (existingProfile) {
      // Update existing profile with any new information
      // Keep selection state from existing profile if it exists
      profileMap.set(newProfile.url, {
        ...existingProfile,
        name: newProfile.name || existingProfile.name,
        title: newProfile.title || existingProfile.title,
        imageUrl: newProfile.imageUrl || existingProfile.imageUrl,
        selected: existingProfile.selected === true, // Preserve selection status
        closenessIndex: existingProfile.closenessIndex !== undefined ? 
                        existingProfile.closenessIndex : 
                        (newProfile.closenessIndex !== undefined ? 
                          newProfile.closenessIndex : 1)
      });
      updatedCount++;
    } else {
      // Add new profile
      profileMap.set(newProfile.url, { ...newProfile });
      newCount++;
    }
  });
  
  // Convert map back to array
  const result = Array.from(profileMap.values());
  console.log(`combineProfiles: Updated ${updatedCount} profiles, added ${newCount} new profiles, total: ${result.length} profiles`);
  
  return result;
}

/**
 * Converts profile data to CSV format
 * Includes closeness index in the output
 * 
 * @param {Array} data - Array of profile objects to convert
 * @param {Object} partnerInfo - VC Partner information to include
 * @return {string} CSV formatted data
 */
function convertToCSV(data, partnerInfo) {
  // Include VC Partner info in the headers if available
  let vcPartnerHeader = '';
  let vcPartnerValue = '';
  
  if (partnerInfo && partnerInfo.fullName) {
    vcPartnerHeader = 'VC Partner';
    
    // Compose the VC Partner value
    let partnerText = partnerInfo.fullName;
    
    if (partnerInfo.title && partnerInfo.company) {
      partnerText += ` (${partnerInfo.title} at ${partnerInfo.company})`;
    } else if (partnerInfo.title) {
      partnerText += ` (${partnerInfo.title})`;
    } else if (partnerInfo.company) {
      partnerText += ` (${partnerInfo.company})`;
    }
    
    vcPartnerValue = `"${partnerText.replace(/"/g, '""')}"`;
  }
  
  // Base headers
  const headers = ['Closeness Index', 'Name', 'LinkedIn URL', 'Title'];
  
  // Add VC Partner to headers if available
  if (vcPartnerHeader) {
    headers.push(vcPartnerHeader);
  }
  
  // Create rows with VC Partner value
  const rows = data.map(row => {
    const baseRow = [
      // Include closeness index (default to 1 if not set)
      `"${row.closenessIndex !== undefined ? row.closenessIndex : 1}"`,
      `"${(row.name || '').replace(/"/g, '""')}"`,
      `"${(row.url || '').replace(/"/g, '""')}"`,
      `"${(row.title || '').replace(/"/g, '""')}"`
    ];
    
    // Add VC Partner value to each row if available
    if (vcPartnerValue) {
      baseRow.push(vcPartnerValue);
    }
    
    return baseRow;
  });
  
  return [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');
}

// Export profile management functions
export {
  combineProfiles,
  convertToCSV
};