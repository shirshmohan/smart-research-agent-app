import os
from dotenv import load_dotenv
from typing import List, Annotated, Optional
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import shutil
from pathlib import Path

BACKEND_ROOT_DIR = Path(__file__).parent.parent
UPLOAD_DIR = BACKEND_ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

env_path = BACKEND_ROOT_DIR / ".env"
load_dotenv(dotenv_path=env_path)

serpapi_api_key = os.getenv("SERPAPI_API_KEY")
openai_api_key = os.getenv("OPENAI_API_KEY")

print(f"SERPAPI_API_KEY loaded: {bool(serpapi_api_key)}")
print(f"OPENAI_API_KEY loaded: {bool(openai_api_key)}")

from tools.search_tool import search_serpapi
from tools.pdf_tool import load_and_summarize
from tools.pdf_compare import compare_documents
from tools.rank_and_cite_tool import rank_and_cite

from langchain_core.messages import BaseMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings


app = FastAPI(title="Research Assistant API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0)

class AgentState(dict):
    messages: Annotated[List[BaseMessage], add_messages]

class ChatRequest(BaseModel):
    message: str
    files: Optional[List[str]] = []
    use_agent: bool = True

class ChatResponse(BaseModel):
    response: str

def create_research_agent():
    tools = [search_serpapi, load_and_summarize, compare_documents, rank_and_cite]
    agent_runnable = create_react_agent(llm, tools)

    graph = StateGraph(AgentState)

    def call_agent(state: AgentState):
        response = agent_runnable.invoke({"messages": state["messages"]})
        return {"messages": response["messages"]}
    
    
    graph.add_node("agent", call_agent)
    graph.set_entry_point("agent")
    graph.add_edge("agent", END)

    return graph.compile()

research_agent = create_research_agent()

def process_research_query(message: str, uploaded_files: List[str] = None) -> str:
    try:
        context_message = message
        if uploaded_files:
            file_list = ", ".join([os.path.basename(f) for f in uploaded_files])
            context_message += f"\n\nAvailable files: {file_list}"

        current_messages = [HumanMessage(content=context_message)]
        response = research_agent.invoke({"messages": current_messages})

        agent_response = response["messages"][-1]
        return agent_response.content if hasattr(agent_response, 'content') else str(agent_response)

    except Exception as e:
        return f"❌ Error processing query: {str(e)}"

@app.get("/")
async def root():
    return {"message": "Research Assistant API is running!"}

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    try:
        response = process_research_query(request.message, request.files)
        return ChatResponse(response=response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload_file")
async def upload_file(file: UploadFile = File(...)):
    try:
        if not file.filename.endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Only PDF files are allowed")

        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return {
            "filename": file.filename,
            "file_path": str(file_path),
            "file_size": file_path.stat().st_size
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/file/{filename}")
async def delete_file(filename: str):
    try:
        file_path = UPLOAD_DIR / filename
        if file_path.exists():
            file_path.unlink()
            return {"message": f"File {filename} deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/files")
async def list_files():
    try:
        files = []
        for file_path in UPLOAD_DIR.glob("*.pdf"):
            files.append({
                "filename": file_path.name,
                "file_path": str(file_path),
                "file_size": file_path.stat().st_size
            })
        return {"files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def initialize_vectorstore():
    persist_directory = "./chroma_memory"
    embedding = OpenAIEmbeddings()

    vectorstore = Chroma(
        collection_name="chat_history",
        embedding_function=embedding,
        persist_directory=persist_directory
    )
    return vectorstore

if __name__ == "__main__":
    import uvicorn
    print("🤖 Research Agent initialized successfully!")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)