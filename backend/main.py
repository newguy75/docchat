from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import tempfile
from dotenv import load_dotenv

load_dotenv()

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

app = FastAPI(title="DocChat API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

vector_store = None

class QuestionRequest(BaseModel):
    question: str

class AnswerResponse(BaseModel):
    answer: str
    sources: list[str]

@app.get("/")
def root():
    return {"status": "DocChat API is running"}

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    global vector_store
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    try:
        loader = PyPDFLoader(tmp_path)
        pages = loader.load()
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = splitter.split_documents(pages)
        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        vector_store = Chroma.from_documents(chunks, embeddings)
        return {"message": f"Processed '{file.filename}'", "pages": len(pages), "chunks": len(chunks)}
    finally:
        os.unlink(tmp_path)

@app.post("/ask", response_model=AnswerResponse)
async def ask_question(request: QuestionRequest):
    global vector_store
    if vector_store is None:
        raise HTTPException(status_code=400, detail="Please upload a PDF first")
    
    llm = ChatGoogleGenerativeAI(
        model="gemini-3.1-flash-lite",
        temperature=0,
        google_api_key=os.getenv("GOOGLE_API_KEY")
    )
    
    retriever = vector_store.as_retriever(search_kwargs={"k": 3})
    
    prompt = PromptTemplate.from_template("""
Answer the question based on the context below. If you don't know, say so.

Context: {context}

Question: {question}

Answer:""")
    
    def format_docs(docs):
        return "\n\n".join(doc.page_content for doc in docs)
    
    chain = (
        {"context": retriever | format_docs, "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )
    
    docs = retriever.invoke(request.question)
    answer = chain.invoke(request.question)
    
    sources = []
    for doc in docs:
        page = doc.metadata.get("page", "unknown")
        sources.append(f"Page {page + 1}")
    
    return AnswerResponse(answer=answer, sources=list(set(sources)))

@app.delete("/reset")
async def reset():
    global vector_store
    vector_store = None
    return {"message": "Document cleared"}