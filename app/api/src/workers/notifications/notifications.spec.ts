import { PrismaClient, User } from '@prisma/client';

import { resolveChannels } from './channel-resolver.service';
import { renderEmail, renderSlack } from './templates/templates';
import { parseMessage, NotificationMessage } from './notification-message';
import { NotificationsService } from './notifications.service';
import { DispatchService } from './dispatch.service';

// BL-119: mock del SDK de SES para no tocar AWS. La variable lleva prefijo
// `mock` para que jest permita referenciarla dentro del factory hoisteado.
const mockSesSend = jest.fn().mockResolvedValue({ MessageId: 'ses-1' });
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({ send: mockSesSend })),
  SendEmailCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

const baseUser = {
  notifyEmail: true,
  notifySlack: false,
  slackUserId: null,
} as Pick<User, 'notifyEmail' | 'notifySlack' | 'slackUserId'>;

const msg: NotificationMessage = {
  ticketId: '11111111-1111-4111-8111-111111111111',
  ticketNumber: 'TKT-0001',
  title: 'Falla de pagos',
  eventType: 'asignacion',
  recipientId: '22222222-2222-4222-8222-222222222222',
};

describe('resolveChannels', () => {
  it('email cuando notifyEmail', () => expect(resolveChannels(baseUser)).toEqual(['email']));
  it('slack solo si hay slackUserId', () => {
    expect(resolveChannels({ ...baseUser, notifySlack: true, slackUserId: null })).toEqual([
      'email',
    ]);
    expect(resolveChannels({ notifyEmail: true, notifySlack: true, slackUserId: 'U1' })).toEqual([
      'email',
      'slack',
    ]);
  });
  it('ninguno si todo deshabilitado', () =>
    expect(resolveChannels({ notifyEmail: false, notifySlack: false, slackUserId: null })).toEqual(
      [],
    ));
});

describe('templates', () => {
  it('email subject incluye ticket_number y label del evento', () => {
    const { subject, body } = renderEmail(msg);
    expect(subject).toContain('TKT-0001');
    expect(subject).toContain('Ticket asignado');
    expect(body).toContain('TKT-0001');
  });
  it('slack incluye el número y título', () => {
    expect(renderSlack(msg).text).toContain('TKT-0001');
    expect(renderSlack(msg).text).toContain('Falla de pagos');
  });
});

describe('parseMessage', () => {
  it('acepta un mensaje válido', () =>
    expect(parseMessage(msg)).toMatchObject({ ticketNumber: 'TKT-0001' }));
  it('rechaza eventType inválido', () =>
    expect(() => parseMessage({ ...msg, eventType: 'comentario' })).toThrow());
  it('rechaza ticketId no-uuid', () =>
    expect(() => parseMessage({ ...msg, ticketId: 'x' })).toThrow());
});

describe('NotificationsService.process', () => {
  function setup(user: unknown) {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
    } as unknown as PrismaClient;
    const dispatch = { sendEmail: jest.fn(), sendSlack: jest.fn() } as unknown as DispatchService;
    return { svc: new NotificationsService(prisma, dispatch), dispatch };
  }

  it('despacha email + slack según preferencias', async () => {
    const { svc, dispatch } = setup({
      email: 'a@b.c',
      notifyEmail: true,
      notifySlack: true,
      slackUserId: 'U1',
    });
    const res = await svc.process(msg);
    expect(res.channels).toEqual(['email', 'slack']);
    expect(dispatch.sendEmail).toHaveBeenCalled();
    expect(dispatch.sendSlack).toHaveBeenCalledWith(
      'U1',
      expect.objectContaining({ text: expect.any(String) }),
    );
  });

  it('destinatario inexistente → sin canales', async () => {
    const { svc, dispatch } = setup(null);
    expect(await svc.process(msg)).toEqual({ channels: [] });
    expect(dispatch.sendEmail).not.toHaveBeenCalled();
  });
});

describe('DispatchService (stub BL-035)', () => {
  it('sendEmail/sendSlack resuelven sin lanzar', async () => {
    const d = new DispatchService();
    await expect(d.sendEmail('a@b.c', { subject: 's', body: 'b' })).resolves.toBeUndefined();
    await expect(d.sendSlack('U1', { text: 't' })).resolves.toBeUndefined();
  });
});

// BL-119: cuando SES_FROM_ADDRESS está configurado, sendEmail debe enviar el
// correo REAL vía SESClient.send(SendEmailCommand). Verificamos que se llama con
// el remitente y destinatario correctos sin tocar AWS (SDK mockeado arriba).
describe('DispatchService (SES real, BL-119)', () => {
  const ORIGINAL = process.env.SES_FROM_ADDRESS;
  beforeEach(() => {
    mockSesSend.mockClear();
    process.env.SES_FROM_ADDRESS = 'noreply@example.com';
  });
  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.SES_FROM_ADDRESS;
    else process.env.SES_FROM_ADDRESS = ORIGINAL;
  });

  it('sendEmail invoca SESClient.send con Source=SES_FROM_ADDRESS y destinatario', async () => {
    // Instancia DENTRO del test para que el constructor lea el env ya seteado.
    const d = new DispatchService();
    await d.sendEmail('reporter@b.c', { subject: 'Asunto', body: 'Cuerpo' });
    expect(mockSesSend).toHaveBeenCalledTimes(1);
    const cmd = mockSesSend.mock.calls[0][0];
    expect(cmd.input.Source).toBe('noreply@example.com');
    expect(cmd.input.Destination.ToAddresses).toEqual(['reporter@b.c']);
    expect(cmd.input.Message.Subject.Data).toBe('Asunto');
  });
});
