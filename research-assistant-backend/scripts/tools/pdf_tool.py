from langchain.tools import tool
import fitz  # PyMuPDF
from dotenv import load_dotenv
import os
from langchain_openai import ChatOpenAI
from transformers import pipeline
from pathlib import Path

BACKEND_ROOT_DIR = Path(__file__).parent.parent.parent
UPLOAD_DIR = BACKEND_ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

load_dotenv()

summarizer = pipeline("summarization", model="facebook/bart-large-cnn")

@tool("summarize_pdf", return_direct=True)
def load_and_summarize(file_path_relative: str) -> str:
    """Loads a PDF document from a given relative file path, extracts text,
    and generates a summary using a pre-trained BART model.
    Handles relative paths from the backend's root uploads directory.
    """
    filename_only = Path(file_path_relative).name
    full_pdf_path = UPLOAD_DIR / filename_only

    try:
        if not full_pdf_path.exists():
            return f"❌ **Error summarizing PDF: File not found at expected location: {full_pdf_path}**"

        doc = fitz.open(str(full_pdf_path))
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()

        if not text.strip():
            return "❌ **PDF appears to be empty or unreadable**"

        chunk = text[:1024]
        if len(chunk.strip().split()) < 50:
            return "❌ **Not enough content to summarize.**"

        summary = summarizer(chunk, max_length=200, min_length=50, do_sample=False)

        result = f"📄 **PDF Summary:**\n\n"
        result += f"**File:** {os.path.basename(str(full_pdf_path))}\n\n"
        result += f"**Summary:**\n{summary[0]['summary_text']}\n\n"
        result += f"**Content Length:** ~{len(text.split())} words"

        return result
    except Exception as e:
        return f"❌ **Error summarizing PDF:** {str(e)}"