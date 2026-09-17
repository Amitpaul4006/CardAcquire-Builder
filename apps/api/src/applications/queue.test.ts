import { applicationJobOptions } from './queue.js';

describe('application queue policy', () => {
  it('uses retry and exponential backoff settings for transient failures', () => {
    expect(applicationJobOptions).toEqual(
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnFail: false,
      }),
    );
  });
});