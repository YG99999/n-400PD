#!/usr/bin/env python3
"""
N-400 Form Populator - WORKING VERSION
Uses PyMuPDF (fitz) to populate the official USCIS N-400 form.
Data is visually rendered with proper appearance streams.

Install: pip install pymupdf --break-system-packages

Usage:
  python3 n400_populator.py --list n400_acroform.pdf
  python3 n400_populator.py n400_acroform.pdf data.json output.pdf

JSON values for checkboxes:
  - To CHECK a box: "check" / "yes" / "true" / "1" / "x" / "on"
  - To UNCHECK a box: anything else (or omit the key)
  - Alternatively, supply the raw on_state value (e.g. "Y", "N", "M", "BRO")
    and the populator will set whichever checkbox in that group has that on_state.
"""

import fitz  # PyMuPDF
import json
import sys
from pathlib import Path


def list_fields(pdf_path):
    """List all fillable fields in the PDF, grouped by page."""
    doc = fitz.open(pdf_path)
    fields = {}

    for page_num in range(len(doc)):
        page = doc[page_num]
        for widget in page.widgets():
            name = widget.field_name
            if name not in fields:
                try:
                    on = widget.on_state()
                except Exception:
                    on = None
                fields[name] = {
                    "type": widget.field_type_string,
                    "page": page_num + 1,
                    "on_state": on,
                }

    doc.close()
    return fields


def populate(pdf_path, data, output_path):
    """
    Populate N-400 form fields with data from a dict.

    CheckBox logic:
      - If the JSON value is a "check" word (yes/true/1/on/x/checked),
        the box is set to its on_state (checked).
      - If the JSON value matches the widget's on_state exactly
        (e.g. "Y", "N", "M", "BRO"), the box is checked.
      - Otherwise the box is unchecked / left off.

    Args:
        pdf_path:    Path to the blank N-400 AcroForm PDF
        data:        Dict mapping field names to values
        output_path: Where to save the filled PDF

    Returns:
        Number of fields populated
    """
    doc = fitz.open(pdf_path)
    populated = 0
    CHECK_WORDS = {"yes", "true", "1", "on", "x", "checked", "check"}

    for page_num in range(len(doc)):
        page = doc[page_num]
        for widget in page.widgets():
            field_name = widget.field_name
            if field_name not in data:
                continue

            value = data[field_name]

            try:
                if widget.field_type_string in ("Text", "ComboBox"):
                    widget.field_value = str(value)
                    widget.text_fontsize = 0  # auto-size to fit
                    widget.update()
                    populated += 1
                    print(f"  Page {page_num+1}: {field_name} = {str(value)[:60]}")

                elif widget.field_type_string == "CheckBox":
                    str_val = str(value).strip()

                    # Determine the widget's on_state
                    try:
                        on_state = widget.on_state()
                    except Exception:
                        on_state = None

                    # Check if we should mark this widget as checked:
                    # 1) value is a generic "yes/true/check" word  → check it
                    # 2) value exactly matches this widget's on_state → check it
                    # 3) otherwise → uncheck
                    if str_val.lower() in CHECK_WORDS:
                        should_check = True
                    elif on_state and str_val == on_state:
                        should_check = True
                    else:
                        should_check = False

                    widget.field_value = should_check
                    widget.update()
                    populated += 1
                    state = f"CHECKED ({on_state})" if should_check else "unchecked"
                    print(f"  Page {page_num+1}: {field_name} = {state}")

            except Exception as e:
                print(f"  ERROR Page {page_num+1}: {field_name} - {e}")

    doc.save(output_path)
    doc.close()
    return populated


def main():
    if len(sys.argv) < 2:
        print("N-400 Form Populator (PyMuPDF)")
        print()
        print("Usage:")
        print("  python3 n400_populator.py --list <form.pdf>")
        print("  python3 n400_populator.py <form.pdf> <data.json> [output.pdf]")
        print()
        print("Install: pip install pymupdf --break-system-packages")
        sys.exit(1)

    if sys.argv[1] == "--list":
        pdf_path = sys.argv[2] if len(sys.argv) > 2 else "n400_acroform.pdf"
        fields = list_fields(pdf_path)

        if not fields:
            print(f"No fields found in {pdf_path}")
            sys.exit(1)

        # Group by page
        by_page = {}
        for name, info in fields.items():
            pg = info["page"]
            by_page.setdefault(pg, []).append((name, info["type"], info.get("on_state")))

        print(f"Fields in {pdf_path} ({len(fields)} total):\n")
        for pg in sorted(by_page):
            print(f"  Page {pg}:")
            for name, ftype, on in sorted(by_page[pg]):
                extra = f"  [on_state={on}]" if on else ""
                print(f"    {name}  ({ftype}){extra}")
            print()

    else:
        pdf_path = sys.argv[1]
        if len(sys.argv) < 3:
            print("Error: need data.json argument")
            sys.exit(1)

        data_path = sys.argv[2]
        output_path = sys.argv[3] if len(sys.argv) > 3 else "n400_filled.pdf"

        if not Path(data_path).exists():
            print(f"Error: {data_path} not found")
            sys.exit(1)

        with open(data_path) as f:
            data = json.load(f)

        # Strip comment/section keys (start with _)
        data = {k: v for k, v in data.items() if not k.startswith("_")}

        print(f"Populating {pdf_path} with {len(data)} fields...\n")
        count = populate(pdf_path, data, output_path)
        print(f"\nDone: {count} fields populated")
        print(f"Saved: {output_path}")


if __name__ == "__main__":
    main()
