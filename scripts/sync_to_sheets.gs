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

const CONFIG = {
  GITHUB_OWNER: 'gabeperez',
  GITHUB_REPO: 'abos-data',
  GITHUB_TOKEN: '',
  
  SHEETS: {
    TICKET_SALES_RAW: 'Ticket Sales - Raw',
    TICKET_SALES_DAILY: 'Ticket Sales - Daily',
    AD_PERFORMANCE: 'Ad Performance',
    IMPACT_ANALYSIS: 'Impact Analysis',
    SYNC_LOG: 'Sync Log'
  },
  
  PATHS: {
    TICKET_SALES: 'ticket-sales/processed',
    AD_MONTHLY: 'ad-performance/monthly',
    AD_WEEKLY: 'ad-performance/weekly'
  }
};

function syncAllData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    syncTicketSales(ss);
    syncAdPerformance(ss);
    updateImpactAnalysis(ss);
    logSync(ss, 'SUCCESS', 'All data synced successfully');
  } catch (error) {
    logSync(ss, 'ERROR', error.toString());
    throw error;
  }
}

function syncTicketSales(ss) {
  const sheet = getOrCreateSheet(ss, CONFIG.SHEETS.TICKET_SALES_RAW);
  const files = listGitHubFiles(CONFIG.PATHS.TICKET_SALES);
  const processedFiles = getProcessedFiles(sheet, 'snapshot_timestamp');
  
  let newRows = 0;
  for (const file of files) {
    if (file.name.endsWith('.csv') && !processedFiles.has(file.name)) {
      const csvData = fetchGitHubFile(file.path);
      const rows = parseCSV(csvData);
      
      if (rows.length > 1) {
        const hasData = sheet.getLastRow() > 0;
        const dataToAppend = hasData ? rows.slice(1) : rows;
        
        if (dataToAppend.length > 0) {
          if (!hasData) {
            sheet.getRange(1, 1, 1, rows[0].length).setValues([rows[0]]);
          }
          sheet.getRange(sheet.getLastRow() + 1, 1, dataToAppend.length, dataToAppend[0].length)
               .setValues(dataToAppend);
          newRows += dataToAppend.length;
        }
      }
    }
  }
  
  if (newRows > 0) {
    updateDailyAggregation(ss);
  }
  
  return newRows;
}

function updateDailyAggregation(ss) {
  const rawSheet = ss.getSheetByName(CONFIG.SHEETS.TICKET_SALES_RAW);
  const dailySheet = getOrCreateSheet(ss, CONFIG.SHEETS.TICKET_SALES_DAILY);
  
  if (!rawSheet || rawSheet.getLastRow() < 2) return;
  
  const data = rawSheet.getDataRange().getValues();
  const headers = data[0];
  
  const showDateIdx = headers.indexOf('show_date');
  const ticketTypeIdx = headers.indexOf('ticket_type_name');
  const ticketsSoldIdx = headers.indexOf('tickets_sold');
  
  if (showDateIdx === -1 || ticketsSoldIdx === -1) return;
  
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
  
  dailySheet.clear();
  dailySheet.getRange(1, 1, 1, 4).setValues([['Date', 'Adult Tickets', 'Child Tickets', 'Total']]);
  
  const rows = Object.entries(dailyTotals)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, totals]) => {
      const formatted = date.length === 8 
        ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`
        : date;
      return [formatted, totals.adult, totals.child, totals.total];
    });
  
  if (rows.length > 0) {
    dailySheet.getRange(2, 1, rows.length, 4).setValues(rows);
  }
}

function syncAdPerformance(ss) {
  const sheet = getOrCreateSheet(ss, CONFIG.SHEETS.AD_PERFORMANCE);
  
  const monthlyFiles = listGitHubFiles(CONFIG.PATHS.AD_MONTHLY);
  const weeklyFiles = listGitHubFiles(CONFIG.PATHS.AD_WEEKLY);
  
  const allFiles = [...monthlyFiles, ...weeklyFiles];
  
  let allData = [];
  let headers = null;
  
  for (const file of allFiles) {
    if (file.name.endsWith('.csv')) {
      const csvData = fetchGitHubFile(file.path);
      const rows = parseCSV(csvData);
      
      if (rows.length > 1) {
        if (!headers) {
          headers = rows[0];
          headers.push('source_file');
        }
        
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

function updateImpactAnalysis(ss) {
  const ticketSheet = ss.getSheetByName(CONFIG.SHEETS.TICKET_SALES_DAILY);
  const adSheet = ss.getSheetByName(CONFIG.SHEETS.AD_PERFORMANCE);
  const impactSheet = getOrCreateSheet(ss, CONFIG.SHEETS.IMPACT_ANALYSIS);
  
  if (!ticketSheet || !adSheet) return;
  
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
    const roas = ads.spend > 0 ? ((tickets * 3500) / ads.spend).toFixed(2) : '';
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

function listGitHubFiles(path) {
  const url = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/contents/${path}`;
  
  const options = {
    method: 'GET',
    headers: { 'Accept': 'application/vnd.github.v3+json' },
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
      return [];
    } else {
      throw new Error(`GitHub API error: ${code}`);
    }
  } catch (e) {
    console.error(`Error listing files in ${path}: ${e}`);
    return [];
  }
}

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
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
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
  
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell);
    if (currentRow.some(c => c !== '')) {
      rows.push(currentRow);
    }
  }
  
  return rows;
}

function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

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

function logSync(ss, status, message) {
  const logSheet = getOrCreateSheet(ss, CONFIG.SHEETS.SYNC_LOG);
  
  if (logSheet.getLastRow() === 0) {
    logSheet.getRange(1, 1, 1, 3).setValues([['Timestamp', 'Status', 'Message']]);
  }
  
  logSheet.appendRow([new Date(), status, message]);
  
  if (logSheet.getLastRow() > 101) {
    logSheet.deleteRows(2, logSheet.getLastRow() - 101);
  }
}

function setupTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  
  ScriptApp.newTrigger('syncAllData')
    .timeBased()
    .everyHours(1)
    .create();
  
  console.log('Trigger set up to run every hour');
}

function manualSync() {
  syncAllData();
}