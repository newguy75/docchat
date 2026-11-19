# DocChat: AI-Powered Document Q&A

A full-stack RAG (Retrieval-Augmented Generation) application that lets you upload PDF documents and ask questions in natural language.

## Demo

Upload any PDF → Ask questions → Get AI-powered answers with source citations

## Tech Stack

- **Frontend**: React
- **Backend**: Python + FastAPI
- **AI**: LangChain + Google Gemini
- **Embeddings**: HuggingFace (all-MiniLM-L6-v2, local)
- **Vector DB**: ChromaDB (local, in memory)

## Architecture
User uploads PDF
↓
FastAPI receives file
↓
LangChain splits into chunks (1000 characters, 200 overlap)
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
- Python 3.11+
- Node.js 18+
- Google Gemini API key (free at aistudio.google.com)

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Put your Gemini API key in .env:
# GOOGLE_API_KEY=your_key_here
uvicorn main:app --reload
```

The first upload downloads the embedding model (about 90 MB), so it takes a little longer.

Never commit `backend/.env`. It is listed in `.gitignore`.

### Frontend

```bash
cd frontend
npm install
npm start
```

Open http://localhost:3000

The frontend calls the backend at http://localhost:8000. To use another address, set `REACT_APP_API_URL` before `npm start` or `npm run build`.

Run the frontend tests with `npm test`.

## Configuration

All settings live in `backend/.env` (see `backend/.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_API_KEY` | (required) | Gemini API key |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Gemini model used to answer |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Local embedding model |
| `MAX_UPLOAD_MB` | `20` | Largest PDF accepted |
| `ALLOWED_ORIGINS` | `*` | Comma-separated frontend origins allowed by CORS |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Upload a PDF file (replaces the current document) |
| POST | `/ask` | Ask a question about the document |
| DELETE | `/reset` | Clear current document |

## Features

- PDF upload and automatic text chunking
- Local embeddings (no embedding API costs)
- Vector similarity search for relevant context
- Source page attribution in answers
- Each upload replaces the previous document, so answers never mix documents
- Readable error messages (bad file, missing key, Gemini errors, backend not running)
- Clean chat interface
- CORS-enabled for local development

## Notes

This is a single-user demo: all visitors share one document, and there is no login. Add authentication and per-user storage before deploying it publicly.

## License

MIT, see [LICENSE](LICENSE).
