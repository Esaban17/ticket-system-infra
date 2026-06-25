import { sendEmailViaSes, __resetSesClientForTests } from './ses-mailer';

// Mockeamos SÓLO el cliente (su .send), conservando el SendEmailCommand real
// para poder inspeccionar el payload (command.input) que recibe SES.
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-ses', () => {
  const actual = jest.requireActual('@aws-sdk/client-ses');
  return { ...actual, SESClient: jest.fn(() => ({ send: mockSend })) };
});

describe('sendEmailViaSes', () => {
  beforeEach(() => {
    __resetSesClientForTests();
    mockSend.mockReset();
    process.env.SES_FROM_ADDRESS = 'no-reply@quattro.com.gt';
    process.env.AWS_REGION = 'us-east-1';
  });

  it('devuelve el MessageId que asigna SES', async () => {
    mockSend.mockResolvedValue({ MessageId: 'ses-123' });
    const id = await sendEmailViaSes({ to: 'a@b.c', subject: 's', text: 't' });
    expect(id).toBe('ses-123');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('arma el payload (Source/Destination/Subject/Text) y el HTML opcional', async () => {
    mockSend.mockResolvedValue({ MessageId: 'ses-1' });
    await sendEmailViaSes({ to: 'a@b.c', subject: 's', text: 't', html: '<b>x</b>' });
    const input = mockSend.mock.calls[0][0].input;
    expect(input.Source).toBe('no-reply@quattro.com.gt');
    expect(input.Destination.ToAddresses).toEqual(['a@b.c']);
    expect(input.Message.Subject.Data).toBe('s');
    expect(input.Message.Body.Text.Data).toBe('t');
    expect(input.Message.Body.Html.Data).toBe('<b>x</b>');
  });

  it('omite el cuerpo HTML cuando no se provee', async () => {
    mockSend.mockResolvedValue({ MessageId: 'ses-2' });
    await sendEmailViaSes({ to: 'a@b.c', subject: 's', text: 't' });
    expect(mockSend.mock.calls[0][0].input.Message.Body.Html).toBeUndefined();
  });

  it('lanza si no hay remitente configurado', async () => {
    delete process.env.SES_FROM_ADDRESS;
    await expect(sendEmailViaSes({ to: 'a@b.c', subject: 's', text: 't' })).rejects.toThrow(
      'SES_FROM_ADDRESS',
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('propaga el error de SES para que el caller reintente', async () => {
    mockSend.mockRejectedValue(new Error('Throttling'));
    await expect(sendEmailViaSes({ to: 'a@b.c', subject: 's', text: 't' })).rejects.toThrow(
      'Throttling',
    );
  });

  it('permite override de remitente por parámetro', async () => {
    delete process.env.SES_FROM_ADDRESS;
    mockSend.mockResolvedValue({ MessageId: 'ses-9' });
    const id = await sendEmailViaSes(
      { to: 'a@b.c', subject: 's', text: 't' },
      { from: 'ops@quattro.com.gt', region: 'us-east-2' },
    );
    expect(id).toBe('ses-9');
    expect(mockSend.mock.calls[0][0].input.Source).toBe('ops@quattro.com.gt');
  });
});
