# ABOS Data System
**A Bunch of Stuff - Johnny Depp Art Exhibition**

Marketing attribution and ticket sales analytics system.

## Overview

This repository serves as the central data store for:
1. **Ticket Sales** - Daily cumulative snapshots from the ticketing system
2. **Ad Performance** - Meta/Facebook advertising data exports

Data flows: `Email Reports → GitHub → Google Sheets → Looker Studio Dashboard`

## Repository Structure

```
abos-data/
├── ticket-sales/
│   ├── raw/                    # Original CSV exports (Shift-JIS)
│   │   ├── 2025-01-13_0800.csv
│   │   └── 2025-01-13_1700.csv
│   └── processed/              # UTF-8 converted, ready for Sheets
│
├── ad-performance/
│   ├── monthly/                # Full month exports
│   │   ├── 2024-11.csv
│   │   └── 2024-12.csv
│   └── weekly/                 # Weekly exports (Jan 2025+)
│       ├── 2025-W01.csv
│       └── 2025-W02.csv
│
├── scripts/
│   ├── process_tickets.py      # Converts Shift-JIS → UTF-8, calculates deltas
│   └── sync_to_sheets.gs       # Google Apps Script for auto-sync
│
└── .github/
    └── workflows/
        └── process-data.yml    # Auto-process on CSV upload
```

## File Naming Convention

### Ticket Sales
- Format: `YYYY-MM-DD_HHMM.csv`
- Example: `2025-01-13_0800.csv` (8am snapshot on Jan 13)

### Ad Performance
- Monthly: `YYYY-MM.csv` (e.g., `2024-12.csv`)
- Weekly: `YYYY-WXX.csv` (e.g., `2025-W02.csv`)

## Data Schema

### Ticket Sales CSV (原帳票出力)
| Column | Type | Description |
|--------|------|-------------|
| client_id | string | Always "jd" |
| event_id | string | Event identifier (encodes dates) |
| show_date | YYYYMMDD | Performance date |
| show_time | HHMM | Performance time |
| seat_type_no | int | Seat category (4=General) |
| seat_type_name | string | 入場券 (Admission) |
| ticket_type_no | int | 6=Adult, 7=Child |
| ticket_type_name | string | 大人/子ども |
| tickets_sold | int | **Cumulative total** |

### Ad Performance CSV (Meta Export)
Standard Meta Ads export with daily breakdown including:
- Campaign / Ad Set / Ad hierarchy
- Reach, Impressions, Frequency
- Spend (JPY), Purchases, Link Clicks
- CPC, CPM, Cost per Purchase

## Google Sheets Structure

### Sheet 1: Ticket Sales Raw
All snapshots appended with `snapshot_timestamp` column

### Sheet 2: Ticket Sales Daily
Calculated deltas showing actual sales per period

### Sheet 3: Ad Performance
All ad data with derived metrics

### Sheet 4: Impact Analysis
Combined view correlating ad spend with ticket velocity

## Setup Instructions

See [SETUP.md](./SETUP.md) for:
1. Google Apps Script installation
2. GitHub Actions configuration
3. Email forwarding rules
4. Looker Studio connection

## Usage

### Manual Upload
1. Save CSV attachment from email
2. Rename following convention above
3. Commit to appropriate folder
4. GitHub Action auto-processes and syncs

### Automated (Coming Soon)
Gmail filter → Google Apps Script → GitHub API → Sheets

---

*Maintained by Monolith Communications Inc.*
