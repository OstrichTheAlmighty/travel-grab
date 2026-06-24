#!/usr/bin/env python3
"""
Convert TravelGrab dark-theme Tailwind classes to light theme.
Run against each component file: python3 light-theme.py <file>
Writes the converted content back in-place.
"""

import re
import sys

def convert(content: str) -> str:
    # Order matters: most-specific patterns first to avoid partial matches.
    subs = [
        # ── Inline hex dark backgrounds ───────────────────────────────────────
        (r'bg-\[#0D1019\]',  'bg-gray-50'),
        (r'bg-\[#0d1019\]',  'bg-gray-50'),
        (r'bg-\[#0d0d14\]/95', 'bg-white/95'),
        (r'bg-\[#0d0d14\]',  'bg-white'),
        (r'bg-\[#0e0e14\]',  'bg-gray-50'),
        (r'bg-\[#0e1422\]',  'bg-gray-50'),
        (r'bg-\[#0E1422\]',  'bg-gray-50'),
        (r'bg-\[#0d1220\]',  'bg-gray-50'),
        (r'bg-\[#0d1117\]',  'bg-gray-50'),
        (r'bg-\[#0c1018\]',  'bg-white'),
        (r'bg-\[#0C1018\]',  'bg-white'),
        (r'bg-\[#1c2333\]',  'bg-gray-100'),
        (r'from-\[#0D1019\]', 'from-gray-50'),
        (r'from-\[#0d1019\]', 'from-gray-50'),

        # ── Named dark tokens ────────────────────────────────────────────────
        (r'\bbg-ink/95\b',  'bg-white/95'),
        (r'\bbg-ink/90\b',  'bg-white/90'),
        (r'\bbg-ink\b',     'bg-white'),
        (r'\bbg-panel\b',   'bg-gray-50'),
        (r'\bbg-lantern-dark\b', 'bg-gray-50'),

        # ── Fractional bg-white (dark-mode subtle highlights → light grays) ──
        (r'bg-white/\[0\.01\]',  'bg-white'),
        (r'bg-white/\[0\.02\]',  'bg-gray-50'),
        (r'bg-white/\[0\.025\]', 'bg-gray-50'),
        (r'bg-white/\[0\.03\]',  'bg-gray-50'),
        (r'bg-white/\[0\.04\]',  'bg-gray-50'),
        (r'bg-white/\[0\.05\]',  'bg-gray-100'),
        (r'bg-white/\[0\.06\]',  'bg-gray-50'),
        (r'bg-white/\[0\.07\]',  'bg-gray-100'),
        (r'bg-white/\[0\.08\]',  'bg-gray-100'),
        (r'bg-white/\[0\.09\]',  'bg-gray-100'),
        (r'bg-white/\[0\.10\]',  'bg-gray-100'),
        (r'bg-white/\[0\.1\]',   'bg-gray-100'),
        (r'bg-white/\[0\.12\]',  'bg-gray-100'),
        (r'\bbg-white/10\b',     'bg-gray-100'),
        (r'\bbg-white/15\b',     'bg-gray-200'),
        (r'\bbg-white/20\b',     'bg-gray-200'),
        (r'\bbg-white/25\b',     'bg-gray-200'),

        # ── Violet backgrounds → teal ──────────────────────────────────────
        (r'bg-lantern-violet/\[0\.05\]', 'bg-teal-50'),
        (r'bg-lantern-violet/\[0\.06\]', 'bg-teal-50'),
        (r'\bbg-lantern-violet/15\b',    'bg-teal-50'),
        (r'\bbg-lantern-violet/20\b',    'bg-teal-100'),
        (r'\bbg-lantern-violet/85\b',    'bg-teal-600'),
        (r'\bbg-lantern-violet\b',       'bg-teal-600'),

        # ── Blue backgrounds ───────────────────────────────────────────────
        (r'\bbg-lantern-blue/15\b',  'bg-blue-50'),
        (r'\bbg-lantern-blue/20\b',  'bg-blue-100'),
        (r'\bbg-lantern-blue\b',     'bg-blue-100'),

        # ── Gold backgrounds ──────────────────────────────────────────────
        (r'\bbg-lantern-gold/10\b',  'bg-amber-50'),
        (r'\bbg-lantern-gold/20\b',  'bg-amber-100'),
        (r'\bbg-lantern-gold\b',     'bg-amber-100'),

        # ── Mint backgrounds (used as active/chip state) ───────────────────
        (r'bg-lantern-mint/\[0\.06\]', 'bg-teal-50'),
        (r'\bbg-lantern-mint/10\b',    'bg-teal-50'),
        (r'\bbg-lantern-mint/15\b',    'bg-teal-50'),
        (r'\bbg-lantern-mint/20\b',    'bg-teal-100'),
        (r'bg-lantern-mint/\[0\.20\]', 'bg-teal-100'),
        # bg-lantern-mint (solid) stays — mint buttons still look good on white

        # ── Hover: dark fractional backgrounds (catch-all) ───────────────
        (r'hover:bg-white/\[0\.\d+\]', 'hover:bg-gray-100'),
        (r'hover:bg-white/\d+\b',      'hover:bg-gray-100'),
        (r'hover:bg-panel\b',          'hover:bg-gray-100'),

        # ── Bare bg-white/N (used as subtle highlight panels on dark bg) ──
        (r'\bbg-white/5\b',   'bg-gray-50'),
        (r'\bbg-white/\d\b',  'bg-gray-50'),

        # ── Focus: dark panel ─────────────────────────────────────────────
        (r'focus:bg-panel\b',         'focus:bg-white'),
        (r'focus:bg-white/\[0\.04\]', 'focus:bg-white'),
        (r'focus:bg-white/\[0\.05\]', 'focus:bg-white'),
        (r'focus:bg-white/\[0\.06\]', 'focus:bg-gray-50'),

        # ── Text: white fractions (most-specific first) ───────────────────
        (r'\btext-white/15\b', 'text-gray-300'),
        (r'\btext-white/20\b', 'text-gray-300'),
        (r'\btext-white/22\b', 'text-gray-300'),
        (r'\btext-white/25\b', 'text-gray-300'),
        (r'\btext-white/28\b', 'text-gray-400'),
        (r'\btext-white/30\b', 'text-gray-400'),
        (r'\btext-white/35\b', 'text-gray-400'),
        (r'\btext-white/38\b', 'text-gray-400'),
        (r'\btext-white/40\b', 'text-gray-500'),
        (r'\btext-white/42\b', 'text-gray-500'),
        (r'\btext-white/45\b', 'text-gray-500'),
        (r'\btext-white/50\b', 'text-gray-500'),
        (r'\btext-white/52\b', 'text-gray-600'),
        (r'\btext-white/55\b', 'text-gray-600'),
        (r'\btext-white/60\b', 'text-gray-600'),
        (r'\btext-white/65\b', 'text-gray-600'),
        (r'\btext-white/70\b', 'text-gray-700'),
        (r'\btext-white/75\b', 'text-gray-700'),
        (r'\btext-white/80\b', 'text-gray-700'),
        (r'\btext-white/85\b', 'text-gray-800'),
        (r'\btext-white/90\b', 'text-gray-800'),
        (r'\btext-white/95\b', 'text-gray-900'),
        (r'\btext-white\b',    'text-gray-900'),

        # ── Placeholder text ──────────────────────────────────────────────
        (r'placeholder:text-white/15\b', 'placeholder:text-gray-300'),
        (r'placeholder:text-white/20\b', 'placeholder:text-gray-400'),
        (r'placeholder:text-white/25\b', 'placeholder:text-gray-400'),
        (r'placeholder:text-white/30\b', 'placeholder:text-gray-400'),
        (r'placeholder:text-white/35\b', 'placeholder:text-gray-400'),
        (r'placeholder:text-white\b',    'placeholder:text-gray-400'),

        # ── Hover text ────────────────────────────────────────────────────
        (r'hover:text-white/65\b',        'hover:text-gray-700'),
        (r'hover:text-white/70\b',        'hover:text-gray-700'),
        (r'hover:text-white/85\b',        'hover:text-gray-800'),
        (r'hover:text-white\b',           'hover:text-gray-900'),
        (r'hover:text-lantern-mint/70\b', 'hover:text-teal-500'),
        (r'hover:text-lantern-mint\b',    'hover:text-teal-600'),
        (r'hover:text-lantern-violet/80\b','hover:text-teal-600'),
        (r'hover:text-lantern-violet\b',  'hover:text-teal-600'),
        (r'hover:text-lantern-blue/70\b', 'hover:text-blue-600'),
        (r'hover:text-lantern-blue/80\b', 'hover:text-blue-600'),
        (r'hover:text-lantern-blue\b',    'hover:text-blue-600'),

        # ── Violet text ───────────────────────────────────────────────────
        (r'\btext-lantern-violet/60\b', 'text-teal-500'),
        (r'\btext-lantern-violet/70\b', 'text-teal-600'),
        (r'\btext-lantern-violet/80\b', 'text-teal-600'),
        (r'\btext-lantern-violet\b',    'text-teal-600'),

        # ── Blue text ─────────────────────────────────────────────────────
        (r'\btext-lantern-blue/80\b',  'text-blue-600'),
        (r'\btext-lantern-blue\b',     'text-blue-600'),

        # ── Gold text ─────────────────────────────────────────────────────
        (r'\btext-lantern-gold/50\b',  'text-amber-500'),
        (r'\btext-lantern-gold/60\b',  'text-amber-600'),
        (r'\btext-lantern-gold\b',     'text-amber-600'),

        # ── Mint text (accent labels) ─────────────────────────────────────
        (r'\btext-lantern-mint/55\b',  'text-teal-500'),
        (r'\btext-lantern-mint/60\b',  'text-teal-500'),
        (r'\btext-lantern-mint/70\b',  'text-teal-500'),
        (r'\btext-lantern-mint\b',     'text-teal-600'),

        # ── Borders: white fractions ──────────────────────────────────────
        (r'border-white/\[0\.04\]',  'border-gray-100'),
        (r'border-white/\[0\.05\]',  'border-gray-100'),
        (r'border-white/\[0\.06\]',  'border-gray-200'),
        (r'border-white/\[0\.07\]',  'border-gray-200'),
        (r'border-white/\[0\.08\]',  'border-gray-200'),
        (r'border-white/\[0\.09\]',  'border-gray-200'),
        (r'border-white/\[0\.10\]',  'border-gray-200'),
        (r'border-white/\[0\.1\]',   'border-gray-200'),
        (r'border-white/\[0\.12\]',  'border-gray-200'),
        (r'border-white/\[0\.16\]',  'border-gray-300'),
        (r'border-white/\[0\.18\]',  'border-gray-300'),
        (r'\bborder-white/10\b',     'border-gray-200'),
        (r'\bborder-white/12\b',     'border-gray-200'),
        (r'\bborder-white/15\b',     'border-gray-200'),
        (r'\bborder-white/20\b',     'border-gray-300'),
        (r'\bborder-white/25\b',     'border-gray-300'),

        # Hover border — catch all remaining white fractions
        (r'hover:border-white/\[0\.\d+\]', 'hover:border-gray-300'),
        (r'hover:border-white/\d+\b',      'hover:border-gray-300'),

        # Focus-within border
        (r'focus-within:border-white/\[0\.\d+\]', 'focus-within:border-teal-400'),
        (r'focus-within:border-white/\d+\b',       'focus-within:border-teal-400'),

        # Remaining bare border-white fractions not caught above
        (r'border-white/\[0\.\d+\]', 'border-gray-200'),
        (r'border-white/\d+\b',      'border-gray-200'),

        # ── Borders: violet ───────────────────────────────────────────────
        (r'\bborder-lantern-violet/20\b', 'border-teal-200'),
        (r'\bborder-lantern-violet/40\b', 'border-teal-300'),
        (r'\bborder-lantern-violet/50\b', 'border-teal-400'),
        (r'\bborder-lantern-violet/60\b', 'border-teal-400'),
        (r'\bborder-lantern-violet\b',    'border-teal-500'),

        # ── Borders: blue ─────────────────────────────────────────────────
        (r'\bborder-lantern-blue/25\b',  'border-blue-200'),
        (r'\bborder-lantern-blue/40\b',  'border-blue-300'),
        (r'\bborder-lantern-blue\b',     'border-blue-400'),

        # ── Borders: gold ─────────────────────────────────────────────────
        (r'\bborder-lantern-gold/20\b',  'border-amber-200'),
        (r'\bborder-lantern-gold\b',     'border-amber-300'),

        # ── Borders: mint ─────────────────────────────────────────────────
        (r'\bborder-lantern-mint/30\b',  'border-teal-200'),
        (r'\bborder-lantern-mint/35\b',  'border-teal-300'),
        (r'\bborder-lantern-mint/40\b',  'border-teal-300'),
        (r'\bborder-lantern-mint/50\b',  'border-teal-400'),
        (r'\bborder-lantern-mint/60\b',  'border-teal-400'),
        (r'\bborder-lantern-mint\b',     'border-teal-400'),

        # ── Focus: borders and rings ──────────────────────────────────────
        (r'focus:border-lantern-mint/50\b',    'focus:border-teal-400'),
        (r'focus:border-lantern-mint/60\b',    'focus:border-teal-400'),
        (r'focus:border-lantern-violet/60\b',  'focus:border-teal-400'),
        (r'focus:border-lantern-blue/40\b',    'focus:border-blue-400'),
        (r'focus:border-white/\[0\.16\]',      'focus:border-gray-400'),
        (r'focus:ring-lantern-mint/30\b',      'focus:ring-teal-100'),
        (r'focus:ring-lantern-violet/20\b',    'focus:ring-teal-100'),

        # ── Dividers ─────────────────────────────────────────────────────
        (r'divide-white/\[0\.04\]',  'divide-gray-100'),
        (r'divide-white/\[0\.05\]',  'divide-gray-100'),
        (r'divide-white/\[0\.06\]',  'divide-gray-100'),
        (r'divide-white/\[0\.07\]',  'divide-gray-100'),
        (r'divide-white/\[0\.08\]',  'divide-gray-100'),
        (r'divide-white/\[0\.10\]',  'divide-gray-200'),
        (r'divide-white/\[0\.1\]',   'divide-gray-200'),
        (r'\bdivide-white/10\b',     'divide-gray-200'),

        # ── Color scheme ──────────────────────────────────────────────────
        (r'\[color-scheme:dark\]', '[color-scheme:light]'),

        # ── Glow shadows → standard shadows ───────────────────────────────
        (r"shadow-\[0_0_24px_rgba\(143,247,208,0\.15\)\]",   'shadow-sm'),
        (r"shadow-\[0_0_36px_rgba\(143,247,208,0\.25\)\]",   'shadow-md'),
        (r"shadow-\[0_0_80px_rgba\(119,167,255,0\.20\)\]",   'shadow-md'),
        (r"shadow-\[0_0_60px_rgba\(143,247,208,0\.05\)\]",   ''),
        (r"shadow-\[0_0_[0-9]+px_rgba\([0-9,\.]+\)\]",       'shadow-md'),
        (r"hover:shadow-\[0_0_[0-9]+px_rgba\([0-9,\.]+\)\]", 'hover:shadow-lg'),
    ]

    for pattern, replacement in subs:
        content = re.sub(pattern, replacement, content)

    return content


if __name__ == '__main__':
    for path in sys.argv[1:]:
        with open(path, 'r') as f:
            original = f.read()
        converted = convert(original)
        with open(path, 'w') as f:
            f.write(converted)
        changed = sum(1 for a, b in zip(original.split('\n'), converted.split('\n')) if a != b)
        print(f'{path}: {changed} lines changed')
