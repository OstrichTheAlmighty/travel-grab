#!/usr/bin/env python3
"""
Fix text contrast for light theme.
gray-500 (#6B7280) is 3.95:1 against white — fails WCAG AA.
Shift text grays up by one level so all body text is AA-compliant.

Also fixes stray placeholder-white/N classes that slipped through
the first conversion pass.
"""

import re
import sys

def convert(content: str) -> str:
    subs = [
        # ── Stray placeholder classes from dark theme ──────────────────────
        (r'placeholder-white/\d+\b',       'placeholder:text-gray-400'),
        (r'placeholder:text-white/\d+\b',  'placeholder:text-gray-400'),
        (r'placeholder-white/\[\S+\]',     'placeholder:text-gray-400'),

        # ── Text contrast shift (most-specific first) ──────────────────────
        # gray-300 (#D1D5DB, 1.58:1) — only decorative separators should use
        # this; nudge anything else up.
        # Keep gray-300 for truly decorative elements (icon fills, thin sep)
        # but shift text uses to gray-400.
        # We use targeted selectors rather than a blanket replace so we don't
        # touch stroke/fill/border uses of gray-300.
        (r'\btext-gray-300\b', 'text-gray-400'),

        # gray-400 (#9CA3AF, 2.53:1) → gray-500 (#6B7280, 3.95:1)
        # Still below AA but acceptable for tertiary labels (timestamps, codes)
        (r'\btext-gray-400\b', 'text-gray-500'),

        # gray-500 (#6B7280, 3.95:1) → gray-700 (#374151, 8.43:1)
        # This is the main fix: body text, descriptions, secondary copy
        # Jump to gray-700 (not just gray-600) for strong readability
        (r'\btext-gray-500\b', 'text-gray-700'),

        # Also fix hover states that reference these grays
        (r'\bhover:text-gray-300\b', 'hover:text-gray-500'),
        (r'\bhover:text-gray-400\b', 'hover:text-gray-600'),
        (r'\bhover:text-gray-500\b', 'hover:text-gray-700'),

        # placeholder contrast (shift placeholder grays up too)
        (r'\bplaceholder:text-gray-300\b', 'placeholder:text-gray-400'),
        (r'\bplaceholder:text-gray-400\b', 'placeholder:text-gray-500'),
        (r'\bplaceholder:text-gray-500\b', 'placeholder:text-gray-500'),  # keep — fine for placeholders
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
