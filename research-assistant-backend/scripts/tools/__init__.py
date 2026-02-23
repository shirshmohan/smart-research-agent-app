"""
Research Assistant Tools Package

This package contains all the AI tools used by the research assistant:
- search_tool: Web search using SerpAPI with semantic ranking
- pdf_tool: PDF summarization using BART model
- pdf_compare: Multi-document comparison and analysis
- rank_and_cite_tool: Source credibility ranking and citation formatting
- llm_rank_score: LLM-based credibility scoring utility
"""

from .search_tool import search_serpapi
from .pdf_tool import load_and_summarize
from .pdf_compare import compare_documents
from .rank_and_cite_tool import rank_and_cite
from .llm_rank_score import llm_rank_score

__all__ = [
    'search_serpapi',
    'load_and_summarize', 
    'compare_documents',
    'rank_and_cite',
    'llm_rank_score'
]