#!/usr/bin/env python3
"""Fetch academic paper metadata from Semantic Scholar API."""
import urllib.request, json, time, urllib.parse, sys

QUERIES = [
    ("Gort Klepper 1982", "Gort+Klepper+1982+industry+lifecycle+stages"),
    ("Klepper 1996", "Klepper+1996+entry+exit+growth+innovation+product+lifecycle"),
    ("Carlota Perez 2002", "Carlota+Perez+2002+technological+revolutions+financial+capital"),
    ("Tushman Anderson 1986", "Tushman+Anderson+1986+technological+discontinuities"),
    ("Christensen 1997", "Christensen+1997+innovators+dilemma+disruptive+innovation"),
    ("Solow 1956", "Solow+1956+contribution+theory+economic+growth"),
    ("Solow 1957", "Solow+1957+technical+change+aggregate+production+function"),
    ("Industry Lifecycle Measurement", "industry+lifecycle+stages+measurement+quantification+empirical"),
    ("TAM Market Headroom", "total+addressable+market+estimation+methodology+headroom"),
    ("Abernathy Utterback", "Abernathy+Utterback+1978+patterns+industrial+innovation"),
    ("Henderson Clark 1990", "Henderson+Clark+1990+architectural+innovation"),
    ("Dosi 1982", "Dosi+1982+technological+paradigms+trajectories"),
    ("Freeman Perez 1988", "Freeman+Perez+1988+structural+crises+adjustment"),
    ("Agarwal Gort 1996", "Agarwal+Gort+1996+evolution+markets+entry+exit+survival"),
    ("Jovanovic 1982", "Jovanovic+1982+selection+evolution+industry"),
]

BASE = "https://api.semanticscholar.org/graph/v1/paper/search"
FIELDS = "title,authors,year,journal,externalIds,abstract,citationCount,publicationTypes"

for label, query in QUERIES:
    url = f"{BASE}?query={query}&limit=3&fields={FIELDS}"
    req = urllib.request.Request(url, headers={"User-Agent": "SynovaAgent/1.0"})
    try:
        d = json.loads(urllib.request.urlopen(req, timeout=15).read())
        print(f"\n{'='*80}")
        print(f"QUERY: {label}")
        print(f"{'='*80}")
        for i, p in enumerate(d.get("data", [])[:3]):
            authors = ", ".join([a["name"] for a in p.get("authors", [])])
            doi = p.get("externalIds", {}).get("DOI", "N/A")
            title = p.get("title", "N/A")
            year = p.get("year", "?")
            journal = p.get("journal", "N/A")
            abstract = (p.get("abstract") or "N/A")[:400]
            citations = p.get("citationCount", 0)
            print(f"\n  [{i+1}] {year} | {title}")
            print(f"  Authors: {authors}")
            print(f"  Journal: {journal} | DOI: {doi} | Citations: {citations}")
            print(f"  Abstract: {abstract}")
    except Exception as e:
        print(f"\n  ERROR for '{label}': {e}")
    time.sleep(1.0)

print("\n\nDone.")
