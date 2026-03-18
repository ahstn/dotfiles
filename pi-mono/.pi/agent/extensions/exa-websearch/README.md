# Exa Web Search pi Extension

This extension registers an `exa_websearch` tool for pi.

## Files

- `.pi/extensions/exa-websearch/index.ts`
- `.pi/extensions/exa-websearch/package.json`

## Setup

1. Install dependencies:
   ```bash
   cd .pi/extensions/exa-websearch
   npm install
   ```
2. Set your Exa API key:
   ```bash
   export EXA_API_KEY=your_key_here
   ```
3. Reload pi:
   ```text
   /reload
   ```

Because this extension lives under `.pi/extensions/`, pi can auto-discover it and reload it.

## Tool

`exa_websearch` supports:
- query
- result count
- search type (`auto`, `fast`, `deep`, `deep-reasoning`, `instant`)
- category filters including `research paper` and `financial report`
- include/exclude domain filters
- optional highlights and/or extracted text
- published/crawl date filters
- autoprompt and user location

## Example

Ask pi something like:

> Search for 5 PPO trading research papers using Exa and prefer research paper results.

The extension will return ranked results with URLs and snippets/highlights.
