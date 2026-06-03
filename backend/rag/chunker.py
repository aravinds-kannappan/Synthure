"""Document chunker — 512 tokens with 50-token overlap."""
from __future__ import annotations

TOKEN_CHUNK_SIZE = 512
TOKEN_OVERLAP = 50
CHAR_PER_TOKEN = 4  # approximate


def chunk_text(text: str, chunk_size: int = TOKEN_CHUNK_SIZE, overlap: int = TOKEN_OVERLAP) -> list[str]:
    """
    Split text into overlapping chunks for embedding.
    Uses character-level approximation (4 chars per token).
    """
    char_chunk = chunk_size * CHAR_PER_TOKEN
    char_overlap = overlap * CHAR_PER_TOKEN
    chunks = []
    start = 0
    while start < len(text):
        end = start + char_chunk
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += char_chunk - char_overlap
    return chunks
