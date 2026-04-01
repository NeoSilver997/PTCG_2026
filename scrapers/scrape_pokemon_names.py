"""
Scrape the Pokémon multilingual name list from 52poke.com wiki and save to
data/pokemon_names.json.

Fetches the page twice with MediaWiki language-variant parameters:
  ?variant=zh-hans  → Simplified Chinese  (大陆简体)
  ?variant=zh-hant  → Traditional Chinese (繁體)

Output JSON schema (per entry):
  {
    "number":       "0001",      # 4-digit national Pokédex number
    "name_zh_hans": "妙蛙种子",  # Simplified Chinese
    "name_zh_hant": "妙蛙種子",  # Traditional Chinese
    "name_ja":      "フシギダネ", # Japanese katakana
    "name_en":      "Bulbasaur", # English
    "form":         null         # Form/regional suffix if any (e.g. "阿罗拉的样子")
  }

Regional form variants are included as separate entries — they can be distinct
TCG cards (Alolan Meowth ≠ standard Meowth).

Actual HTML column layout (verified by debug):
  cells[0] = dex number  e.g. "#0001"
  cells[1] = empty (icon image)
  cells[2] = empty (secondary image)
  cells[3] = Chinese name  (simplified OR traditional depending on variant param)
  cells[4] = Japanese katakana
  cells[5] = English
  cells[6+] = types (ignored)
"""

import json
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE_URL = (
    "https://wiki.52poke.com/wiki/"
    "%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8"
    "%EF%BC%88%E6%8C%89%E5%85%A8%E5%9B%BD%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89"
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

DEX_PATTERN = re.compile(r"^#(\d{4})$")

OUTPUT_PATH = Path(__file__).parent.parent / "data" / "pokemon_names.json"


def fetch_page(variant: str) -> BeautifulSoup:
    url = f"{BASE_URL}?variant={variant}"
    print(f"Fetching {variant} ... ", end="", flush=True)
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    resp.encoding = "utf-8"
    print(f"OK ({len(resp.text):,} chars)")
    return BeautifulSoup(resp.text, "html.parser")


def extract_rows(soup: BeautifulSoup) -> list[tuple[str, str, str, str]]:
    """Return list of (number, zh_raw, ja, en) from all Pokémon table rows."""
    rows = []
    for row in soup.find_all("tr"):
        cells = row.find_all("td")
        # Need at least 6 cells: number, 2 empty, zh, ja, en
        if len(cells) < 6:
            continue
        raw_num = cells[0].get_text(strip=True)
        m = DEX_PATTERN.match(raw_num)
        if not m:
            continue
        number = m.group(1)
        zh_raw = cells[3].get_text(strip=True).rstrip("*")
        ja = cells[4].get_text(strip=True)
        en = cells[5].get_text(strip=True)
        if not zh_raw and not ja and not en:
            continue
        rows.append((number, zh_raw, ja, en))
    return rows


def build_entries(
    hans_rows: list[tuple[str, str, str, str]],
    hant_rows: list[tuple[str, str, str, str]],
) -> list[dict]:
    """
    Pair simplified and traditional rows by position, detect form suffixes,
    and build final entry dicts.
    """
    if len(hans_rows) != len(hant_rows):
        print(
            f"WARNING: row count mismatch — hans={len(hans_rows)}, hant={len(hant_rows)}. "
            "Truncating to shortest.",
            file=sys.stderr,
        )

    entries = []
    base_hans: dict[str, str] = {}  # first zh_hans name seen per dex number
    base_hant: dict[str, str] = {}  # first zh_hant name seen per dex number

    for (number, hans_zh, ja, en), (_, hant_zh, _, _) in zip(hans_rows, hant_rows):
        form: str | None = None

        if number not in base_hans:
            # First occurrence for this dex number → base form
            base_hans[number] = hans_zh
            base_hant[number] = hant_zh
            name_zh_hans = hans_zh
            name_zh_hant = hant_zh
        else:
            # Subsequent occurrence → regional/form variant
            b = base_hans[number]
            if hans_zh.startswith(b) and len(hans_zh) > len(b):
                form = hans_zh[len(b):].strip()
            name_zh_hans = base_hans[number]
            name_zh_hant = base_hant[number]

        entries.append(
            {
                "number": number,
                "name_zh_hans": name_zh_hans,
                "name_zh_hant": name_zh_hant,
                "name_ja": ja,
                "name_en": en,
                "form": form,
            }
        )

    return entries


def print_summary(entries: list[dict]) -> None:
    unique_numbers = {e["number"] for e in entries}
    forms = [e for e in entries if e["form"]]
    print(f"\n{'=' * 56}")
    print("SUMMARY")
    print(f"{'=' * 56}")
    print(f"Total entries (incl. forms) : {len(entries)}")
    print(f"Unique Pokédex numbers      : {len(unique_numbers)}")
    print(f"Regional/form variants      : {len(forms)}")

    checks = [
        ("0001", "Bulbasaur",  "フシギダネ", "妙蛙种子", "妙蛙種子"),
        ("0025", "Pikachu",    "ピカチュウ", "皮卡丘",   "皮卡丘"),
        ("0150", "Mewtwo",     "ミュウツー", "超梦",     "超夢"),
        ("0906", "Sprigatito", "ニャオハ",   "新叶喵",   "新葉喵"),
    ]
    print("\nSpot-checks (base forms):")
    for num, exp_en, exp_ja, exp_hans, exp_hant in checks:
        match = [e for e in entries if e["number"] == num and e["form"] is None]
        if match:
            e = match[0]
            ok_en   = "✓" if e["name_en"]      == exp_en   else f"✗ got {e['name_en']!r}"
            ok_ja   = "✓" if e["name_ja"]      == exp_ja   else f"✗ got {e['name_ja']!r}"
            ok_hans = "✓" if e["name_zh_hans"] == exp_hans else f"✗ got {e['name_zh_hans']!r}"
            ok_hant = "✓" if e["name_zh_hant"] == exp_hant else f"✗ got {e['name_zh_hant']!r}"
            print(f"  #{num}: en={ok_en}  ja={ok_ja}  hans={ok_hans}  hant={ok_hant}")
        else:
            print(f"  #{num}: NOT FOUND")

    print("\nForm examples:")
    for e in forms[:6]:
        print(
            f"  #{e['number']} [{e['form']}]  "
            f"hans={e['name_zh_hans']}  hant={e['name_zh_hant']}  "
            f"en={e['name_en']}"
        )


def main() -> None:
    hans_soup = fetch_page("zh-hans")
    time.sleep(1)  # be polite
    hant_soup = fetch_page("zh-hant")

    hans_rows = extract_rows(hans_soup)
    hant_rows = extract_rows(hant_soup)

    print(f"  Rows extracted: hans={len(hans_rows)}, hant={len(hant_rows)}")

    if not hans_rows:
        print("ERROR: No entries extracted from simplified page.", file=sys.stderr)
        sys.exit(1)

    entries = build_entries(hans_rows, hant_rows)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

    print(f"\nSaved {len(entries)} entries → {OUTPUT_PATH}")
    print_summary(entries)


if __name__ == "__main__":
    main()
