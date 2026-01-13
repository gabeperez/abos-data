# ABOS Data System - Setup Guide

Complete setup instructions for the A Bunch of Stuff data pipeline.

## Quick Start

### 1. GitHub Repository Setup

Your repo is already created at: https://github.com/gabeperez/abos-data

Clone and set up the folder structure:

```bash
git clone https://github.com/gabeperez/abos-data.git
cd abos-data

# Create directory structure
mkdir -p ticket-sales/raw
mkdir -p ticket-sales/processed
mkdir -p ad-performance/monthly
mkdir -p ad-performance/weekly
mkdir -p scripts
mkdir -p .github/workflows

# Copy the files from this package
# (process_tickets.py, sync_to_sheets.gs, process-data.yml)
```

### 2. Google Sheets Setup

1. **Create a new Google Sheet**
   - Go to https://sheets.google.com
   - Create new spreadsheet
   - Name it: "ABOS Analytics Dashboard"

2. **Add Google Apps Script**
   - Extensions > Apps Script
   - Delete default code
   - Paste contents of `scripts/sync_to_sheets.gs`
   - Update the CONFIG section:
     ```javascript
     const CONFIG = {
       GITHUB_OWNER: 'gabeperez',
       GITHUB_REPO: 'abos-data',
       GITHUB_TOKEN: '', // Leave empty for public repo
       // ...
     };
     ```
   - Save (Ctrl+S)

3. **Set up automatic sync**
   - In Apps Script, run the function `setupTriggers`
   - Authorize when prompted
   - This creates an hourly trigger

4. **Manual first sync**
   - Run `manualSync()` to do initial data pull

### 3. Looker Studio Dashboard

1. **Connect to Google Sheets**
   - Go to https://lookerstudio.google.com
   - Create new report
   - Add data source > Google Sheets
   - Select your ABOS Analytics Dashboard

2. **Recommended visualizations**

   **Page 1: Ticket Sales Overview**
   - Time series: Daily ticket sales
   - Scorecard: Total tickets sold
   - Breakdown: Adult vs Child tickets
   - Table: Sales by show date/time

   **Page 2: Ad Performance**
   - Time series: Daily spend vs impressions
   - Table: Campaign performance comparison
   - Pie chart: Spend by campaign
   - Scorecard: Total spend, CPC, CPM

   **Page 3: Impact Analysis**
   - Blended chart: Ticket sales + Ad spend overlay
   - Scatter plot: Spend vs Tickets (correlation)
   - Scorecard: Cost per ticket, ROAS
   - Table: Daily metrics combined

### 4. Daily Workflow

**For Ticket Sales (8am and 5pm exports):**

1. Receive email with CSV attachment
2. Save attachment with naming convention:
   - `2025-01-13_0800.csv` for 8am
   - `2025-01-13_1700.csv` for 5pm
3. Upload to GitHub: `ticket-sales/raw/`
4. GitHub Action auto-processes to UTF-8
5. Google Sheets syncs within an hour

**For Ad Performance:**

1. Export from Meta Ads Manager
2. Name file appropriately:
   - Monthly: `2024-12.csv`
   - Weekly: `2025-W02.csv`
3. Upload to GitHub: `ad-performance/monthly/` or `ad-performance/weekly/`
4. Google Sheets syncs within an hour

## Advanced: Email Automation (Optional)

To fully automate the email-to-GitHub flow:

### Option A: Zapier/Make

1. Create a Zap/Scenario
2. Trigger: New email with attachment in Gmail
3. Filter: Subject contains "帳票出力" or "ABOS"
4. Action: Upload file to GitHub

### Option B: Google Apps Script (Gmail → GitHub)

Add this to your Apps Script:

```javascript
function processEmailAttachments() {
  const threads = GmailApp.search('has:attachment filename:csv newer_than:1d subject:帳票');
  
  for (const thread of threads) {
    const messages = thread.getMessages();
    for (const message of messages) {
      const attachments = message.getAttachments();
      for (const attachment of attachments) {
        if (attachment.getName().endsWith('.csv')) {
          // Process and upload to GitHub
          uploadToGitHub(attachment);
        }
      }
    }
  }
}

function uploadToGitHub(attachment) {
  const content = Utilities.base64Encode(attachment.getBytes());
  const date = new Date();
  const filename = `${Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd_HHmm')}.csv`;
  
  const url = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/contents/ticket-sales/raw/${filename}`;
  
  const payload = {
    message: `Add ticket export ${filename}`,
    content: content
  };
  
  UrlFetchApp.fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${CONFIG.GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload)
  });
}
```

Note: This requires a GitHub Personal Access Token with `repo` scope.

## Troubleshooting

### Google Sheets not updating
- Check Apps Script trigger is running (View > Executions)
- Run `manualSync()` to test
- Check the "Sync Log" sheet for errors

### CSV encoding issues
- Ticket CSVs from Japan are Shift-JIS encoded
- The Python script handles conversion automatically
- If manual: use `iconv -f SHIFT-JIS -t UTF-8 input.csv > output.csv`

### GitHub Action failing
- Check the Actions tab in your repo
- Most common issue: Python script not in `scripts/` folder
- Ensure file has execute permissions

## Contact

For issues with this system, reach out to the Monolith team.
