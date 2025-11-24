# Aether

> **Language**: [English](./README.md) | [中文](./README.zh.md)

> **Note**: Development of AI SDK RSC is currently paused. For more information, see [Migrating from AI SDK RSC](https://sdk.vercel.ai/docs/ai-sdk-rsc/migrating-to-ui#background).

**Aether** is a React Server Components (RSC) project built with **Next.js** and **Vercel AI SDK**, demonstrating how to stream AI-generated React components to the client in real-time. Like the ethereal medium that connects the heavens, Aether seamlessly bridges AI intelligence with dynamic user interfaces.

## Project Overview

Aether demonstrates how to use the [Vercel AI SDK](https://sdk.vercel.ai/docs) with [Next.js](https://nextjs.org/) and the `streamUI` function to create generative user interfaces by streaming React Server Components to the client. The project showcases real-time AI-driven UI generation, where components flow effortlessly from server to client.

## Tech Stack

- **Next.js 16.0.3** - Using App Router
- **Vercel AI SDK 5.0.101** - RSC support
- **React 19** - Server Components support
- **@ai-sdk/openai 2.0.71** - LLM interaction
- **TypeScript** - Type safety
- **Zod 4.1.13** - Parameter validation

## Quick Start

1. Sign up for accounts with the AI providers you want to use (e.g., OpenAI, Anthropic).
2. Obtain API keys for each provider.
3. Set the required environment variables as shown in the `.env.example` file, but in a new file called `.env`.
4. `npm install` to install the required dependencies.
5. `npm run dev` to launch the development server.

## Core Implementation

### 1. Architecture

```
Client Component
    ↓
Call Server Action (sendMessage)
    ↓
Server Action uses streamUI
    ↓
LLM decides to call Tools
    ↓
Tools return React Server Component
    ↓
Components streamed to client
    ↓
Client renders in real-time
```

### 2. Key Files

#### `app/(preview)/actions.tsx` - Core Implementation

This is the core of the entire project, implementing the RSC streaming mechanism:

**a) AI Context Creation**

```typescript
export const AI = createAI<AIState, UIState>({
  initialAIState: {
    chatId: generateId(),
    messages: [],
  },
  initialUIState: [],
  actions: { sendMessage },
  onSetAIState: async ({ key, state, done }) => {
    'use server';
    if (done) {
      // save to database
    }
  },
});
```

**b) Server Action - sendMessage**

```typescript
const sendMessage = async (message: string) => {
  'use server';  // Next.js Server Action marker

  const messages = getMutableAIState<typeof AI>('messages');

  // Clean up any empty assistant messages
  const currentMessages = messages.get() as ModelMessage[];
  const cleanMessages = currentMessages.filter(
    (msg) => !(msg.role === 'assistant' && (!msg.content ||
      (typeof msg.content === 'string' && msg.content.trim() === '')))
  );

  messages.update([...cleanMessages, { role: 'user', content: message }]);

  // Create streamable text value
  const contentStream = createStreamableValue('');
  const textComponent = <TextStreamMessage content={contentStream.value} />;

  // Create custom OpenAI client
  const customOpenAI = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL + '/v1',
  });

  // Use streamUI to stream UI
  const { value: stream } = await streamUI({
    model: customOpenAI('gpt-4o'),
    system: 'you are a friendly home automation assistant',
    messages: messages.get() as ModelMessage[],
    text: async function* ({ content, delta, done }) {
      // Stream text content
      if (done) {
        if (content && content.trim()) {
          messages.done([...(messages.get() as ModelMessage[]),
            { role: 'assistant', content }]);
        }
        contentStream.done();
      } else {
        contentStream.update(content);
      }
      return textComponent;
    },
    tools: { /* tool definitions */ }
  });

  return stream;
};
```

**c) Tools Definition - Return RSC**

Each tool is a generator function that returns a React Server Component:

```typescript
tools: {
  viewCameras: {
    description: 'view current active cameras',
    inputSchema: z.object({}),
    generate: async function* (_input, { toolName, toolCallId }) {
      // Return React Server Component
      return <Message role="assistant" content={<CameraView />} />;
    },
  },
  viewHub: {
    description: 'view the hub that contains current quick summary and actions',
    inputSchema: z.object({}),
    generate: async function* (_input, { toolName, toolCallId }) {
      return <Message role="assistant" content={<HubView hub={hub} />} />;
    },
  },
  // ... other tools
}
```

#### `app/(preview)/layout.tsx` - AI Context Provider

```typescript
import { Toaster } from 'sonner';
import { AI } from './actions';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Toaster position="top-center" richColors />
        <AI>{children}</AI>  {/* Provide AI context */}
      </body>
    </html>
  );
}
```

#### `app/(preview)/page.tsx` - Client Component

```typescript
'use client';

import { useActions } from '@ai-sdk/rsc';
import { Message } from '@/components/message';

export default function Home() {
  const { sendMessage } = useActions();  // Get actions from AI context

  const [input, setInput] = useState<string>('');
  const [messages, setMessages] = useState<Array<ReactNode>>([]);

  // Call Server Action
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setMessages((messages) => [
      ...messages,
      <Message key={messages.length} role="user" content={input} />
    ]);
    setInput('');

    const response: ReactNode = await sendMessage(input);
    setMessages((messages) => [...messages, response]);
  };

  return (
    <div>
      {messages.map((message, index) => (
        <React.Fragment key={index}>{message}</React.Fragment>
      ))}
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a message..."
        />
      </form>
    </div>
  );
}
```

### 3. Key Technologies

#### a) `createStreamableValue` - Streamable Values

Used to stream text content:

```typescript
const contentStream = createStreamableValue('');
contentStream.update(content); // Update value
contentStream.done(); // Complete stream
```

Client uses `useStreamableValue` hook to subscribe to updates:

```typescript
const [text] = useStreamableValue(content);
```

#### b) `streamUI` - Streaming UI Generation

This is the core function of Vercel AI SDK, allowing:

- Streaming text content
- Streaming React Server Components
- Dynamic UI generation through tool calls

#### c) `getMutableAIState` - State Management

Used to access and update AI state in Server Actions:

```typescript
const messages = getMutableAIState<typeof AI>('messages');
messages.get(); // Get current state
messages.update(); // Update state
messages.done(); // Complete state update
```

#### d) Tools System

Each tool:

1. Defines `description` - LLM understands tool purpose
2. Defines `inputSchema` - Uses Zod schema for parameter validation
3. Implements `generate` - Generator function that receives input and tool metadata, returns RSC

The `generate` function signature:

```typescript
generate: async function* (input, { toolName, toolCallId }) => {
  // input: validated parameters based on inputSchema
  // toolName: name of the tool being called
  // toolCallId: unique ID for this tool call
  return <ReactServerComponent />;
}
```

The LLM automatically decides which tool to call based on user input.

### 4. Data Flow

```
User Input
  ↓
Client calls sendMessage(input)
  ↓
Server Action executes
  ↓
streamUI starts interacting with LLM
  ↓
LLM generates text → Streamed through text function
  ↓
LLM decides to call tool → Tool returns RSC
  ↓
RSC streamed to client
  ↓
Client renders component in real-time
```

### 5. Component Types

The project has two types of components:

**a) Server Components** (default)

- `CameraView`, `HubView`, `UsageView`, etc.
- Rendered on the server
- Can directly access server resources

**b) Client Components** (`"use client"`)

- `page.tsx`, `message.tsx`, etc.
- Components that need interactivity
- Use hooks and event handlers

### 6. Advantages

1. **Real-time** - Components streamed without waiting for complete response
2. **Type Safety** - TypeScript + Zod parameter validation
3. **Dynamic UI** - LLM dynamically generates UI based on context
4. **Server-side Rendering** - Reduces client burden
5. **State Management** - Automatically manages conversation history

### 7. Workflow Example

User input: "Show me my smart home hub"

1. `sendMessage` is called
2. `streamUI` starts interacting with LLM
3. LLM identifies need to call `viewHub` tool
4. `viewHub.generate` executes:
   - Updates message history
   - Returns `<Message content={<HubView hub={hub} />} />`
5. Component streamed to client
6. Client renders `HubView` component

## Summary

Aether demonstrates how to combine AI with React Server Components to achieve:

- **Streaming** - Real-time UI updates that flow seamlessly
- **Dynamic Generation** - LLM decides what components to render
- **Type Safety** - Full TypeScript support
- **Server-first** - Leverages RSC advantages

This is a typical use case of Vercel AI SDK RSC functionality, especially suitable for applications that need to dynamically generate complex UIs based on AI responses. Aether serves as a bridge between AI intelligence and user experience, enabling fluid, real-time interactions.

## Learn More

To learn more about Vercel AI SDK or Next.js take a look at the following resources:

- [Vercel AI SDK docs](https://sdk.vercel.ai/docs)
- [Vercel AI Playground](https://play.vercel.ai)
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
