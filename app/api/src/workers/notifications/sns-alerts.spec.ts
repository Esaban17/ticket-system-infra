import { publishOpsAlert, __resetSnsClientForTests } from './sns-alerts';

// Mockeamos SÓLO el cliente (su .send), conservando el PublishCommand real para
// poder inspeccionar el payload (command.input) que recibe SNS.
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-sns', () => {
  const actual = jest.requireActual('@aws-sdk/client-sns');
  return { ...actual, SNSClient: jest.fn(() => ({ send: mockSend })) };
});

describe('publishOpsAlert', () => {
  beforeEach(() => {
    __resetSnsClientForTests();
    mockSend.mockReset();
    process.env.AWS_REGION = 'us-east-1';
    delete process.env.SNS_ALERTS_TOPIC_ARN;
  });

  it('devuelve null y no publica si no hay topic configurado', async () => {
    const r = await publishOpsAlert({ subject: 's', message: 'm' });
    expect(r).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('publica al topic del env y devuelve el MessageId', async () => {
    process.env.SNS_ALERTS_TOPIC_ARN = 'arn:aws:sns:us-east-1:1:t';
    mockSend.mockResolvedValue({ MessageId: 'sns-1' });
    const r = await publishOpsAlert({ subject: 's', message: 'm', context: { a: 1 } });
    expect(r).toBe('sns-1');
    const input = mockSend.mock.calls[0][0].input;
    expect(input.TopicArn).toBe('arn:aws:sns:us-east-1:1:t');
    expect(input.Message).toContain('"a": 1');
  });

  it('trunca el Subject a 100 caracteres (límite SNS)', async () => {
    mockSend.mockResolvedValue({ MessageId: 'sns-2' });
    await publishOpsAlert({ subject: 'x'.repeat(150), message: 'm' }, { topicArn: 'arn:t' });
    expect(mockSend.mock.calls[0][0].input.Subject).toHaveLength(100);
  });

  it('best-effort: no lanza si SNS falla y devuelve null', async () => {
    mockSend.mockRejectedValue(new Error('AccessDenied'));
    const r = await publishOpsAlert({ subject: 's', message: 'm' }, { topicArn: 'arn:t' });
    expect(r).toBeNull();
  });
});
