# ABOS Data System - Setup Guide

## 1. Google Sheets Setup

1. Create a new Google Sheet named "ABOS Analytics Dashboard"
2. Extensions > Apps Script
3. Paste contents of `scripts/sync_to_sheets.gs`
4. Run `setupTriggers()` to enable hourly sync
5. Run `manualSync()` for first data pull

## 2. Looker Studio Dashboard

Connect to your Google Sheet and create:
- **Page 1**: Ticket Sales (time series, totals, breakdown)
- **Page 2**: Ad Performance (spend, impressions, campaigns)
- **Page 3**: Impact Analysis (correlation, ROAS, cost per ticket)

## 3. Daily Workflow

**Ticket Sales:**
1. Save email attachment (keep original filename)
2. Upload to `ticket-sales/raw/`
3. GitHub Action auto-processes
4. Sheets syncs hourly

**Ad Performance:**
1. Export from Meta Ads Manager
2. Name as `YYYY-MM.csv` (monthly) or `YYYY-WXX.csv` (weekly)
3. Upload to `ad-performance/monthly/` or `ad-performance/weekly/`

## Troubleshooting

- **Sheets not updating**: Check Apps Script > View > Executions
- **Encoding issues**: The Python script handles Shift-JIS automatically
- **Action failing**: Check GitHub Actions tab for errors