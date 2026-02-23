def llm_rank_score(title:str,snippet:str,url:str,llm):
    """
    Rate the credibility of a source using LLM evaluation.
    
    Args:
        title: The title of the source
        snippet: A snippet of content from the source
        url: The URL of the source
        llm: The language model instance to use for scoring
    
    Returns:
        int: Credibility score from 1 (low) to 5 (high)
    """
    prompt=f"""Rate the credibility of the following source from 1 (low) to 5 (high):

Title: {title}
URL: {url}
Snippet: {snippet}

Consider factors like:
- Domain authority and reputation
- Content quality and accuracy
- Source type (academic, news, blog, etc.)
- Potential bias or commercial interests

Return only a number from 1 to 5."""
    try:
        response = llm.invoke(prompt)
        return max(1,min(5,int(response.content.strip())))
    except:
        return 2