/**
 * ABOS Data Sync - Google Apps Script
 * 
 * Automatically syncs CSV files from GitHub to Google Sheets.
 * Set up a time-based trigger to run every hour.
 * 
 * SETUP:
 * 1. Create a new Google Sheet
 * 2. Extensions > Apps Script
 * 3. Paste this code
 * 4. Update CONFIG below with your values
 * 5. Run > setupTriggers
 */

// ============================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================
const CONFIG = {
  // GitHub repository details
  GITHUB_OWNER: 'gabeperez',
  GITHUB_REPO: 'abos-data',
  GITHUB_TOKEN: '', // Optional: for private repos, create a Personal Access Token
  
  // Google Sheet tab names
  SHEETS: {
    TICKET_SALES_RAW: 'Ticket Sales - Raw',
    TICKET_SALES_DAILY: 'Ticket Sales - Daily',
    AD_PERFORMANCE: 'Ad Performance',
    IMPACT_ANALYSIS: 'Impact Analysis',
    SYNC_LOG: 'Sync Log'
  },
  
  // GitHub folder paths
  PATHS: {
    TICKET_SALES: 'ticket-sales/processed',
    AD_MONTHLY: 'ad-performance/monthly',
    AD_WEEKLY: 'ad-performance/weekly'
  }
};

// ============================================
// MAIN SYNC FUNCTIONS
// ============================================

/**
 * Main sync function - runs on schedule
 */
function syncAllData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    // Sync ticket sales
    syncTicketSales(ss);
    
    // Sync ad performance
    syncAdPerformance(ss);
    
    // Update impact analysis
    updateImpactAnalysis(ss);
    
    // Log success
    logSync(ss, 'SUCCESS', 'All data synced successfully');
    
  } catch (error) {
    logSync(ss, 'ERROR', error.toString());
    throw error;
  }
}

/**
 * Sync ticket sales data from GitHub
 */
function syncTicketSales(ss) {
  const sheet = getOrCreateSheet(ss, CONFIG.SHEETS.TICKET_SALES_RAW);
  const files = listGitHubFiles(CONFIG.PATHS.TICKET_SALES);
  
  // Get already processed files
  const processedFiles = getProcessedFiles(sheet, 'snapshot_timestamp');
  
  let newRows = 0;
  for (const file of files) {
    if (file.name.endsWith('.csv') && !processedFiles.has(file.name)) {
      const csvData = fetchGitHubFile(file.path);
      const rows = parseCSV(csvData);
      
      if (rows.length > 1) {
        // Append data (skip header if sheet already has data)
        const hasData = sheet.getLastRow() > 0;
        const dataToAppend = hasData ? rows.slice(1) : rows;
        
        if (dataToAppend.length > 0) {
          if (!hasData) {
            // First time - add headers
            sheet.getRange(1, 1, 1, rows[0].length).setValues([rows[0]]);
          }
          sheet.getRange(sheet.getLastRow() + 1, 1, dataToAppend.length, dataToAppend[0].length)
               .setValues(dataToAppend);
          newRows += dataToAppend.length;
        }
      }
    }
  }
  
  // Update daily aggregation
  if (newRows > 0) {
    updateDailyAggregation(ss);
  }
  
  return newRows;
}

/**
 * Aggregate ticket sales by date
 */
function updateDailyAggregation(ss) {
  const rawSheet = ss.getSheetByName(CONFIG.SHEETS.TICKET_SALES_RAW);
  const dailySheet = getOrCreateSheet(ss, CONFIG.SHEETS.TICKET_SALES_DAILY);
  
  if (!rawSheet || rawSheet.getLastRow() < 2) return;
  
  const data = rawSheet.getDataRange().getValues();
  const headers = data[0];
  
  // Find column indices
  const showDateIdx = headers.indexOf('show_date');
  const ticketTypeIdx = headers.indexOf('ticket_type_name');
  const ticketsSoldIdx = headers.indexOf('tickets_sold');
  
  if (showDateIdx === -1 || ticketsSoldIdx === -1) return;
  
  // Aggregate by date
  const dailyTotals = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const showDate = row[showDateIdx].toString();
    const ticketType = row[ticketTypeIdx] || 'unknown';
    const tickets = parseInt(row[ticketsSoldIdx]) || 0;
    
    if (!dailyTotals[showDate]) {
      dailyTotals[showDate] = { adult: 0, child: 0, total: 0 };
    }
    
    if (ticketType === 'adult') {
      dailyTotals[showDate].adult += tickets;
    } else {
      dailyTotals[showDate].child += tickets;
    }
    dailyTotals[showDate].total += tickets;
  }
  
  // Write to daily sheet
  dailySheet.clear();
  dailySheet.getRange(1, 1, 1, 4).setValues([['Date', 'Adult Tickets', 'Child Tickets', 'Total']]);
  
  const rows = Object.entries(dailyTotals)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, totals]) => {
      // Format date
      const formatted = date.length === 8 
        ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`
        : date;
      return [formatted, totals.adult, totals.child, totals.total];
    });
  
  if (rows.length > 0) {
    dailySheet.getRange(2, 1, rows.length, 4).setValues(rows);
  }
}

/**
 * Sync ad performance data from GitHub
 */
function syncAdPerformance(ss) {
  const sheet = getOrCreateSheet(ss, CONFIG.SHEETS.AD_PERFORMANCE);
  
  // Fetch monthly files
  const monthlyFiles = listGitHubFiles(CONFIG.PATHS.AD_MONTHLY);
  const weeklyFiles = listGitHubFiles(CONFIG.PATHS.AD_WEEKLY);
  
  const allFiles = [...monthlyFiles, ...weeklyFiles];
  
  // Get existing data fingerprint
  const existingRows = sheet.getLastRow();
  
  let allData = [];
  let headers = null;
  
  for (const file of allFiles) {
    if (file.name.endsWith('.csv')) {
      const csvData = fetchGitHubFile(file.path);
      const rows = parseCSV(csvData);
      
      if (rows.length > 1) {
        if (!headers) {
          headers = rows[0];
          // Add source file column
          headers.push('source_file');
        }
        
        // Add source file to each row
        for (let i = 1; i < rows.length; i++) {
          rows[i].push(file.name);
          allData.push(rows[i]);
        }
      }
    }
  }
  
  if (headers && allData.length > 0) {
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(2, 1, allData.length, allData[0].length).setValues(allData);
  }
  
  return allData.length;
}

/**
 * Create impact analysis combining ticket sales and ad spend
 */
function updateImpactAnalysis(ss) {
  const ticketSheet = ss.getSheetByName(CONFIG.SHEETS.TICKET_SALES_DAILY);
  const adSheet = ss.getSheetByName(CONFIG.SHEETS.AD_PERFORMANCE);
  const impactSheet = getOrCreateSheet(ss, CONFIG.SHEETS.IMPACT_ANALYSIS);
  
  if (!ticketSheet || !adSheet) return;
  
  // Get ticket data by date
  const ticketData = ticketSheet.getDataRange().getValues();
  const ticketByDate = {};
  for (let i = 1; i < ticketData.length; i++) {
    const date = ticketData[i][0];
    ticketByDate[date] = {
      adult: ticketData[i][1],
      child: ticketData[i][2],
      total: ticketData[i][3]
    };
  }
  
  // Get ad data by date
  const adData = adSheet.getDataRange().getValues();
  const adHeaders = adData[0];
  const dayIdx = adHeaders.indexOf('Day');
  const spendIdx = adHeaders.indexOf('Amount spent (JPY)');
  const impressionsIdx = adHeaders.indexOf('Impressions');
  const clicksIdx = adHeaders.indexOf('Link clicks');
  const purchasesIdx = adHeaders.indexOf('Purchases');
  
  const adByDate = {};
  for (let i = 1; i < adData.length; i++) {
    const row = adData[i];
    const date = row[dayIdx];
    if (!date) continue;
    
    if (!adByDate[date]) {
      adByDate[date] = { spend: 0, impressions: 0, clicks: 0, purchases: 0 };
    }
    
    adByDate[date].spend += parseFloat(row[spendIdx]) || 0;
    adByDate[date].impressions += parseInt(row[impressionsIdx]) || 0;
    adByDate[date].clicks += parseInt(row[clicksIdx]) || 0;
    adByDate[date].purchases += parseInt(row[purchasesIdx]) || 0;
  }
  
  // Combine data
  const allDates = [...new Set([...Object.keys(ticketByDate), ...Object.keys(adByDate)])].sort();
  
  impactSheet.clear();
  impactSheet.getRange(1, 1, 1, 9).setValues([[
    'Date', 'Tickets Sold', 'Ad Spend (JPY)', 'Impressions', 'Clicks', 
    'Ad Purchases', 'Cost per Ticket', 'ROAS', 'CTR'
  ]]);
  
  const impactRows = allDates.map(date => {
    const tickets = ticketByDate[date]?.total || 0;
    const ads = adByDate[date] || { spend: 0, impressions: 0, clicks: 0, purchases: 0 };
    
    const costPerTicket = tickets > 0 ? (ads.spend / tickets).toFixed(2) : '';
    const roas = ads.spend > 0 ? ((tickets * 3500) / ads.spend).toFixed(2) : ''; // Assuming avg ticket ¥3500
    const ctr = ads.impressions > 0 ? ((ads.clicks / ads.impressions) * 100).toFixed(2) + '%' : '';
    
    return [
      date, tickets, ads.spend, ads.impressions, ads.clicks, 
      ads.purchases, costPerTicket, roas, ctr
    ];
  });
  
  if (impactRows.length > 0) {
    impactSheet.getRange(2, 1, impactRows.length, 9).setValues(impactRows);
  }
}

// ============================================
// GITHUB API HELPERS
// ============================================

/**
 * List files in a GitHub directory
 */
function listGitHubFiles(path) {
  const url = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/contents/${path}`;
  
  const options = {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.github.v3+json'
    },
    muteHttpExceptions: true
  };
  
  if (CONFIG.GITHUB_TOKEN) {
    options.headers['Authorization'] = `token ${CONFIG.GITHUB_TOKEN}`;
  }
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    
    if (code === 200) {
      return JSON.parse(response.getContentText());
    } else if (code === 404) {
      return []; // Directory doesn't exist yet
    } else {
      throw new Error(`GitHub API error: ${code}`);
    }
  } catch (e) {
    console.error(`Error listing files in ${path}: ${e}`);
    return [];
  }
}

/**
 * Fetch file content from GitHub
 */
function fetchGitHubFile(path) {
  const url = `https://raw.githubusercontent.com/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/main/${path}`;
  
  const options = {
    method: 'GET',
    muteHttpExceptions: true
  };
  
  if (CONFIG.GITHUB_TOKEN) {
    options.headers = { 'Authorization': `token ${CONFIG.GITHUB_TOKEN}` };
  }
  
  const response = UrlFetchApp.fetch(url, options);
  return response.getContentText();
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Parse CSV string to 2D array
 */
function parseCSV(csvString) {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuotes = false;
  
  for (let i = 0; i < csvString.length; i++) {
    const char = csvString[i];
    const nextChar = csvString[i + 1];
    
    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // Skip next quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++; // Handle \r\n
      currentRow.push(currentCell);
      if (currentRow.length > 0 && currentRow.some(c => c !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }
  
  // Last row
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell);
    if (currentRow.some(c => c !== '')) {
      rows.push(currentRow);
    }
  }
  
  return rows;
}

/**
 * Get or create a sheet by name
 */
function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

/**
 * Get set of already processed files based on a column value
 */
function getProcessedFiles(sheet, columnName) {
  const processed = new Set();
  if (sheet.getLastRow() < 1) return processed;
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIdx = headers.indexOf(columnName);
  
  if (colIdx === -1 || sheet.getLastRow() < 2) return processed;
  
  const values = sheet.getRange(2, colIdx + 1, sheet.getLastRow() - 1, 1).getValues();
  values.forEach(row => {
    if (row[0]) processed.add(row[0].toString());
  });
  
  return processed;
}

/**
 * Log sync activity
 */
function logSync(ss, status, message) {
  const logSheet = getOrCreateSheet(ss, CONFIG.SHEETS.SYNC_LOG);
  
  // Add headers if empty
  if (logSheet.getLastRow() === 0) {
    logSheet.getRange(1, 1, 1, 3).setValues([['Timestamp', 'Status', 'Message']]);
  }
  
  logSheet.appendRow([new Date(), status, message]);
  
  // Keep only last 100 logs
  if (logSheet.getLastRow() > 101) {
    logSheet.deleteRows(2, logSheet.getLastRow() - 101);
  }
}

// ============================================
// TRIGGER SETUP
// ============================================

/**
 * Set up time-based trigger to run every hour
 */
function setupTriggers() {
  // Remove existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  
  // Create hourly trigger
  ScriptApp.newTrigger('syncAllData')
    .timeBased()
    .everyHours(1)
    .create();
  
  console.log('Trigger set up to run every hour');
}

/**
 * Manual sync trigger (for testing)
 */
function manualSync() {
  syncAllData();
}
