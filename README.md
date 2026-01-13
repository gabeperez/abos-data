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
│   └── processed/              # UTF-8 converted, ready for Sheets
│
├── ad-performance/
│   ├── monthly/                # Full month exports
│   └── weekly/                 # Weekly exports (Jan 2025+)
│
├── scripts/
│   ├── process_tickets.py      # Converts Shift-JIS → UTF-8
│   └── sync_to_sheets.gs       # Google Apps Script for auto-sync
│
└── .github/workflows/
    └── process-data.yml        # Auto-process on CSV upload
```

## File Naming Convention

### Ticket Sales
- Format: `YYYYMMDDHHMMSS_【jd】帳票出力.csv`
- Example: `20251130172053_【jd】帳票出力.csv` (5:20:53pm on Nov 30, 2025)

### Ad Performance
- Monthly: `YYYY-MM.csv` (e.g., `2024-12.csv`)
- Weekly: `YYYY-WXX.csv` (e.g., `2025-W02.csv`)

## Setup

See [SETUP.md](./SETUP.md) for complete instructions.

---
*Maintained by Monolith Communications Inc.*