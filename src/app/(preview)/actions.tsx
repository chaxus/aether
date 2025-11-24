import { Message, TextStreamMessage } from '@/components/message';
import { createOpenAI } from '@ai-sdk/openai';
import { ModelMessage, generateId } from 'ai';
import { createAI, createStreamableValue, getMutableAIState, streamUI } from '@ai-sdk/rsc';
import { ReactNode } from 'react';
import { z } from 'zod';
import { CameraView } from '@/components/camera-view';
import { HubView } from '@/components/hub-view';
import { UsageView } from '@/components/usage-view';

export interface Hub {
  climate: Record<'low' | 'high', number>;
  lights: Array<{ name: string; status: boolean }>;
  locks: Array<{ name: string; isLocked: boolean }>;
}

let hub: Hub = {
  climate: {
    low: 23,
    high: 25,
  },
  lights: [
    { name: 'patio', status: true },
    { name: 'kitchen', status: false },
    { name: 'garage', status: true },
  ],
  locks: [{ name: 'back door', isLocked: true }],
};

const sendMessage = async (message: string) => {
  'use server';

  // const aiState = getMutableAIState<typeof AI>();
  const messages = getMutableAIState<typeof AI>('messages');

  // Clean up any empty assistant messages before adding new user message
  const currentMessages = messages.get() as ModelMessage[];
  const cleanMessages = currentMessages.filter(
    (msg) =>
      !(msg.role === 'assistant' && (!msg.content || (typeof msg.content === 'string' && msg.content.trim() === ''))),
  );

  messages.update([...cleanMessages, { role: 'user', content: message }]);

  const contentStream = createStreamableValue('');
  const textComponent = <TextStreamMessage content={contentStream.value} />;

  try {
    console.log('Environment check:', {
      baseURL: process.env.OPENAI_BASE_URL,
      hasApiKey: !!process.env.OPENAI_API_KEY,
    });

    // Create custom OpenAI client with baseURL
    const customOpenAI = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL + '/v1',
    });

    console.log('Using custom OpenAI client with baseURL:', process.env.OPENAI_BASE_URL + '/v1');

    console.log('Starting streamUI with messages:', messages.get());

    const { value: stream } = await streamUI({
      model: customOpenAI('gpt-4o'),
      system: `\
        - you are a friendly home automation assistant
        - reply in lower case
      `,
      messages: messages.get() as ModelMessage[],
      text: async function* ({ content, delta: _delta, done }) {
        if (done) {
          // Only update messages if we have actual content
          if (content && content.trim()) {
            messages.done([...(messages.get() as ModelMessage[]), { role: 'assistant', content }]);
          }
          contentStream.done();
        } else {
          contentStream.update(content);
        }

        return textComponent;
      },
      tools: {
        viewCameras: {
          description: 'view current active cameras',
          inputSchema: z.object({}),
          generate: async function* (_input, { toolName: _toolName, toolCallId: _toolCallId }) {
            return <Message role="assistant" content={<CameraView />} />;
          },
        },
        viewHub: {
          description:
            'view the hub that contains current quick summary and actions for temperature, lights, and locks',
          inputSchema: z.object({}),
          generate: async function* (_input, { toolName: _toolName, toolCallId: _toolCallId }) {
            return <Message role="assistant" content={<HubView hub={hub} />} />;
          },
        },
        updateHub: {
          description: 'update the hub with new values',
          inputSchema: z.object({
            hub: z.object({
              climate: z.object({
                low: z.number(),
                high: z.number(),
              }),
              lights: z.array(z.object({ name: z.string(), status: z.boolean() })),
              locks: z.array(z.object({ name: z.string(), isLocked: z.boolean() })),
            }),
          }),
          generate: async function* ({ hub: newHub }, { toolName: _toolName, toolCallId: _toolCallId }) {
            hub = newHub;
            return <Message role="assistant" content={<HubView hub={hub} />} />;
          },
        },
        viewUsage: {
          description: 'view current usage for electricity, water, or gas',
          inputSchema: z.object({
            type: z.enum(['electricity', 'water', 'gas']),
          }),
          generate: async function* ({ type }, { toolName: _toolName, toolCallId: _toolCallId }) {
            return <Message role="assistant" content={<UsageView type={type} />} />;
          },
        },
      },
    });

    return stream;
  } catch (error) {
    console.error('AI API Error:', error);

    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message.includes('Country, region, or territory not supported')) {
        contentStream.update(
          '地区限制错误：即使使用了代理服务，仍然遇到地区限制。请检查：\n1. 代理服务是否正确配置\n2. API 密钥是否有效\n3. 代理服务是否支持该模型',
        );
      } else if (error.message.includes('API key')) {
        contentStream.update('API 密钥错误：请检查你的 OPENAI_API_KEY 是否正确');
      } else if (error.message.includes('baseURL')) {
        contentStream.update('代理服务错误：请检查 OPENAI_BASE_URL 是否正确配置');
      } else {
        contentStream.update(`错误：${error.message}`);
      }
    } else {
      contentStream.update('未知错误，请重试');
    }

    contentStream.done();
    return textComponent;
  }
};

export type UIState = Array<ReactNode>;

export type AIState = {
  chatId: string;
  messages: Array<ModelMessage>;
};

export const AI = createAI<AIState, UIState>({
  initialAIState: {
    chatId: generateId(),
    messages: [],
  },
  initialUIState: [],
  actions: {
    sendMessage,
  },
  onSetAIState: async ({ key: _key, state: _state, done }) => {
    'use server';

    if (done) {
      // save to database
    }
  },
});
