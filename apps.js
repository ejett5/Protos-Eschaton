/**
 * Google Apps Script - Counter Backend for Protos-Eschaton
 * This version handles both reading and bumping via GET requests to avoid CORS preflight issues
 */

const SHEET_NAME = 'metrics';

/**
 * Get or create the metrics sheet
 * This is a helper function used by other functions
 */
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  
  // Ensure headers exist (only runs once when sheet is created)
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['slug','likes','dislikes','infos']);
    // Make header row bold for readability
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  }
  return sheet;
}

/**
 * Find the row number for a given slug
 * Returns null if the slug doesn't exist yet
 */
function findRowBySlug_(slug) {
  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues(); // includes header row
  
  // Start at i=1 to skip the header row
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === slug) {
      return i + 1; // Return 1-based row number (Google Sheets uses 1-based indexing)
    }
  }
  return null; // Slug not found
}

/**
 * Ensure a row exists for a slug
 * If it doesn't exist, create it with all counts at 0
 * Returns the row number (1-based)
 */
function ensureRow_(slug) {
  const sheet = getSheet_();
  const row = findRowBySlug_(slug);
  
  if (row) return row; // Row already exists
  
  // Create new row with initial counts of 0
  sheet.appendRow([slug, 0, 0, 0]);
  return sheet.getLastRow(); // Return the row number we just created
}

/**
 * Read the current counts for a slug
 * If the slug doesn't exist, return zeros
 */
function readCounts_(slug) {
  const row = findRowBySlug_(slug);
  const sheet = getSheet_();
  
  // If slug doesn't exist yet, return all zeros
  if (!row) {
    return { slug: slug, likes: 0, dislikes: 0, infos: 0 };
  }
  
  // Read the row data (4 columns: slug, likes, dislikes, infos)
  const values = sheet.getRange(row, 1, 1, 4).getValues()[0];
  
  return { 
    slug: values[0], 
    likes: values[1] || 0,      // Use 0 if value is null/undefined
    dislikes: values[2] || 0, 
    infos: values[3] || 0 
  };
}

/**
 * Increment (bump) a counter for a given slug
 * This is where the actual counting happens
 */
function bump_(slug, field) {
  const sheet = getSheet_();
  const row = ensureRow_(slug); // Make sure the row exists
  
  // Map field names to column numbers
  // Column 1 = slug, Column 2 = likes, Column 3 = dislikes, Column 4 = infos
  const colMap = { 
    'likes': 2, 
    'dislikes': 3, 
    'infos': 4 
  };
  
  const col = colMap[field];
  
  // Validate that we got a valid field name
  if (!col) {
    throw new Error('Invalid field: ' + field + '. Must be likes, dislikes, or infos.');
  }
  
  // Get the current value from the sheet
  const currentVal = sheet.getRange(row, col).getValue() || 0;
  
  // Increment by 1
  const newVal = currentVal + 1;
  
  // Write the new value back to the sheet
  sheet.getRange(row, col).setValue(newVal);
  
  // Return all current counts (so the frontend can update all displays)
  return readCounts_(slug);
}

/**
 * Handle GET requests
 * This is called when your HTML page makes a fetch() request with method: 'GET'
 * 
 * GET requests are used for BOTH reading and bumping to avoid CORS preflight issues
 */
function doGet(e) {
  try {
    // Extract parameters from the URL query string
    // e.parameter is an object like: { action: 'get', slug: 'home' }
    const action = e.parameter.action || 'get';
    const slug = e.parameter.slug || 'home';
    
    if (action === 'get') {
      // Just read and return the current counts
      const result = readCounts_(slug);
      return createJsonResponse(result);
      
    } else if (action === 'bump') {
      // Increment a counter
      const field = e.parameter.field; // 'likes', 'dislikes', or 'infos'
      
      // Validate the field parameter
      if (!field || !['likes', 'dislikes', 'infos'].includes(field)) {
        return createJsonResponse({ 
          error: 'Invalid or missing field parameter. Must be: likes, dislikes, or infos' 
        });
      }
      
      // Increment the counter and return new counts
      const result = bump_(slug, field);
      return createJsonResponse(result);
      
    } else {
      // Unknown action
      return createJsonResponse({ 
        error: 'Unknown action: ' + action + '. Valid actions are: get, bump' 
      });
    }
    
  } catch (error) {
    // Log the error for debugging
    Logger.log('Error in doGet: ' + error.toString());
    
    // Return error to the client
    return createJsonResponse({ 
      error: error.toString() 
    });
  }
}

/**
 * Handle POST requests
 * This is kept for backwards compatibility, but GET is preferred to avoid CORS issues
 */
function doPost(e) {
  try {
    let payload = {};
    
    // Try to parse JSON from POST body
    try { 
      payload = JSON.parse(e.postData.contents || '{}'); 
    } catch (_) {
      // If JSON parsing fails, use URL parameters instead
      payload = e.parameter || {};
    }
    
    const slug = payload.slug || e.parameter.slug || 'home';
    const field = payload.field || e.parameter.field;
    
    // Validate field
    if (!field || !['likes', 'dislikes', 'infos'].includes(field)) {
      return createJsonResponse({ 
        error: 'Invalid or missing field. Must be: likes, dislikes, or infos' 
      });
    }
    
    // Bump the counter and return results
    const result = bump_(slug, field);
    return createJsonResponse(result);
    
  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return createJsonResponse({ 
      error: error.toString() 
    });
  }
}

/**
 * Helper function to create a JSON response
 * This formats the response properly for the browser to read
 */
function createJsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * Test function - Run this to verify everything works
 * Select this function in the dropdown and click Run
 */
function testCounter() {
  Logger.log('=== Testing Counter System ===');
  
  // Test 1: Read initial counts
  Logger.log('\n1. Reading initial counts for "test":');
  const initial = readCounts_('test');
  Logger.log(JSON.stringify(initial));
  
  // Test 2: Bump likes
  Logger.log('\n2. Bumping likes:');
  const afterLike = bump_('test', 'likes');
  Logger.log(JSON.stringify(afterLike));
  
  // Test 3: Bump dislikes
  Logger.log('\n3. Bumping dislikes:');
  const afterDislike = bump_('test', 'dislikes');
  Logger.log(JSON.stringify(afterDislike));
  
  // Test 4: Bump infos
  Logger.log('\n4. Bumping infos:');
  const afterInfo = bump_('test', 'infos');
  Logger.log(JSON.stringify(afterInfo));
  
  // Test 5: Final counts
  Logger.log('\n5. Final counts:');
  const final = readCounts_('test');
  Logger.log(JSON.stringify(final));
  
  Logger.log('\n=== Test Complete ===');
  Logger.log('Check your Google Sheet for a "metrics" tab with test data');
}

/**
 * Reset a specific slug's counts (useful for testing)
 */
function resetSlug(slug) {
  const sheet = getSheet_();
  const row = findRowBySlug_(slug);
  
  if (row) {
    // Set likes, dislikes, and infos back to 0
    sheet.getRange(row, 2, 1, 3).setValues([[0, 0, 0]]);
    Logger.log('Reset slug: ' + slug);
  } else {
    Logger.log('Slug not found: ' + slug);
  }
}

/**
 * View all counts in the log (useful for debugging)
 */
function viewAllCounts() {
  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues();
  
  Logger.log('=== All Counts ===');
  Logger.log('Slug | Likes | Dislikes | Infos');
  Logger.log('-----|-------|----------|------');
  
  for (let i = 0; i < data.length; i++) {
    Logger.log(data[i].join(' | '));
  }
}