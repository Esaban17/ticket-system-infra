import { PrismaClient, User } from '@prisma/client';

import { resolveChannels } from './channel-resolver.service';
import { renderEmail, renderSlack } from './templates/templates';
import { parseMessage, NotificationMessage } from './notification-message';
import { NotificationsService } from './notifications.service';
import { DispatchService } from './dispatch.service';
import { sendEmailViaSes } from './ses-mailer';

// El envío real por SES se mockea: estas pruebas validan el cableado, no la red.
jest.mock('./ses-mailer');

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

describe('DispatchService (SES real, BL-035)', () => {
  beforeEach(() => (sendEmailViaSes as jest.Mock).mockReset());

  it('sendEmail delega en el mailer SES con el contenido renderizado', async () => {
    (sendEmailViaSes as jest.Mock).mockResolvedValue('ses-msg-1');
    const d = new DispatchService();
    await expect(d.sendEmail('a@b.c', { subject: 's', body: 'b' })).resolves.toBeUndefined();
    expect(sendEmailViaSes).toHaveBeenCalledWith({ to: 'a@b.c', subject: 's', text: 'b' });
  });

  it('sendEmail propaga el error de SES (para reintento del worker)', async () => {
    (sendEmailViaSes as jest.Mock).mockRejectedValue(new Error('Throttling'));
    const d = new DispatchService();
    await expect(d.sendEmail('a@b.c', { subject: 's', body: 'b' })).rejects.toThrow('Throttling');
  });

  it('sendSlack sigue siendo stub y resuelve sin lanzar', async () => {
    const d = new DispatchService();
    await expect(d.sendSlack('U1', { text: 't' })).resolves.toBeUndefined();
  });
});
