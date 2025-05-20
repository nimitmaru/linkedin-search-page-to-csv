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
 * @return {string} CSV formatted data
 */
function convertToCSV(data) {
  const headers = ['Closeness Index', 'Name', 'LinkedIn URL', 'Title'];
  const rows = data.map(row => [
    // Include closeness index (default to 1 if not set)
    `"${row.closenessIndex !== undefined ? row.closenessIndex : 1}"`,
    `"${(row.name || '').replace(/"/g, '""')}"`,
    `"${(row.url || '').replace(/"/g, '""')}"`,
    `"${(row.title || '').replace(/"/g, '""')}"`
  ]);
  
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