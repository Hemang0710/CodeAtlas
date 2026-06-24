"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircleQuestion, X, Send, Bot, User } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "bot";
  content: string;
}

const HELP_RESPONSES: Record<string, string> = {
  index:
    "To index a repository, paste a GitHub URL on the homepage and click 'Index'. The worker will clone, parse, and embed the code automatically.",
  search:
    "Use the Search tab on any indexed repo page. It supports both semantic and keyword search across all code chunks.",
  chat: "Open the Chat tab on a repo page to ask natural-language questions. The AI will retrieve relevant code and answer with file:line citations.",
  architecture:
    "Visit the Architecture tab to see an auto-generated Mermaid diagram of the repo's file dependencies.",
  error:
    "If indexing fails, check that Redis is running (`docker compose up -d`) and that your DATABASE_URL is correct. Check the job status on the repo page for error details.",
  guide:
    "The Guide tab generates an onboarding walkthrough of the repo — great for understanding a new codebase quickly.",
};

function getBotResponse(input: string): string {
  const lower = input.toLowerCase();

  for (const [keyword, response] of Object.entries(HELP_RESPONSES)) {
    if (lower.includes(keyword)) return response;
  }

  if (lower.includes("help") || lower.includes("what can")) {
    return "I can help with: indexing repos, searching code, chatting with AI about code, viewing architecture diagrams, and troubleshooting errors. Ask about any of these!";
  }

  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Hello! I'm the CodeAtlas help assistant. Ask me about indexing, searching, chatting, architecture diagrams, or troubleshooting.";
  }

  return "I'm not sure about that. Try asking about: indexing, search, chat, architecture, guide, or error troubleshooting. For complex code questions, use the Chat tab on an indexed repo.";
}

export function HelpChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "bot",
      content:
        "Hi! I'm the CodeAtlas help bot. Ask me how to index a repo, search code, use the AI chat, or troubleshoot issues.",
    },
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    const botMsg: Message = {
      id: crypto.randomUUID(),
      role: "bot",
      content: getBotResponse(trimmed),
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput("");
  }

  return (
    <>
      {isOpen && (
        <div className="fixed bottom-20 right-4 z-[90] w-80 sm:w-96 rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 flex flex-col max-h-[28rem]">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-amber-500" />
              <span className="font-semibold text-sm">Help Assistant</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Close help chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "bot" && (
                  <Bot className="h-5 w-5 shrink-0 text-amber-500 mt-1" />
                )}
                <div
                  className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${
                    msg.role === "user"
                      ? "bg-amber-500 text-white"
                      : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <User className="h-5 w-5 shrink-0 text-amber-500 mt-1" />
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="border-t border-zinc-200 dark:border-zinc-700 p-3 flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about CodeAtlas..."
              className="flex-1 rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-zinc-700"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-lg bg-amber-500 p-2 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-4 right-4 z-[90] rounded-full bg-amber-500 p-3 text-white shadow-lg hover:bg-amber-600 hover:scale-105 active:scale-95 transition-all"
        aria-label={isOpen ? "Close help chat" : "Open help chat"}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircleQuestion className="h-6 w-6" />
        )}
      </button>
    </>
  );
}
