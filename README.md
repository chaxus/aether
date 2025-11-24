# RSC Project Implementation Analysis

> **Note**: Development of AI SDK RSC is currently paused. For more information, see [Migrating from AI SDK RSC](https://sdk.vercel.ai/docs/ai-sdk-rsc/migrating-to-ui#background).

This is a React Server Components (RSC) project based on **Next.js 14** and **Vercel AI SDK**, demonstrating how to stream AI-generated React components to the client in real-time.

## Project Overview

This example demonstrates how to use the [Vercel AI SDK](https://sdk.vercel.ai/docs) with [Next.js](https://nextjs.org/) and the `streamUI` function to create generative user interfaces by streaming React Server Components to the client.

## Tech Stack

- **Next.js 14.2.5** - Using App Router
- **Vercel AI SDK 3.3.20** - RSC support
- **React 18** - Server Components support
- **OpenAI SDK** - LLM interaction
- **TypeScript** - Type safety
- **Zod** - Parameter validation

## Quick Start

### Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fai-sdk-preview-rsc-genui&env=OPENAI_API_KEY&envDescription=API%20keys%20needed%20for%20application&envLink=platform.openai.com)

### Run Locally

Run [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example https://github.com/vercel-labs/ai-sdk-preview-rsc-genui ai-sdk-preview-rsc-genui-example
```

```bash
yarn create next-app --example https://github.com/vercel-labs/ai-sdk-preview-rsc-genui ai-sdk-preview-rsc-genui-example
```

```bash
pnpm create next-app --example https://github.com/vercel-labs/ai-sdk-preview-rsc-genui ai-sdk-preview-rsc-genui-example
```

To run the example locally you need to:

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
  initialAIState: { chatId, messages: [] },
  initialUIState: [],
  actions: { sendMessage },
  onSetAIState: async ({ state, done }) => {
    /* persist state */
  },
});
```

**b) Server Action - sendMessage**

```typescript
const sendMessage = async (message: string) => {
  "use server";  // Next.js Server Action marker

  const messages = getMutableAIState<typeof AI>("messages");
  messages.update([...cleanMessages, { role: "user", content: message }]);

  // Create streamable text value
  const contentStream = createStreamableValue("");
  const textComponent = <TextStreamMessage content={contentStream.value} />;

  // Use streamUI to stream UI
  const { value: stream } = await streamUI({
    model: customOpenAI("gpt-4o"),
    messages: messages.get(),
    text: async function* ({ content, done }) {
      // Stream text content
      if (done) {
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
    description: "view current active cameras",
    parameters: z.object({}),
    generate: async function* ({}) {
      // Update message history
      messages.done([...messages, toolCall, toolResult]);

      // Return React Server Component
      return <Message role="assistant" content={<CameraView />} />;
    },
  },
  // ... other tools
}
```

#### `app/(preview)/layout.tsx` - AI Context Provider

```typescript
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AI>{children}</AI>  {/* Provide AI context */}
      </body>
    </html>
  );
}
```

#### `app/(preview)/page.tsx` - Client Component

```typescript
"use client";

export default function Home() {
  const { sendMessage } = useActions();  // Get actions from AI context

  const [messages, setMessages] = useState<Array<ReactNode>>([]);

  // Call Server Action
  const response: ReactNode = await sendMessage(input);
  setMessages((messages) => [...messages, response]);

  return (
    <div>
      {messages.map((message) => message)}  {/* Render streamed components */}
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
2. Defines `parameters` - Uses Zod schema for parameter validation
3. Implements `generate` - Generator function returns RSC

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

This project demonstrates how to combine AI with React Server Components to achieve:

- **Streaming** - Real-time UI updates
- **Dynamic Generation** - LLM decides what components to render
- **Type Safety** - Full TypeScript support
- **Server-first** - Leverages RSC advantages

This is a typical use case of Vercel AI SDK RSC functionality, especially suitable for applications that need to dynamically generate complex UIs based on AI responses.

## Learn More

To learn more about Vercel AI SDK or Next.js take a look at the following resources:

- [Vercel AI SDK docs](https://sdk.vercel.ai/docs)
- [Vercel AI Playground](https://play.vercel.ai)
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API

---

[中文版本](./README.zh.md)
