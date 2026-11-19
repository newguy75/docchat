import { useState, useRef, useEffect } from "react";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

// Call the backend and return its JSON. Throws an Error with a readable message on failure.
async function callApi(path, options) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, options);
  } catch {
    throw new Error(`Cannot reach the backend at ${API_URL}. Is it running?`);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // Not JSON, for example a plain "Internal Server Error"
  }
  if (!res.ok) {
    const detail = data && data.detail;
    const message = Array.isArray(detail) ? detail.map(d => d.msg).join("; ") : detail;
    throw new Error(message || `Request failed (HTTP ${res.status})`);
  }
  return data;
}

export default function DocChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [docName, setDocName] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const data = await callApi("/upload", {
        method: "POST",
        body: formData,
      });
      setDocName(file.name);
      setMessages([{
        role: "system",
        text: `"${file.name}" uploaded — ${data.pages} pages, ${data.chunks} chunks indexed. Ask me anything!`
      }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleAsk = async () => {
    if (!input.trim() || asking) return;
    const question = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: question }]);
    setAsking(true);
    try {
      const data = await callApi("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      setMessages(prev => [...prev, {
        role: "assistant",
        text: data.answer,
        sources: data.sources
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "error", text: err.message }]);
    } finally {
      setAsking(false);
    }
  };

  const handleReset = async () => {
    try {
      await callApi("/reset", { method: "DELETE" });
    } catch (err) {
      setError(err.message);
      return;
    }
    setDocName(null);
    setMessages([]);
    setError(null);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f0f0f",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      fontFamily: "'IBM Plex Mono', monospace",
      color: "#e8e8e8",
      padding: "0 16px"
    }}>
      {/* Header */}
      <div style={{
        width: "100%",
        maxWidth: 720,
        padding: "32px 0 16px",
        borderBottom: "1px solid #2a2a2a",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px", color: "#fff" }}>
            ◈ DocChat
          </div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
            RAG-powered document Q&A
          </div>
        </div>
        {docName && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              color: "#888",
              maxWidth: 200,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}>
              📄 {docName}
            </div>
            <button onClick={handleReset} style={{
              background: "none",
              border: "1px solid #3a1a1a",
              borderRadius: 6,
              color: "#c44",
              padding: "6px 12px",
              fontSize: 12,
              cursor: "pointer"
            }}>
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Chat area */}
      <div style={{
        width: "100%",
        maxWidth: 720,
        flex: 1,
        padding: "24px 0",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        minHeight: 400
      }}>
        {messages.length === 0 && (
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
            padding: "60px 0"
          }}>
            <div style={{
              width: 72,
              height: 72,
              border: "1px solid #2a2a2a",
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32
            }}>
              📄
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, color: "#888", marginBottom: 8 }}>
                Upload a PDF to get started
              </div>
              <div style={{ fontSize: 12, color: "#444" }}>
                Ask questions in natural language
              </div>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                background: "#fff",
                color: "#0f0f0f",
                border: "none",
                borderRadius: 8,
                padding: "12px 28px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit"
              }}
            >
              {uploading ? "Processing..." : "Upload PDF"}
            </button>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start"
          }}>
            <div style={{
              maxWidth: "80%",
              padding: "12px 16px",
              borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              background: msg.role === "user" ? "#1a1a2e" :
                          msg.role === "error" ? "#1a0a0a" :
                          msg.role === "system" ? "#0a1a0a" : "#1a1a1a",
              border: `1px solid ${
                msg.role === "user" ? "#2a2a4a" :
                msg.role === "error" ? "#3a1a1a" :
                msg.role === "system" ? "#1a3a1a" : "#2a2a2a"
              }`,
              fontSize: 13,
              lineHeight: 1.6,
              color: msg.role === "error" ? "#c44" : "#ddd"
            }}>
              {msg.text}
              {msg.sources && msg.sources.length > 0 && (
                <div style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: "1px solid #2a2a2a",
                  fontSize: 11,
                  color: "#555"
                }}>
                  Sources: {msg.sources.join(", ")}
                </div>
              )}
            </div>
          </div>
        ))}

        {asking && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{
              padding: "12px 16px",
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: "12px 12px 12px 2px",
              fontSize: 13,
              color: "#555"
            }}>
              thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      {docName && (
        <div style={{
          width: "100%",
          maxWidth: 720,
          padding: "16px 0 32px",
          borderTop: "1px solid #2a2a2a",
          display: "flex",
          gap: 8
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              // Ignore the Enter that confirms a Chinese/Japanese input method composition
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) handleAsk();
            }}
            placeholder="Ask a question about your document..."
            style={{
              flex: 1,
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
              padding: "12px 16px",
              color: "#e8e8e8",
              fontSize: 13,
              fontFamily: "inherit",
              outline: "none"
            }}
          />
          <button
            onClick={handleAsk}
            disabled={!input.trim() || asking}
            style={{
              background: input.trim() ? "#fff" : "#1a1a1a",
              color: input.trim() ? "#0f0f0f" : "#444",
              border: "1px solid #2a2a2a",
              borderRadius: 8,
              padding: "12px 20px",
              fontSize: 13,
              fontWeight: 600,
              cursor: input.trim() ? "pointer" : "default",
              fontFamily: "inherit",
              transition: "all 0.15s"
            }}
          >
            Send
          </button>
        </div>
      )}

      {/* Upload button when doc loaded */}
      {docName && (
        <div style={{ paddingBottom: 16 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              background: "none",
              border: "1px solid #2a2a2a",
              borderRadius: 6,
              color: "#666",
              padding: "6px 14px",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            {uploading ? "Processing..." : "Upload new PDF"}
          </button>
        </div>
      )}

      {error && (
        <div style={{
          position: "fixed",
          bottom: 24,
          background: "#1a0a0a",
          border: "1px solid #c44",
          borderRadius: 8,
          padding: "12px 20px",
          color: "#c44",
          fontSize: 13
        }}>
          ⚠ {error}
        </div>
      )}

      <input
        ref={fileInputRef}
        data-testid="file-input"
        type="file"
        accept=".pdf"
        onChange={handleUpload}
        style={{ display: "none" }}
      />
    </div>
  );
}
