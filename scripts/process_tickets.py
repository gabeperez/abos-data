#!/usr/bin/env python3
"""
ABOS Ticket Sales Processor

Converts Shift-JIS encoded ticket CSVs to UTF-8 and calculates sales deltas
between snapshots.

Usage:
    python process_tickets.py <input_csv> [--output-dir ./processed]
    python process_tickets.py --calculate-deltas ./processed/
"""

import argparse
import csv
import os
import re
from datetime import datetime
from pathlib import Path
import json


def convert_shiftjis_to_utf8(input_path: str, output_path: str) -> dict:
    """
    Convert a Shift-JIS encoded CSV to UTF-8 with English column names.
    Returns summary statistics.
    """
    # Column mapping Japanese -> English
    column_map = {
        'クライアントID': 'client_id',
        '興行ID': 'event_id',
        '公演日': 'show_date',
        '開演時間': 'show_time',
        '席種NO': 'seat_type_no',
        '席種名': 'seat_type_name',
        '券種NO': 'ticket_type_no',
        '券種名': 'ticket_type_name',
        '販売枚数': 'tickets_sold'
    }
    
    # Ticket type mapping
    ticket_type_map = {
        '大人': 'adult',
        '子ども(3〜12歳まで)': 'child'
    }
    
    rows = []
    total_tickets = 0
    
    with open(input_path, 'r', encoding='shift_jis') as infile:
        reader = csv.DictReader(infile)
        
        for row in reader:
            new_row = {}
            for jp_col, en_col in column_map.items():
                value = row.get(jp_col, '')
                
                # Translate ticket type names
                if jp_col == '券種名' and value in ticket_type_map:
                    value = ticket_type_map[value]
                
                # Clean up seat type name
                if jp_col == '席種名':
                    value = 'admission' if value == '入場券' else value
                
                new_row[en_col] = value
            
            rows.append(new_row)
            total_tickets += int(new_row.get('tickets_sold', 0) or 0)
    
    # Extract timestamp from filename
    # Format: YYYYMMDDHHMMSS_【jd】帳票出力 (e.g., 20251130172053_【jd】帳票出力)
    filename = Path(input_path).stem
    timestamp_match = re.search(r'(\d{14})', filename)  # Look for 14-digit timestamp
    if timestamp_match:
        ts = timestamp_match.group(1)
        # YYYYMMDDHHMMSS
        snapshot_ts = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}T{ts[8:10]}:{ts[10:12]}:{ts[12:14]}"
    else:
        # Fallback: try 8-digit date + optional 6-digit time
        timestamp_match = re.search(r'(\d{8})(\d{6})?', filename)
        if timestamp_match:
            date_str = timestamp_match.group(1)
            time_str = timestamp_match.group(2) or '000000'
            snapshot_ts = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}T{time_str[:2]}:{time_str[2:4]}:{time_str[4:6]}"
        else:
            snapshot_ts = datetime.now().isoformat()
    
    # Add snapshot timestamp to all rows
    for row in rows:
        row['snapshot_timestamp'] = snapshot_ts
    
    # Write UTF-8 output
    if rows:
        fieldnames = list(rows[0].keys())
        with open(output_path, 'w', encoding='utf-8', newline='') as outfile:
            writer = csv.DictWriter(outfile, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
    
    return {
        'input_file': input_path,
        'output_file': output_path,
        'rows_processed': len(rows),
        'total_tickets': total_tickets,
        'snapshot_timestamp': snapshot_ts
    }


def calculate_deltas(processed_dir: str, output_path: str) -> dict:
    """
    Calculate ticket sales deltas between consecutive snapshots.
    Creates a time-series of actual sales per period.
    """
    files = sorted(Path(processed_dir).glob('*.csv'))
    
    if len(files) < 2:
        return {'error': 'Need at least 2 snapshots to calculate deltas'}
    
    snapshots = []
    for f in files:
        snapshot_data = {}
        with open(f, 'r', encoding='utf-8') as infile:
            reader = csv.DictReader(infile)
            for row in reader:
                key = f"{row['show_date']}_{row['show_time']}_{row['ticket_type_no']}"
                snapshot_data[key] = {
                    'tickets_sold': int(row['tickets_sold'] or 0),
                    'show_date': row['show_date'],
                    'show_time': row['show_time'],
                    'ticket_type': row.get('ticket_type_name', 'unknown'),
                    'snapshot_timestamp': row['snapshot_timestamp']
                }
        snapshots.append(snapshot_data)
    
    deltas = []
    for i in range(1, len(snapshots)):
        prev_snapshot = snapshots[i-1]
        curr_snapshot = snapshots[i]
        
        prev_ts = list(prev_snapshot.values())[0]['snapshot_timestamp'] if prev_snapshot else None
        curr_ts = list(curr_snapshot.values())[0]['snapshot_timestamp'] if curr_snapshot else None
        
        for key, curr_data in curr_snapshot.items():
            prev_count = prev_snapshot.get(key, {}).get('tickets_sold', 0)
            curr_count = curr_data['tickets_sold']
            delta = curr_count - prev_count
            
            if delta != 0:
                deltas.append({
                    'period_start': prev_ts,
                    'period_end': curr_ts,
                    'show_date': curr_data['show_date'],
                    'show_time': curr_data['show_time'],
                    'ticket_type': curr_data['ticket_type'],
                    'tickets_sold': delta,
                    'cumulative_total': curr_count
                })
    
    if deltas:
        fieldnames = ['period_start', 'period_end', 'show_date', 'show_time', 
                      'ticket_type', 'tickets_sold', 'cumulative_total']
        with open(output_path, 'w', encoding='utf-8', newline='') as outfile:
            writer = csv.DictWriter(outfile, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(deltas)
    
    return {
        'snapshots_processed': len(snapshots),
        'delta_records': len(deltas),
        'output_file': output_path
    }


def aggregate_daily_totals(processed_dir: str, output_path: str) -> dict:
    """
    Aggregate ticket sales by show_date to get daily totals.
    """
    files = sorted(Path(processed_dir).glob('*.csv'))
    if not files:
        return {'error': 'No processed files found'}
    
    latest_file = files[-1]
    daily_totals = {}
    
    with open(latest_file, 'r', encoding='utf-8') as infile:
        reader = csv.DictReader(infile)
        for row in reader:
            show_date = row['show_date']
            tickets = int(row['tickets_sold'] or 0)
            ticket_type = row.get('ticket_type_name', 'unknown')
            
            if show_date not in daily_totals:
                daily_totals[show_date] = {'adult': 0, 'child': 0, 'total': 0}
            
            if ticket_type == 'adult':
                daily_totals[show_date]['adult'] += tickets
            else:
                daily_totals[show_date]['child'] += tickets
            daily_totals[show_date]['total'] += tickets
    
    rows = []
    for date, totals in sorted(daily_totals.items()):
        formatted_date = f"{date[:4]}-{date[4:6]}-{date[6:8]}"
        rows.append({
            'date': formatted_date,
            'adult_tickets': totals['adult'],
            'child_tickets': totals['child'],
            'total_tickets': totals['total']
        })
    
    if rows:
        with open(output_path, 'w', encoding='utf-8', newline='') as outfile:
            writer = csv.DictWriter(outfile, fieldnames=['date', 'adult_tickets', 'child_tickets', 'total_tickets'])
            writer.writeheader()
            writer.writerows(rows)
    
    return {
        'days_processed': len(rows),
        'output_file': output_path,
        'date_range': f"{rows[0]['date']} to {rows[-1]['date']}" if rows else None
    }


def main():
    parser = argparse.ArgumentParser(description='Process ABOS ticket sales CSVs')
    parser.add_argument('input', nargs='?', help='Input CSV file or directory')
    parser.add_argument('--output-dir', '-o', default='./processed', help='Output directory')
    parser.add_argument('--calculate-deltas', '-d', action='store_true', help='Calculate sales deltas')
    parser.add_argument('--aggregate-daily', '-a', action='store_true', help='Aggregate daily totals')
    
    args = parser.parse_args()
    
    os.makedirs(args.output_dir, exist_ok=True)
    
    if args.calculate_deltas:
        result = calculate_deltas(args.input or args.output_dir, 
                                   os.path.join(args.output_dir, 'deltas.csv'))
        print(json.dumps(result, indent=2))
    elif args.aggregate_daily:
        result = aggregate_daily_totals(args.input or args.output_dir,
                                         os.path.join(args.output_dir, 'daily_totals.csv'))
        print(json.dumps(result, indent=2))
    elif args.input:
        input_path = Path(args.input)
        output_filename = input_path.stem + '_utf8.csv'
        output_path = os.path.join(args.output_dir, output_filename)
        result = convert_shiftjis_to_utf8(args.input, output_path)
        print(json.dumps(result, indent=2))
    else:
        parser.print_help()


if __name__ == '__main__':
    main()