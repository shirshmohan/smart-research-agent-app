from dotenv import load_dotenv
load_dotenv()

from langchain.tools import tool
from serpapi import GoogleSearch
from sentence_transformers import CrossEncoder
from tavily import TavilyClient
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

@tool("search_web_tavily", return_direct=True)
def search_tavily(query: str) -> str:
    """Searches the web using Tavily and returns top 5 results with relevance scores."""
    try:
        client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
        response = client.search(
            query=query,
            search_depth="advanced",
            max_results=5,
        )

        results = response.get("results", [])
        if not results:
            return "❌ **No search results found**"

        summary = "🔍 **Web Search Results:**\n\n"
        for i, result in enumerate(results, start=1):
            title = result.get("title", "")
            snippet = result.get("content", "")
            url = result.get("url", "")
            score = result.get("score", 0.0)
            summary += f"**{i}. {title}**\n"
            summary += f"   {snippet}\n"
            summary += f"   🔗 [Source]({url}) | Relevance: {score:.2f}\n\n"

        return summary
    except Exception as e:
        return f"❌ **Search failed:** {str(e)}"
