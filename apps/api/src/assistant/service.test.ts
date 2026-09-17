import { answerAssistant } from './service.js';

describe('assistant workflow', () => {
  it('returns a safe application-start action', async () => {
    const reply = await answerAssistant({} as never, 'Please start my application');
    expect(reply.action).toEqual({ type: 'START_APPLICATION' });
    expect(reply.message).toContain('secure intake form');
  });

  it('does not make approval decisions', async () => {
    const reply = await answerAssistant({} as never, 'Can you approve me?');
    expect(reply.action).toEqual({ type: 'NONE' });
    expect(reply.message).toContain('cannot approve');
  });
});