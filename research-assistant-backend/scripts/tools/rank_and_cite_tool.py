from langchain.tools import tool
from urllib.parse import urlparse
from typing import List, Dict, Optional
from langchain_openai import ChatOpenAI
from tools.llm_rank_score import llm_rank_score

# Domain reputation scores
REPUTATION_SCORES = {
    "gov": 5,
    "edu": 5,
    "nature.com": 4,
    "sciencedirect.com": 4,
    "harvard.edu": 4,
    "stanford.edu": 4,
    "wikipedia.org": 2,
    "quora.com": 1,
    "reddit.com": 1,
}

llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0)

@tool("rank_and_cite", return_direct=True)
def rank_and_cite(
    results: List[Dict[str, str]], 
    use_llm: Optional[bool] = False
) -> str:
    """
    Rank sources based on credibility and return formatted citations.
    Args:
        results: List of dicts with keys: 'link', 'title', 'snippet'.
        use_llm: Whether to call LLM to score unknown domains.

    Returns:
        A ranked string list of citations with credibility indicators.
    """
    if not results:
        return "❌ **No results provided for ranking.**"
    
    citations = []

    for result in results:
        url = result.get("link", "")
        title = result.get("title", "")
        snippet = result.get("snippet", "")
        domain = urlparse(url).netloc

        score = 1
        found = False
        for key in REPUTATION_SCORES:
            if key in domain:
                score = REPUTATION_SCORES[key]
                found = True
                break

        if not found and use_llm:
            score = llm_rank_score(title, snippet, url, llm)

        # Create credibility indicator
        credibility = "🟢 High" if score >= 4 else "🟡 Medium" if score >= 3 else "🔴 Low"
        citations.append((score, f"**{title}**\n   {credibility} Credibility | [Source]({url})\n   {snippet[:100]}...\n"))

    citations.sort(reverse=True, key=lambda x: x[0])
    ranked = "\n".join([c[1] for c in citations])
    
    return f"📈 **Ranked Citations by Credibility:**\n\n{ranked}"