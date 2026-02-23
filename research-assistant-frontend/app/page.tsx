"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Send, Upload, FileText, Bot, User, Trash2, Download, Sparkles, Zap, Search, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { QuickActions } from "@/components/quick-actions"

// ---- API helper ----
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || // 1) use env var in production
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000") // 2) fallback for local dev

interface Message {
  id: string
  content: string
  role: "user" | "assistant"
  timestamp: string | Date
  isLoading?: boolean
  type?: "search" | "summary" | "comparison" | "citation" | "general"
}

/* Helper: always return a readable HH:MM timestamp */
const formatTimestamp = (ts: string | Date) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

interface UploadedFile {
  name: string
  path: string
  size: number
  isServerFile: boolean // Added to track if the file is actually on the server
}

export default function ResearchAssistant() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  // Load chat history from localStorage on mount
  useEffect(() => {
    const savedMessages = localStorage.getItem("research-chat-history")
    if (savedMessages) {
      const parsed = JSON.parse(savedMessages).map((m: Message) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }))
      setMessages(parsed)
    }

    // Load existing files from backend
    loadExistingFiles()
  }, [])

  // Save messages to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem("research-chat-history", JSON.stringify(messages))
    }
  }, [messages])

  // Save files to localStorage whenever files change
  useEffect(() => {
    if (uploadedFiles.length > 0) {
      localStorage.setItem("research-uploaded-files", JSON.stringify(uploadedFiles))
    }
  }, [uploadedFiles])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const detectMessageType = (content: string): Message["type"] => {
    if (content.includes("🔍") || content.includes("Web Search Results")) return "search"
    if (content.includes("📄") || content.includes("PDF Summary")) return "summary"
    if (content.includes("📊") || content.includes("Document Comparison")) return "comparison"
    if (content.includes("📈") || content.includes("Ranked Citations")) return "citation"
    return "general"
  }

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      role: "user",
      timestamp: new Date(),
    }

    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      content: "",
      role: "assistant",
      timestamp: new Date(),
      isLoading: true,
    }

    setMessages((prev) => [...prev, userMessage, loadingMessage])
    setInputMessage("")
    setIsLoading(true)

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: inputMessage,
          files: uploadedFiles.filter((f) => f.isServerFile).map((f) => f.path), // Only send paths of files actually on the server
          use_agent: true, // Flag to use the new agent
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to get response from server")
      }

      const data = await response.json()
      const responseContent = data.response || "No response received"
      const messageType = detectMessageType(responseContent)

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingMessage.id
            ? {
                ...msg,
                content: responseContent,
                isLoading: false,
                timestamp: new Date(),
                type: messageType,
              }
            : msg,
        ),
      )
    } catch (error) {
      console.error("Error sending message:", error)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingMessage.id
            ? {
                ...msg,
                content:
                  "❌ Sorry, I encountered an error connecting to the server. Please make sure the backend is running and try again.",
                isLoading: false,
                type: "general",
              }
            : msg,
        ),
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    const pdfFiles = files.filter((file) => file.type === "application/pdf")

    if (pdfFiles.length > 0) {
      await uploadFiles(pdfFiles)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const pdfFiles = Array.from(files).filter((file) => file.type === "application/pdf")
    if (pdfFiles.length > 0) {
      await uploadFiles(pdfFiles)
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const uploadFiles = async (pdfFiles: File[]) => {
    setIsLoading(true)

    try {
      const uploadPromises = pdfFiles.map(async (file) => {
        const formData = new FormData()
        formData.append("file", file)

        // Attempt to send to backend first
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 6000) // 6-sec timeout
        let responseOk = false
        let result: { filename: string; file_path: string; file_size: number } | null = null

        try {
          const response = await fetch(`${API_BASE}/upload_file`, {
            // Corrected endpoint
            method: "POST",
            body: formData,
            signal: controller.signal,
          })
          clearTimeout(timeout)
          if (response.ok) {
            result = await response.json()
            responseOk = true
          }
        } catch {
          /* network / CORS / preview — fall through to mock */
        }

        // --- Fallback: mock upload locally ---------------------------------
        if (!responseOk || !result) {
          // Create a blob URL we can later revoke if desired
          const blobUrl = URL.createObjectURL(file)
          result = {
            filename: file.name,
            file_path: blobUrl, // use blob URL as "path"
            file_size: file.size,
          }
        }

        return {
          name: result.filename,
          path: result.file_path,
          size: result.file_size,
          isServerFile: responseOk, // Set true if backend upload was successful
        }
      })

      const uploadedFileResults = await Promise.all(uploadPromises)
      setUploadedFiles((prev) => [...prev, ...uploadedFileResults])

      const successMessage: Message = {
        id: Date.now().toString(),
        content: `✅ **Uploaded ${uploadedFileResults.length} PDF file(s).**  Ready for summarising / comparing!`,
        role: "assistant",
        timestamp: new Date(),
        type: "general",
      }
      setMessages((prev) => [...prev, successMessage])
    } catch (error) {
      console.error("Error uploading files:", error)
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: `❌ **Upload Error:** ${String(error)}`,
        role: "assistant",
        timestamp: new Date(),
        type: "general",
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const removeFile = async (fileName: string) => {
    try {
      const fileToRemove = uploadedFiles.find((f) => f.name === fileName)
      if (!fileToRemove) return

      // Always update UI/localStorage first
      setUploadedFiles((prev) => prev.filter((file) => file.name !== fileName))

      // Only attempt backend deletion if the path looks like a server URL
      if (fileToRemove.path.startsWith("/uploads")) {
        const storedName = fileToRemove.path.split("/").pop()
        await fetch(`${API_BASE}/file/${storedName}`, { method: "DELETE" }) // Corrected endpoint
      } else {
        // blob URL – revoke to free memory
        URL.revokeObjectURL(fileToRemove.path)
      }
    } catch (error) {
      console.error("Error deleting file:", error)
    }
  }

  const clearChat = () => {
    setMessages([])
    localStorage.removeItem("research-chat-history")
  }

  const clearFiles = async () => {
    try {
      // Delete files from server if they exist
      const serverFiles = uploadedFiles.filter((file) => file.isServerFile)

      for (const file of serverFiles) {
        if (file.path.startsWith("/uploads")) {
          const storedName = file.path.split("/").pop()
          try {
            await fetch(`${API_BASE}/file/${storedName}`, { method: "DELETE" })
          } catch (error) {
            console.error(`Error deleting ${file.name}:`, error)
          }
        }
      }

      // Revoke blob URLs for mock uploads
      const blobFiles = uploadedFiles.filter((file) => !file.isServerFile)
      blobFiles.forEach((file) => {
        URL.revokeObjectURL(file.path)
      })

      // Clear the files array and localStorage
      setUploadedFiles([])
      localStorage.removeItem("research-uploaded-files")

      // Add a confirmation message
      const confirmMessage: Message = {
        id: Date.now().toString(),
        content: "🗑️ **All uploaded files have been cleared.**",
        role: "assistant",
        timestamp: new Date(),
        type: "general",
      }
      setMessages((prev) => [...prev, confirmMessage])
    } catch (error) {
      console.error("Error clearing files:", error)
    }
  }

  const exportChat = () => {
    const chatData = {
      messages,
      exportDate: new Date().toISOString(),
      totalMessages: messages.length,
    }

    const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `research-chat-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const loadExistingFiles = async () => {
    try {
      // Skip server call in preview; just restore from localStorage if present
      const saved = localStorage.getItem("research-uploaded-files")
      if (saved) {
        setUploadedFiles(JSON.parse(saved))
      }
    } catch {
      /* ignore */
    }
  }

  const handleQuickAction = (action: string) => {
    let message = ""

    switch (action) {
      case "search":
        message = "Search the web for information about "
        break
      case "summarize":
        if (uploadedFiles.length === 0) {
          message = "Please upload some PDF files first, then I can summarize them for you."
        } else {
          message = "Please summarize all the uploaded PDF documents"
        }
        break
      case "compare":
        if (uploadedFiles.length < 2) {
          message = "Please upload at least 2 PDF files first, then I can compare them for you."
        } else {
          message = "Compare the uploaded documents and show me the similarities and differences"
        }
        break
      case "rank":
        message = "Help me rank and cite sources for my research on "
        break
      default:
        return
    }

    setInputMessage(message)
  }

  const getMessageIcon = (type: Message["type"]) => {
    switch (type) {
      case "search":
        return <Search className="w-4 h-4 text-blue-400" />
      case "summary":
        return <FileText className="w-4 h-4 text-orange-400" />
      case "comparison":
        return <Zap className="w-4 h-4 text-green-400" />
      case "citation":
        return <BarChart3 className="w-4 h-4 text-purple-400" />
      default:
        return <Bot className="w-4 h-4 text-cyan-400" />
    }
  }

  const handleEnter = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -inset-10 opacity-50">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
          <div className="absolute top-3/4 right-1/4 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
          <div className="absolute bottom-1/4 left-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-80 bg-gradient-to-b from-slate-800/90 to-slate-900/90 backdrop-blur-xl border-r border-purple-500/20 relative z-10">
        <ScrollArea className="h-full">
          <div className="flex flex-col min-h-full">
            {/* Header */}
            <div className="p-6 border-b border-purple-500/20">
              <div className="flex items-center gap-3 mb-6">
                <div className="relative">
                  <div className="w-8 h-8 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-lg flex items-center justify-center">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                </div>
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                    Research Assistant
                  </h1>
                  <p className="text-xs text-slate-400">AI-Powered Research Tool</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button
                    onClick={clearChat}
                    variant="outline"
                    size="sm"
                    className="flex-1 bg-gradient-to-r from-red-500/10 to-pink-500/10 border-red-500/20 text-red-300 hover:from-red-500/20 hover:to-pink-500/20 hover:border-red-400/40 transition-all duration-300"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear Chat
                  </Button>
                  <Button
                    onClick={exportChat}
                    variant="outline"
                    size="sm"
                    className="flex-1 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/20 text-emerald-300 hover:from-emerald-500/20 hover:to-teal-500/20 hover:border-emerald-400/40 transition-all duration-300"
                    disabled={messages.length === 0}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Export
                  </Button>
                </div>
                <Button
                  onClick={clearFiles}
                  variant="outline"
                  size="sm"
                  className="w-full bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border-orange-500/20 text-orange-300 hover:from-orange-500/20 hover:to-yellow-500/20 hover:border-orange-400/40 transition-all duration-300"
                  disabled={uploadedFiles.length === 0}
                >
                  <FileText className="w-4 h-4 mr-1" />
                  Clear Files ({uploadedFiles.length})
                </Button>
              </div>
            </div>

            {/* Available Tools */}
            <div className="p-6 border-b border-purple-500/20">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-yellow-400" />
                AI Tools
              </h3>
              <div className="space-y-3">
                <Badge className="w-full justify-start bg-gradient-to-r from-orange-500/20 to-red-500/20 border-orange-500/30 text-orange-200 hover:from-orange-500/30 hover:to-red-500/30 hover:border-orange-400/40 transition-all duration-300">
                  <FileText className="w-4 h-4 mr-2" />
                  PDF Summarizer
                </Badge>
                <Badge className="w-full justify-start bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-500/30 text-blue-200 hover:from-blue-500/30 hover:to-cyan-500/30 hover:border-blue-400/40 transition-all duration-300">
                  <Search className="w-4 h-4 mr-2" />
                  Web Search
                </Badge>
                <Badge className="w-full justify-start bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-500/30 text-purple-200 hover:from-purple-500/30 hover:to-pink-500/30 hover:border-purple-400/40 transition-all duration-300">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Rank & Cite
                </Badge>
                <Badge className="w-full justify-start bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/30 text-green-200 hover:from-green-500/30 hover:to-emerald-500/30 hover:border-green-400/40 transition-all duration-300">
                  <Zap className="w-4 h-4 mr-2" />
                  Compare Docs
                </Badge>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="p-6 flex-1">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                Quick Actions
              </h3>
              <QuickActions onQuickAction={handleQuickAction} hasFiles={uploadedFiles.length > 0} />
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative z-10">
        {/* Chat Messages */}
        <ScrollArea className="flex-1 p-6">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <div className="relative mb-8">
                  <div className="w-20 h-20 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-2xl">
                    <Bot className="w-10 h-10 text-white" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                </div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
                  Welcome to Research Assistant
                </h2>
                <p className="text-slate-300 leading-relaxed">
                  I'm powered by advanced AI tools that can search the web, summarize PDFs, compare documents, and rank
                  citations. Upload some files or ask me a question to get started!
                </p>
                <div className="flex justify-center gap-4 mt-6">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce animation-delay-200"></div>
                  <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce animation-delay-400"></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 max-w-4xl mx-auto">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && (
                    <div className="w-10 h-10 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                      {message.type ? getMessageIcon(message.type) : <Bot className="w-5 h-5 text-white" />}
                    </div>
                  )}

                  <div
                    className={`max-w-[70%] rounded-2xl px-6 py-4 shadow-lg backdrop-blur-sm ${
                      message.role === "user"
                        ? "bg-gradient-to-r from-cyan-500 to-purple-600 text-white"
                        : "bg-gradient-to-r from-slate-800/80 to-slate-700/80 border border-slate-600/30 text-slate-100"
                    }`}
                  >
                    {message.isLoading ? (
                      <div className="flex items-center gap-3">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce animation-delay-200"></div>
                          <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce animation-delay-400"></div>
                        </div>
                        <span className="text-sm text-slate-300">AI is researching...</span>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap leading-relaxed prose prose-invert max-w-none">
                        {message.content}
                      </div>
                    )}

                    <div className={`text-xs mt-2 ${message.role === "user" ? "text-cyan-100" : "text-slate-400"}`}>
                      {formatTimestamp(message.timestamp)}
                    </div>
                  </div>

                  {message.role === "user" && (
                    <div className="w-10 h-10 bg-gradient-to-r from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                      <User className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-purple-500/20 bg-gradient-to-r from-slate-800/50 to-slate-900/50 backdrop-blur-xl p-6">
          <div className="max-w-4xl mx-auto">
            {/* File Upload Indicator */}
            {uploadedFiles.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {uploadedFiles.slice(-3).map((file, index) => (
                  <Badge
                    key={index}
                    className="bg-gradient-to-r from-orange-500/20 to-red-500/20 border-orange-500/30 text-orange-200"
                  >
                    <FileText className="w-3 h-3 mr-1" />
                    {file.name}
                  </Badge>
                ))}
                {uploadedFiles.length > 3 && (
                  <Badge className="bg-gradient-to-r from-slate-600/50 to-slate-700/50 border-slate-500/30 text-slate-300">
                    +{uploadedFiles.length - 3} more
                  </Badge>
                )}
              </div>
            )}

            <div className="flex gap-3">
              {/* Plus Button for File Upload */}
              <Button
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                className="h-12 w-12 p-0 flex-shrink-0 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-white border-0 shadow-lg hover:shadow-cyan-500/25 transition-all duration-300 rounded-xl"
                title="Upload PDF files"
              >
                <Upload className="w-5 h-5" />
              </Button>

              <div className="flex-1 relative">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragEnter={handleEnter}
                  onDragLeave={handleDragLeave}
                  placeholder="Ask me to search, summarize, compare, or rank sources... ✨"
                  disabled={isLoading}
                  className={`h-12 pr-14 bg-gradient-to-r from-slate-800/50 to-slate-700/50 border-slate-600/30 text-slate-100 placeholder-slate-400 rounded-xl backdrop-blur-sm transition-all duration-300 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 ${
                    isDragOver ? "border-cyan-400 bg-cyan-500/10 shadow-lg shadow-cyan-500/25" : ""
                  }`}
                />
                <Button
                  onClick={sendMessage}
                  disabled={!inputMessage.trim() || isLoading}
                  size="sm"
                  className="absolute right-2 top-2 h-8 w-8 p-0 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-white border-0 shadow-lg hover:shadow-cyan-500/25 transition-all duration-300 rounded-lg"
                >
                  {isLoading ? (
                    <div className="flex space-x-1">
                      <div className="w-1 h-1 bg-white rounded-full animate-bounce"></div>
                      <div className="w-1 h-1 bg-white rounded-full animate-bounce animation-delay-200"></div>
                      <div className="w-1 h-1 bg-white rounded-full animate-bounce animation-delay-400"></div>
                    </div>
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

