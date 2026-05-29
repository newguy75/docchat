# DocChat — AI-Powered Document Q&A

A full-stack RAG (Retrieval-Augmented Generation) application that lets you upload PDF documents and ask questions in natural language.

## Demo

Upload any PDF → Ask questions → Get AI-powered answers with source citations

## Tech Stack

- **Frontend**: React
- **Backend**: Python + FastAPI
- **AI**: LangChain + Google Gemini
- **Embeddings**: HuggingFace (all-MiniLM-L6-v2, local)
- **Vector DB**: ChromaDB (local)

## Architecture
User uploads PDF
↓
FastAPI receives file
↓
LangChain splits into chunks (1000 tokens, 200 overlap)
↓
HuggingFace embeddings vectorize each chunk (local, no API needed)
↓
ChromaDB stores vectors locally
↓
User asks question
↓
ChromaDB retrieves top 3 relevant chunks
↓
Gemini generates answer based on chunks
↓
Response + source pages returned to user

## Getting Started

### Prerequisites
- Python 3.9+
- Node.js 16+
- Google Gemini API key (free at aistudio.google.com)

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Add your Gemini API key to .env:
# GOOGLE_API_KEY=your_key_here
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm start
```

Open http://localhost:3000

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Upload a PDF file |
| POST | `/ask` | Ask a question about the document |
| DELETE | `/reset` | Clear current document |

## Features

- PDF upload and automatic text chunking
- Local embeddings (no embedding API costs)
- Vector similarity search for relevant context
- Source page attribution in answers
- Clean chat interface
- CORS-enabled for local development
