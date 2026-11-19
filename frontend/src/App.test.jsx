import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";

function mockFetch(handler) {
  vi.stubGlobal("fetch", vi.fn(handler));
}

function choosePdf() {
  const file = new File(["%PDF-1.4"], "notes.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByTestId("file-input"), { target: { files: [file] } });
}

async function uploadPdf() {
  render(<App />);
  choosePdf();
  return screen.findByPlaceholderText(/ask a question/i);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("shows the upload screen first", () => {
  render(<App />);
  expect(screen.getByText(/upload a pdf to get started/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /upload pdf/i })).toBeInTheDocument();
});

test("uploads a PDF, asks a question and shows the answer with its sources", async () => {
  mockFetch(async (url) => ({
    ok: true,
    json: async () =>
      url.endsWith("/upload")
        ? { pages: 2, chunks: 3 }
        : { answer: "Apples are red.", sources: ["Page 1"] },
  }));
  const input = await uploadPdf();
  expect(screen.getByText(/2 pages, 3 chunks indexed/i)).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "What color are apples?" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(await screen.findByText("Apples are red.")).toBeInTheDocument();
  expect(screen.getByText(/Sources: Page 1/)).toBeInTheDocument();
});

test("the Enter that confirms an input method composition does not send the question", async () => {
  mockFetch(async () => ({ ok: true, json: async () => ({ pages: 1, chunks: 1 }) }));
  const input = await uploadPdf();
  fireEvent.change(input, { target: { value: "苹果" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  expect(fetch).toHaveBeenCalledTimes(1); // only the upload
});

test("shows the reason the backend gives for an error", async () => {
  mockFetch(async (url) =>
    url.endsWith("/upload")
      ? { ok: true, json: async () => ({ pages: 1, chunks: 1 }) }
      : { ok: false, status: 502, json: async () => ({ detail: "Gemini request failed: API key not valid" }) }
  );
  const input = await uploadPdf();
  fireEvent.change(input, { target: { value: "hi" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(await screen.findByText(/API key not valid/)).toBeInTheDocument();
});

test("a plain-text server error still gives a readable message", async () => {
  mockFetch(async (url) =>
    url.endsWith("/upload")
      ? { ok: true, json: async () => ({ pages: 1, chunks: 1 }) }
      : { ok: false, status: 500, json: async () => { throw new SyntaxError("Unexpected token"); } }
  );
  const input = await uploadPdf();
  fireEvent.change(input, { target: { value: "hi" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(await screen.findByText(/Request failed \(HTTP 500\)/)).toBeInTheDocument();
});

test("explains when the backend is not running", async () => {
  mockFetch(async () => {
    throw new TypeError("Failed to fetch");
  });
  render(<App />);
  choosePdf();
  expect(await screen.findByText(/Cannot reach the backend/)).toBeInTheDocument();
});
