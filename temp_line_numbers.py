from pathlib import Path

sections = [
    ("frontend/src/pages/Login.jsx", 30, 120),
    ("frontend/src/pages/Register.jsx", 1, 140),
    ("frontend/src/pages/Auth.css", 1, 200),
    ("frontend/src/pages/Dashboard.jsx", 1, 200),
    ("frontend/src/pages/Dashboard.css", 200, 400),
]

for path, start, end in sections:
    print(f"--- {path} ({start}-{end}) ---")
    lines = Path(path).read_text().splitlines()
    for idx in range(start - 1, min(end, len(lines))):
        print(f"{idx+1:04d}: {lines[idx]}")
    print()
