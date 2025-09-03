# tam-filesystem-mcp

**Enhanced MCP filesystem server with Obsidian-aware task and prompt management for [Tam](https://tam.buzz/) workflows**

## Overview

This project extends the canonical MCP filesystem server to create a task-centric workflow system specifically designed for Obsidian vaults. It focuses on intelligent prompt management and task workflow integration, transforming a basic file server into a knowledge management assistant that understands the semantic structure of tasks, prompts, and their relationships.

**Based on**: [@modelcontextprotocol/server-filesystem](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) - All credit for the original filesystem server goes to Anthropic and the MCP team.

## Key Features

### 🎯 **Intelligent Prompt Management**

- **`get_prompted` function**: Discover, load, and dynamically process prompt templates
- **Fuzzy matching**: Find prompts by partial names, aliases, or content
- **Variable substitution**: Dynamic prompt generation with contextual variables
- **Obsidian integration**: Wikilink resolution, frontmatter parsing, template syntax

### 📋 **Task Workflow Integration**  

- **Task creation**: Generate tasks from templates with auto-populated metadata
- **Progress tracking**: Programmatic checklist management and completion analytics
- **Status analysis**: Comprehensive task metrics with next actions and blockers
- **Relationship mapping**: Bidirectional links between tasks and prompts

### 🔗 **Obsidian-Native Features**

- Wikilink syntax support: `[[prompt-name]]`
- YAML frontmatter parsing for metadata
- Templater template syntax processing
- Tag-based content discovery
- Alias resolution and fuzzy search

## Architecture

### Design Principles

1. **Extend, Don't Replace** - Build on canonical filesystem server foundation
2. **Obsidian-Native Integration** - Understand vault structure and conventions  
3. **Task-Centric Workflow** - Treat tasks as first-class semantic entities
4. **Intelligent Discovery** - Hierarchical search with fuzzy matching

### Project Structure

```text
tam-filesystem-mcp/
├── src/
│   ├── index.ts              # Main server with enhanced registration
│   ├── filesystem.ts         # Enhanced filesystem server class  
│   ├── prompts.ts           # Prompt management system
│   ├── tasks.ts             # Task workflow functions
│   ├── obsidian.ts          # Obsidian-specific utilities
│   ├── templates.ts         # Template processing engine
│   └── types.ts             # Type definitions
├── schemas/                  # JSON schemas for new tools
├── tests/                   # Comprehensive test suite
└── docs/                    # Documentation and examples
```

## Installation & Usage

### Prerequisites

- Node.js 18+
- TypeScript
- MCP-compatible client (e.g., Claude Desktop)

### Development Setup

```bash
# Clone repository
git clone https://github.com/tambuzztam/tam-filesystem-mcp.git
cd tam-filesystem-mcp

# Install dependencies
npm install

# Build project
npm run build

# Run in development mode
npm run dev /path/to/vault

# Run tests
npm test
```

### Usage with MCP Clients

```bash
# Start server with vault directory
tam-filesystem-mcp /path/to/obsidian/vault
```

## Enhanced Tools

### `get_prompted`

**The flagship function** - Intelligently discover, load, and process prompt templates

```typescript
// Basic usage
get_prompted("transcript indexing")

// With variables  
get_prompted("session-analysis", {
  client_name: "Marvin",
  session_date: "2025-09-03", 
  focus_areas: ["consciousness", "religious-critique"]
})

// With options
get_prompted("complex-analysis", variables, {
  includeWikilinks: true,
  processTemplater: true,
  searchPaths: ["tasks/prompts", "utilities/templates"]
})
```

### Task Management Tools

- **`create_task`** - Create tasks from templates with auto-populated metadata
- **`update_task_progress`** - Programmatic checklist item completion tracking  
- **`get_task_status`** - Comprehensive task analytics and next actions
- **`link_task_to_prompt`** - Bidirectional task-prompt relationship mapping

## Use Cases

### Philosophical Counseling Workflow

```typescript
// Load contextual prompt for session processing
const indexPrompt = await get_prompted("transcript indexing prompt", {
  session_date: "2025-07-15",
  client_name: "Marvin", 
  session_number: 50
});

// Update task progress programmatically  
await update_task_progress("Marvin-Transcript-Indexing", {
  "Index 2025-07-15 session": true
});

// Get comprehensive task status
const status = await get_task_status("Marvin-Transcript-Indexing");
console.log(\`Completion: \${status.completionPercentage}%\`);
```

## Development Status

🚧 **Current Phase: Project Setup Complete**

- [x] ✅ Project structure and configuration
- [x] ✅ Type definitions and architecture  
- [x] ✅ Enhanced server framework
- [x] ✅ Tool registration and routing
- [ ] 🔄 Core prompt system implementation
- [ ] 🔄 Obsidian integration features
- [ ] 🔄 Task management functions
- [ ] 🔄 Template processing engine
- [ ] 🔄 Comprehensive test suite

### Implementation Roadmap

**Phase 1: Core Prompt System**

- Basic variable substitution
- Frontmatter parsing for prompt metadata  
- Fuzzy search for prompt discovery

**Phase 2: Obsidian Integration**

- Wikilink resolution capability
- Templater syntax processing
- Alias-based prompt discovery
- Tag-based prompt filtering

**Phase 3: Task Management**  

- Task creation with template integration
- Checklist parsing and progress tracking
- Task status analytics and completion metrics
- Task-prompt relationship system

**Phase 4: Advanced Features**

- Prompt usage tracking and analytics
- Task dependency mapping
- Automated task generation
- Prompt recommendation system

## Contributing

This project is designed for the Death of Socrates philosophical counseling vault workflow. Contributions should align with the task-centric, Obsidian-aware architecture outlined in the design document.

## License

MIT License - Based on the canonical MCP filesystem server by Anthropic.

## Attribution  

This server is built upon the excellent work from the [ModelContextProtocol servers repository](https://github.com/modelcontextprotocol/servers), specifically the filesystem server implementation. All credit for the original filesystem server foundation goes to Anthropic and the MCP team.
