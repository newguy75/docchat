import asyncio
import os
import tempfile
import uuid
from functools import lru_cache

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

from langchain_community.document_loaders import PyPDFLoader
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf.errors import PdfReadError

try:  # langchain-chroma is the maintained package; fall back to the older community version
    from langchain_chroma import Chroma
except ImportError:
    from langchain_community.vectorstores import Chroma

# Settings (all optional except GOOGLE_API_KEY, see .env.example)
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

app = FastAPI(title="DocChat API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROMPT = PromptTemplate.from_template("""
Answer the question based on the context below. If you don't know, say so.

Context: {context}

Question: {question}

Answer:""")

# The currently loaded document. One document at a time, shared by all requests (fine for a local demo).
vector_store = None
store_lock = asyncio.Lock()


class QuestionRequest(BaseModel):
    question: str


class AnswerResponse(BaseModel):
    answer: str
    sources: list[str]


@lru_cache(maxsize=1)
def get_embeddings():
    """Load the embedding model once, on first use, instead of on every upload."""
    return HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)


@lru_cache(maxsize=1)
def get_llm():
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY is not set. Put it in backend/.env")
    return ChatGoogleGenerativeAI(model=GEMINI_MODEL, temperature=0, google_api_key=api_key)


def build_store(pdf_path: str):
    """Split the PDF into chunks and index them in a brand-new Chroma collection.

    Each upload gets its own collection name. Chroma.from_documents() otherwise reuses the
    same in-memory collection, so chunks from previously uploaded PDFs would leak into answers.
    """
    pages = PyPDFLoader(pdf_path).load()
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_documents(pages)
    if not chunks:
        return None, len(pages), 0
    store = Chroma.from_documents(chunks, get_embeddings(), collection_name=f"doc-{uuid.uuid4().hex}")
    return store, len(pages), len(chunks)


def drop_store(store) -> None:
    if store is not None:
        store.delete_collection()


def page_labels(docs) -> list[str]:
    """'Page N' for each source page, in page order, without duplicates."""
    pages = sorted({doc.metadata["page"] for doc in docs if isinstance(doc.metadata.get("page"), int)})
    labels = [f"Page {page + 1}" for page in pages]
    if any(not isinstance(doc.metadata.get("page"), int) for doc in docs):
        labels.append("Page unknown")
    return labels


@app.get("/")
def root():
    return {"status": "DocChat API is running"}


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    global vector_store
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File is larger than {MAX_UPLOAD_MB} MB")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        # Parsing and embedding are slow, blocking work: run them off the event loop
        store, pages, chunks = await run_in_threadpool(build_store, tmp_path)
    except PdfReadError:
        raise HTTPException(status_code=400, detail="Could not read this file as a PDF")
    finally:
        os.unlink(tmp_path)

    if store is None:
        raise HTTPException(status_code=400, detail="No text found in this PDF (scanned images are not supported)")

    async with store_lock:
        old, vector_store = vector_store, store
        await run_in_threadpool(drop_store, old)  # remove the previous document's chunks
    return {"message": f"Processed '{file.filename}'", "pages": pages, "chunks": chunks}


@app.post("/ask", response_model=AnswerResponse)
async def ask_question(request: QuestionRequest):
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is empty")

    async with store_lock:
        if vector_store is None:
            raise HTTPException(status_code=400, detail="Please upload a PDF first")
        # Retrieve once and use the same chunks for both the answer and the listed sources
        docs = await run_in_threadpool(vector_store.similarity_search, question, k=3)

    context = "\n\n".join(doc.page_content for doc in docs)
    chain = PROMPT | get_llm() | StrOutputParser()
    answer = await chain.ainvoke({"context": context, "question": question})
    return AnswerResponse(answer=answer, sources=page_labels(docs))


@app.delete("/reset")
async def reset():
    global vector_store
    async with store_lock:
        old, vector_store = vector_store, None
        await run_in_threadpool(drop_store, old)
    return {"message": "Document cleared"}
