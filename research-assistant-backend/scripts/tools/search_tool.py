from dotenv import load_dotenv
load_dotenv()

from langchain.tools import tool
from serpapi import GoogleSearch
from sentence_transformers import CrossEncoder
import os

# Initialize the ranking model
ranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

@tool("search_web", return_direct=True)
def search_serpapi(query: str) -> str:
    """Searches the web using SerpAPI and returns top 5 ranked results with relevance scores."""
    try:
        params = {
            "engine": "google",
            "q": query,
            "api_key": os.getenv("SERPAPI_API_KEY"),
            "num": 10,
        }
        search = GoogleSearch(params)
        results = search.get_dict()
        
        if "error" in results:
            return f"❌ **Search Error:** {results['error']}"
        if "organic_results" not in results:
            return "❌ **No search results found**"
        
        entries = results["organic_results"]
        scored = [
            (entry.get("snippet", ""), entry.get("link", ""), entry.get("title", ""), 
             float(ranker.predict([(query, entry.get("snippet", ""))])))
            for entry in entries
            if "snippet" in entry and "link" in entry
        ]
        ranked = sorted(scored, key=lambda x: x[3], reverse=True)
        top_results = ranked[:5]

        summary = "🔍 **Web Search Results:**\n\n"
        for i, (snippet, url, title, score) in enumerate(top_results, start=1):
            summary += f"**{i}. {title}**\n"
            summary += f"   {snippet}\n"
            summary += f"   🔗 [Source]({url}) | Relevance: {score:.2f}\n\n"
        
        return summary
    except Exception as e:
        return f"❌ **Search failed:** {str(e)}"
