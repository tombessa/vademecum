#!/usr/bin/env python3
"""Extract positioned words from a Vade Mecum PDF without flattening its columns."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import pdfplumber


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--from-page", type=int, default=1)
    parser.add_argument("--to-page", type=int)
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def column_for(x0: float, width: float, content_left: float) -> int:
    """Classify columns while accounting for the book's alternating inner margin."""
    column_span = width * 0.2764
    gutter_half = width * 0.009
    if x0 < content_left + column_span - gutter_half:
        return 0
    if x0 < content_left + (2 * column_span) - gutter_half:
        return 1
    return 2


def group_lines(words: list[dict]) -> list[dict]:
    lines: list[dict] = []
    for column in range(3):
        column_words = sorted(
            (word for word in words if word["column"] == column),
            key=lambda word: (word["top"], word["x0"]),
        )
        grouped: list[list[dict]] = []
        for word in column_words:
            if not grouped or abs(grouped[-1][0]["top"] - word["top"]) > 2.2:
                grouped.append([word])
            else:
                grouped[-1].append(word)
        for group in grouped:
            ordered = sorted(group, key=lambda word: word["x0"])
            lines.append(
                {
                    "column": column,
                    "top": min(word["top"] for word in ordered),
                    "text": " ".join(word["text"] for word in ordered),
                }
            )
    return lines


def extract_page(page, page_number: int) -> dict:
    words = page.extract_words(
        keep_blank_chars=False,
        use_text_flow=False,
        extra_attrs=["fontname", "size"],
    )
    content_words = [word for word in words if word["top"] >= 45]
    content_left = min((word["x0"] for word in content_words), default=0)
    positioned = []
    for word in content_words:
        positioned.append(
            {
                "text": word["text"],
                "x0": round(word["x0"], 2),
                "x1": round(word["x1"], 2),
                "top": round(word["top"], 2),
                "bottom": round(word["bottom"], 2),
                "column": column_for(word["x0"], page.width, content_left),
                "font": word.get("fontname"),
                "size": round(word.get("size", 0), 2),
            }
        )
    return {
        "page": page_number,
        "width": round(page.width, 2),
        "height": round(page.height, 2),
        "words": positioned,
        "lines": group_lines(positioned),
    }


def main() -> None:
    args = parse_args()
    if not args.pdf.is_file():
        raise SystemExit(f"PDF não encontrado: {args.pdf}")
    if args.from_page < 1:
        raise SystemExit("--from-page deve ser maior que zero")

    with pdfplumber.open(args.pdf) as document:
        final_page = args.to_page or len(document.pages)
        if final_page > len(document.pages) or final_page < args.from_page:
            raise SystemExit("Intervalo de páginas inválido")
        pages = [
            extract_page(document.pages[index - 1], index)
            for index in range(args.from_page, final_page + 1)
        ]

    payload = {
        "source": {
            "filename": args.pdf.name,
            "sha256": sha256(args.pdf),
            "from_page": args.from_page,
            "to_page": final_page,
        },
        "pages": pages,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
