import type { PrismaClient } from '@prisma/client';

export type AssistantAction =
  | { type: 'START_APPLICATION' }
  | { type: 'SHOW_STATUS'; applicationId: string }
  | { type: 'NONE' };

export interface AssistantReply {
  message: string;
  action: AssistantAction;
  aiUsed: boolean;
}

function localReply(message: string, applicationId?: string): AssistantReply {
  const normalized = message.toLowerCase();
  if (/(apply|application|sign up|start)/.test(normalized)) {
    return {
      message: 'I can start the application flow for you. I will pre-open the secure intake form; you still review and submit the details yourself.',
      action: { type: 'START_APPLICATION' },
      aiUsed: false,
    };
  }
  if (/(status|where|progress|track)/.test(normalized) && applicationId) {
    return {
      message: 'I will check the latest status for your application.',
      action: { type: 'SHOW_STATUS', applicationId },
      aiUsed: false,
    };
  }
  if (/(kyc|document|identity|verify)/.test(normalized)) {
    return {
      message: 'KYC checks the uploaded identity image with OCR, detects basic fraud signals, and sends only eligible applications to the mock bank partner.',
      action: { type: 'NONE' },
      aiUsed: false,
    };
  }
  return {
    message: 'I can explain KYC, help you start an application, or check an application status. I cannot approve, reject, or change a risk decision.',
    action: { type: 'NONE' },
    aiUsed: false,
  };
}

/**
 * Handles the applicant assistant with safe, explicit actions.
 * The local intent path always works; an Anthropic key can enrich the reply later,
 * but the assistant is never allowed to approve applications or bypass ownership.
 */
export async function answerAssistant(
  _prisma: PrismaClient,
  message: string,
  applicationId?: string,
): Promise<AssistantReply> {
  const fallback = localReply(message, applicationId);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.ASSISTANT_USE_LLM !== 'true') return fallback;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-haiku-latest',
        max_tokens: 180,
        temperature: 0,
        system: 'You are a concise CardAcquire application assistant. Explain KYC and application status. Never approve, reject, change risk, request secrets, or reveal private data. Do not claim an action happened unless the API action contract says so.',
        messages: [{ role: 'user', content: message }],
      }),
    });
    if (!response.ok) return fallback;
    const body = await response.json() as { content?: Array<{ text?: string }> };
    const text = body.content?.[0]?.text?.trim();
    return text ? { ...fallback, message: text, aiUsed: true } : fallback;
  } catch {
    return fallback;
  }
}