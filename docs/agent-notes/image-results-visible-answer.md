# Image results in the answer

DSH 0.1.7-rc.1 groups Tool calls inside a completed Turn's collapsed processing disclosure. Codex Connect rendered generated images only through its keyed Tool view, so a successful image could remain invisible until the reader expanded that disclosure. The final Assistant message contains text rather than a second image block; the image bytes and preview reference were not missing.

The browser plugin now adds a `conversation.chat.turnTail` entry. That Host-owned location is independent of the processing disclosure. It observes only the current Turn's Tool rows, including nested PTC results and result-only history windows, and reuses the same validated image presentation and complete result card. The original Tool view remains in processing details. The plugin does not write a duplicate Assistant message or copy image bytes into the Session log.

The regression test first failed because the completed Turn had no visible gallery. It now checks direct and nested successful results, filtering of failed and unrelated calls, closing-sequence exclusion, and the visible gallery with no expanded processing state. A headless Chromium check confirms the image and download action are visible outside any hidden processing content. Acceptance on an isolated live DSH instance remains separate from these synthetic tests.
