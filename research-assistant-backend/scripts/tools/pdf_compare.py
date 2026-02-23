from langchain.tools import tool
from PyPDF2 import PdfReader
from typing import List
from langchain_openai import ChatOpenAI
import os
from pathlib import Path

BACKEND_ROOT_DIR = Path(__file__).parent.parent.parent
UPLOAD_DIR = BACKEND_ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0)

MAX_WORDS = 500

def extract_text_from_pdf(file_path_relative: str) -> str:
    filename_only = Path(file_path_relative).name
    full_pdf_path = UPLOAD_DIR / filename_only

    try:
        if not full_pdf_path.exists():
            return f"Error: File not found at {full_pdf_path}"

        reader = PdfReader(str(full_pdf_path))
        text = "\n".join(page.extract_text() for page in reader.pages if page.extract_text()) or ""
        words = text.split()
        limited_text = " ".join(words[:MAX_WORDS])
        return limited_text
    except Exception as e:
        return f"Error reading {Path(file_path_relative).name}: {e}"

@tool("compare_documents", return_direct=True)
def compare_documents(file_paths: List[str]) -> str:
    """
    Compare up to 5 documents and extract common, unique, and conflicting points.
    Input: List of file paths to PDF documents
    Output: A structured summary highlighting similarities, differences, and contradictions.
    """
    if len(file_paths) > 5:
        return "❌ **Error:** Maximum of 5 documents allowed for comparison."

    docs = {}
    for path in file_paths:
        docs[path] = extract_text_from_pdf(path)

    for path, text in docs.items():
        if text.startswith("Error: File not found") or text.startswith("Error reading"):
            return f"❌ **Comparison Error:** One or more documents could not be read: {text}"

    input_prompt = """
    You are a smart document comparison assistant.
    You are given multiple documents. Your job is to:
    1. Identify common points across documents
    2. Identify points that are unique to each document
    3. Identify any conflicting or contradictory points among the documents

    Respond with a structured output using markdown formatting:

    ## 📊 Document Comparison Analysis

    ### 🤝 Common Points
    (Points that appear in multiple documents)

    ### 🎯 Unique Points
    (Points specific to individual documents)

    ### ⚡ Conflicting Points
    (Contradictory information between documents)
    And also mention which docs are conflicting,unqiue or common with others when mentioning the points.
    Documents:
    """

    for i, (path, text) in enumerate(docs.items(), 1):
        filename = os.path.basename(path)
        input_prompt += f"\n**Document {i} ({filename}):**\n{text}\n"

    response = llm.invoke(input_prompt)
    return response.content