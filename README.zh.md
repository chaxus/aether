# Aether

> **语言**: [English](./README.md) | [中文](./README.zh.md)

> **注意**: AI SDK RSC 的开发目前暂停。更多信息请参阅 [从 AI SDK RSC 迁移](https://sdk.vercel.ai/docs/ai-sdk-rsc/migrating-to-ui#background)。

**Aether** 是一个基于 **Next.js** 和 **Vercel AI SDK** 构建的 React Server Components (RSC) 项目，展示了如何通过流式传输的方式将 AI 生成的 React 组件实时渲染到客户端。正如以太连接天地，Aether 无缝地连接 AI 智能与动态用户界面。

## 项目概述

Aether 演示了如何使用 [Vercel AI SDK](https://sdk.vercel.ai/docs) 与 [Next.js](https://nextjs.org/) 的 `streamUI` 函数，通过流式传输 React Server Components 到客户端来创建生成式用户界面。项目展示了实时 AI 驱动的 UI 生成，组件从服务器到客户端流畅传输。

## 核心技术栈

- **Next.js 16.0.3** - 使用 App Router
- **Vercel AI SDK 5.0.101** - 提供 RSC 支持
- **React 19** - 支持 Server Components
- **@ai-sdk/openai 2.0.71** - 与 LLM 交互
- **TypeScript** - 类型安全
- **Zod 4.1.13** - 参数验证

## 快速开始

1. 注册 AI 服务提供商账户（如 OpenAI、Anthropic）
2. 获取 API 密钥
3. 在 `.env` 文件中设置所需的环境变量（参考 `.env.example`）
4. 运行 `npm install` 安装依赖
5. 运行 `npm run dev` 启动开发服务器

## 核心实现原理

### 1. 架构设计

```
客户端 (Client Component)
    ↓
调用 Server Action (sendMessage)
    ↓
Server Action 使用 streamUI
    ↓
LLM 决定调用工具 (Tools)
    ↓
工具返回 React Server Component
    ↓
组件流式传输回客户端
    ↓
客户端实时渲染
```

### 2. 关键文件分析

#### `app/(preview)/actions.tsx` - 核心实现

这是整个项目的核心，实现了 RSC 的流式传输机制：

**a) AI 上下文创建**

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
      // 保存到数据库
    }
  },
});
```

**b) Server Action - sendMessage**

```typescript
const sendMessage = async (message: string) => {
  'use server';  // Next.js Server Action 标记

  const messages = getMutableAIState<typeof AI>('messages');

  // 清理任何空的助手消息
  const currentMessages = messages.get() as ModelMessage[];
  const cleanMessages = currentMessages.filter(
    (msg) => !(msg.role === 'assistant' && (!msg.content ||
      (typeof msg.content === 'string' && msg.content.trim() === '')))
  );

  messages.update([...cleanMessages, { role: 'user', content: message }]);

  // 创建流式文本值
  const contentStream = createStreamableValue('');
  const textComponent = <TextStreamMessage content={contentStream.value} />;

  // 创建自定义 OpenAI 客户端
  const customOpenAI = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL + '/v1',
  });

  // 使用 streamUI 流式传输 UI
  const { value: stream } = await streamUI({
    model: customOpenAI('gpt-4o'),
    system: 'you are a friendly home automation assistant',
    messages: messages.get() as ModelMessage[],
    text: async function* ({ content, delta, done }) {
      // 流式更新文本内容
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
    tools: { /* 工具定义 */ }
  });

  return stream;
};
```

**c) Tools 定义 - 返回 RSC**

每个工具都是一个生成器函数，返回 React Server Component：

```typescript
tools: {
  viewCameras: {
    description: 'view current active cameras',
    inputSchema: z.object({}),
    generate: async function* (_input, { toolName, toolCallId }) {
      // 返回 React Server Component
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
  // ... 其他工具
}
```

#### `app/(preview)/layout.tsx` - AI 上下文提供者

```typescript
import { Toaster } from 'sonner';
import { AI } from './actions';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Toaster position="top-center" richColors />
        <AI>{children}</AI>  {/* 提供 AI 上下文 */}
      </body>
    </html>
  );
}
```

#### `app/(preview)/page.tsx` - 客户端组件

```typescript
'use client';

import { useActions } from '@ai-sdk/rsc';
import { Message } from '@/components/message';

export default function Home() {
  const { sendMessage } = useActions();  // 从 AI 上下文获取 actions

  const [input, setInput] = useState<string>('');
  const [messages, setMessages] = useState<Array<ReactNode>>([]);

  // 调用 Server Action
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

### 3. 关键技术点

#### a) `createStreamableValue` - 流式值

用于流式传输文本内容：

```typescript
const contentStream = createStreamableValue('');
contentStream.update(content); // 更新值
contentStream.done(); // 完成流
```

客户端使用 `useStreamableValue` hook 订阅更新：

```typescript
const [text] = useStreamableValue(content);
```

#### b) `streamUI` - 流式 UI 生成

这是 Vercel AI SDK 的核心函数，允许：

- 流式传输文本内容
- 流式传输 React Server Components
- 通过工具调用动态生成 UI

#### c) `getMutableAIState` - 状态管理

用于在 Server Action 中访问和更新 AI 状态：

```typescript
const messages = getMutableAIState<typeof AI>('messages');
messages.get(); // 获取当前状态
messages.update(); // 更新状态
messages.done(); // 完成状态更新
```

#### d) Tools 系统

每个工具：

1. 定义 `description` - LLM 理解工具用途
2. 定义 `inputSchema` - 使用 Zod schema 验证参数
3. 实现 `generate` - 生成器函数接收输入和工具元数据，返回 RSC

`generate` 函数签名：

```typescript
generate: async function* (input, { toolName, toolCallId }) => {
  // input: 基于 inputSchema 验证的参数
  // toolName: 被调用的工具名称
  // toolCallId: 此工具调用的唯一 ID
  return <ReactServerComponent />;
}
```

LLM 会根据用户输入自动决定调用哪个工具。

### 4. 数据流

```
用户输入
  ↓
客户端调用 sendMessage(input)
  ↓
Server Action 执行
  ↓
streamUI 开始与 LLM 交互
  ↓
LLM 生成文本 → 通过 text 函数流式传输
  ↓
LLM 决定调用工具 → 工具返回 RSC
  ↓
RSC 流式传输回客户端
  ↓
客户端实时渲染组件
```

### 5. 组件类型

项目中有两种类型的组件：

**a) Server Components** (默认)

- `CameraView`, `HubView`, `UsageView` 等
- 在服务器端渲染
- 可以直接访问服务器资源

**b) Client Components** (`"use client"`)

- `page.tsx`, `message.tsx` 等
- 需要交互的组件
- 使用 hooks 和事件处理

### 6. 优势

1. **实时性** - 组件流式传输，无需等待完整响应
2. **类型安全** - TypeScript + Zod 参数验证
3. **动态 UI** - LLM 根据上下文动态生成 UI
4. **服务器端渲染** - 减少客户端负担
5. **状态管理** - 自动管理对话历史

### 7. 工作流程示例

用户输入："Show me my smart home hub"

1. `sendMessage` 被调用
2. `streamUI` 开始与 LLM 交互
3. LLM 识别需要调用 `viewHub` 工具
4. `viewHub.generate` 执行：
   - 更新消息历史
   - 返回 `<Message content={<HubView hub={hub} />} />`
5. 组件流式传输到客户端
6. 客户端渲染 `HubView` 组件

## 总结

Aether 展示了如何将 AI 与 React Server Components 结合，实现：

- **流式传输** - 流畅的实时 UI 更新
- **动态生成** - LLM 决定渲染什么组件
- **类型安全** - 完整的 TypeScript 支持
- **服务器优先** - 利用 RSC 的优势

这是 Vercel AI SDK RSC 功能的典型应用场景，特别适合需要根据 AI 响应动态生成复杂 UI 的应用。Aether 作为 AI 智能与用户体验之间的桥梁，实现了流畅的实时交互。

## 了解更多

了解更多关于 Vercel AI SDK 或 Next.js 的资源：

- [Vercel AI SDK 文档](https://sdk.vercel.ai/docs)
- [Vercel AI Playground](https://play.vercel.ai)
- [Next.js 文档](https://nextjs.org/docs) - 了解 Next.js 功能和 API
