---
title: "message-extractor"
date: 2026-08-18
description: "A Rust system for extracting, watching, and visualizing conversations from 7+ AI coding assistants in real time — a core extraction library, an SSE-streaming watcher service, and a Yew/WASM web UI for search and filtering."
extra:
  repo: "https://github.com/89jobrien/message-extractor"
---

# Message Extractor

A Rust-based system for extracting, monitoring, and visualizing conversations from AI coding assistants in real-time.

## Overview

Message Extractor provides a complete solution for working with AI assistant conversations:

1. **Core Library** (`message-extractor`): Extract messages from 7+ AI assistants
2. **Watcher Service** (`message-watcher`): Monitor files and stream updates via SSE
3. **Web UI** (`frontend`): Real-time visualization with search and filtering

**Why this exists**: If you use multiple AI coding assistants, you might want to aggregate their conversations, search across them, or analyze usage patterns. This project makes that easy.

```text
┌──────────┐    ┌─────────────────┐    ┌──────────────┐
│ Session  │───▶│ message-watcher │───▶│   Browser    │
│  Files   │    │   (Rust + SSE)  │    │ (Yew + WASM) │
└──────────┘    └─────────────────┘    └──────────────┘
  .jsonl/.json     File watching         Real-time UI
```

## Quick Start (Full System)

Get the complete system running in 2 minutes:

```bash
# 1. Clone and build
git clone https://github.com/yourusername/message-extractor.git
cd message-extractor
cargo build --release

# 2. Start backend (Terminal 1)
mise run watcher:run

# 3. Start frontend (Terminal 2)
cd frontend && mise exec -- trunk serve

# 4. Open browser
open http://localhost:8080
```

You'll see messages from all your AI assistants streaming in real-time! 🎉

## Features

### Core Library

- **Trait-based design** for extensible provider support
- **Async I/O** for efficient file processing
- **Type-safe** error handling with `thiserror`
- **7 provider implementations**:
  - Claude
  - Codex
  - Copilot
  - Gemini
  - OpenCode
  - Droid
  - Cursor

### Watcher Service

- **Real-time monitoring** with `notify` file watcher
- **Incremental reading** - only new messages, not entire files
- **SSE streaming** to multiple clients
- **Bounded history** prevents memory leaks
- **Concurrency control** prevents resource exhaustion

### Web Frontend

- **Live message feed** with auto-scroll
- **Filter by provider** (Claude, Cursor, etc.)
- **Search messages** with highlighting
- **Dark/Light mode** with localStorage persistence
- **Export to JSON** for filtered results
- **Session browser** explore all past conversations

## Use Cases

- **Cross-assistant search**: Find that snippet across all your AI tools
- **Usage analytics**: Track which assistants you use most
- **Conversation backup**: Keep all your AI interactions
- **Research**: Analyze conversation patterns
- **Debugging**: Monitor what messages are being sent

## System Components

### 📚 message-extractor (Library)

The core library that knows how to parse each AI assistant's session format.

**Location**: Root directory
**Documentation**: See [ARCHITECTURE.md](https://github.com/89jobrien/message-extractor/blob/main/ARCHITECTURE.md)

**Quick example:**

```rust
let registry = ExtractorRegistry::new();
let messages = registry
    .get(Provider::Claude)?
    .extract_messages(Path::new("session.jsonl"))
    .await?;
```

### 👁️ message-watcher (Service)

Real-time file watcher that monitors your AI assistant directories and broadcasts updates.

**Location**: `message-watcher/`
**Documentation**: [message-watcher/README.md](https://github.com/89jobrien/message-extractor/blob/main/message-watcher/README.md)

**Features:**

- Type-state pattern for lifecycle safety
- Bounded message history (10k limit)
- Semaphore-based concurrency control
- Path sanitization for PII protection

### 🖥️ frontend (Web UI)

Yew-based WebAssembly frontend for visualizing message streams.

**Location**: `frontend/`
**Documentation**: [frontend/README.md](https://github.com/89jobrien/message-extractor/blob/main/frontend/README.md)

**Features:**

- Real-time SSE connection
- Provider and text filtering
- Dark mode support
- Message export

## Installation

### Using the Library

Add this to your `Cargo.toml`:

```toml
[dependencies]
message-extractor = "0.1.0"
```

## Usage

```rust
use message_extractor::{ExtractorRegistry, Provider};
use std::path::Path;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create registry with all providers
    let registry = ExtractorRegistry::new();

    // Get extractor for a specific provider
    let extractor = registry
        .get(Provider::Claude)
        .expect("Claude extractor should be registered");

    // Extract messages from a session file
    let messages = extractor
        .extract_messages(Path::new("~/.claude/projects/session-123.jsonl"))
        .await?;

    // Process messages
    for msg in messages {
        println!("{:?}: {}", msg.role, msg.content);
        if let Some(ts) = msg.timestamp {
            println!("  at {}", ts);
        }
    }

    Ok(())
}
```

## Architecture

### Core Types

- **`SimpleMessage`**: Contains role, content, and optional timestamp
- **`MessageRole`**: Enum for User, Assistant, and System roles
- **`Provider`**: Enum for all supported providers

### Trait Design

The `MessageExtractor` trait defines the interface all providers implement:

```rust
#[async_trait]
pub trait MessageExtractor: Send + Sync {
    async fn extract_messages(&self, session_path: &Path) -> Result<Vec<SimpleMessage>>;
    fn provider(&self) -> Provider;
}
```

### Registry Pattern

The `ExtractorRegistry` provides a centralized way to access all provider extractors:

```rust
let registry = ExtractorRegistry::new();
let extractor = registry.get(Provider::Claude)?;
```

## Provider Details

### Claude

- **Format**: JSONL (line-delimited JSON)
- **Location**: `~/.claude/projects/*.jsonl`
- **Content**: Supports both string and array content blocks

### Codex

- **Format**: JSONL
- **Fields**: `role`, `content`, `timestamp`

### Copilot

- **Format**: JSON
- **Structure**: `{ "history": [...] }`
- **Timestamp**: Unix timestamp (seconds)

### Gemini

- **Format**: JSON
- **Structure**: `{ "contents": [...] }`
- **Content**: Parts array with text blocks

### OpenCode

- **Format**: JSONL
- **Fields**: `role`, `content`, `created_at`

### Droid

- **Format**: JSON
- **Structure**: `{ "messages": [...] }`

### Cursor

- **Format**: JSON
- **Structure**: `{ "conversation": [...] }`
- **Timestamp**: Unix timestamp (milliseconds)

## Helper Functions

### Filter Conversation

Remove system messages from a message list:

```rust
use message_extractor::filter_conversation;

let filtered = filter_conversation(messages);
// Only user and assistant messages remain
```

## Running the Example

```bash
cargo run --example extract tests/fixtures/claude_session.jsonl
```

## Running Tests

```bash
# Run all tests
cargo test

# Run with verbose output
cargo test -- --nocapture

# Run specific test
cargo test test_claude_extractor
```

## Development

### Building

```bash
cargo build
```

### Linting

```bash
cargo clippy
```

### Formatting

```bash
cargo fmt
```

## Extending

To add a new provider:

1. Create `src/providers/new_provider.rs`
2. Implement the `MessageExtractor` trait
3. Add to `src/providers/mod.rs`
4. Register in `ExtractorRegistry::new()`
5. Add test fixture in `tests/fixtures/`
6. Add integration test

Example:

```rust
use async_trait::async_trait;
use crate::extractor::MessageExtractor;
use crate::types::{SimpleMessage, Provider};
use crate::error::Result;

pub struct NewProviderExtractor;

#[async_trait]
impl MessageExtractor for NewProviderExtractor {
    async fn extract_messages(&self, session_path: &Path) -> Result<Vec<SimpleMessage>> {
        // Implementation here
    }

    fn provider(&self) -> Provider {
        Provider::NewProvider
    }
}
```

## Troubleshooting

### No Messages Appearing

**Problem**: Frontend shows "Waiting for messages..." but files exist.

**Solutions**:

1. Check if watcher is running:

   ```bash
   curl http://localhost:3030/health
   # Should return: OK
   ```

2. Check if your AI assistant files are in the expected locations:

   ```bash
   ls ~/.claude/projects/*.jsonl
   ls ~/.cursor/sessions/*.json
   # etc.
   ```

3. Check watcher logs for errors:

   ```bash
   # Look for "Failed to extract messages" or "Unknown provider"
   ```

4. Verify file extensions:
   - The watcher only processes `.json` and `.jsonl` files
   - Other extensions are silently skipped

### Connection Failed

**Problem**: Frontend shows "Connection error".

**Solutions**:

1. Verify backend is running on port 3030
2. Check for port conflicts:

   ```bash
   lsof -i :3030
   ```

3. Try restarting both backend and frontend

### High Memory Usage

**Problem**: Watcher using too much memory.

**Solutions**:

1. The message history is bounded to 10,000 messages by default
2. Reduce it in `message-watcher/src/config.rs`:

   ```rust
   max_history_size: 5_000  // Lower limit
   ```

3. Check for excessive file changes triggering many extractions

### Missing Providers

**Problem**: Some providers don't show up.

**Solutions**:

1. Verify the provider's directory exists
2. Check that you have session files in that directory
3. Ensure session files are valid JSON/JSONL

### Build Failures

**Problem**: `cargo build` fails.

**Solutions**:

1. Update Rust toolchain:

   ```bash
   rustup update stable
   ```

2. Clean and rebuild:

   ```bash
   cargo clean
   cargo build
   ```

3. Check that all dependencies are available

### Frontend Not Loading

**Problem**: Browser shows blank page.

**Solutions**:

1. Check browser console for errors
2. Verify WebAssembly is enabled
3. Clear browser cache
4. Rebuild frontend:

   ```bash
   cd frontend
   trunk clean
   trunk serve
   ```

## FAQ

**Q: Does this work with all AI assistants?**
A: Currently supports 7 assistants. See the [Contributing Guide](https://github.com/89jobrien/message-extractor/blob/main/CONTRIBUTING.md) to add more.

**Q: Is my data sent anywhere?**
A: No. Everything runs locally. The server binds to localhost only.

**Q: Can I filter messages before they're stored?**
A: Not yet, but this is a planned feature. Currently, filtering happens in the UI.

**Q: What's the performance impact?**
A: Minimal. The watcher uses incremental reading and bounded concurrency.

**Q: Can I run this on a server?**
A: Yes, but you must add authentication first. See the [watcher documentation](https://github.com/89jobrien/message-extractor/blob/main/message-watcher/README.md).

**Q: How do I export all my conversations?**
A: Use the "EXPORT" button in the UI, or use the library directly:

```rust
let messages = registry.get(provider)?.extract_messages(path).await?;
let json = serde_json::to_string_pretty(&messages)?;
std::fs::write("export.json", json)?;
```

## Further Reading

- [Architecture Overview](https://github.com/89jobrien/message-extractor/blob/main/ARCHITECTURE.md) - Deep dive into system design
- [Contributing Guide](https://github.com/89jobrien/message-extractor/blob/main/CONTRIBUTING.md) - How to contribute
- [Watcher Documentation](https://github.com/89jobrien/message-extractor/blob/main/message-watcher/README.md) - Service details
- [Frontend Documentation](https://github.com/89jobrien/message-extractor/blob/main/frontend/README.md) - UI features

## License

MIT

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](https://github.com/89jobrien/message-extractor/blob/main/CONTRIBUTING.md) for guidelines.
