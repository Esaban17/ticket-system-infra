import { User } from '@prisma/client';

export type Channel = 'email' | 'slack';

/**
 * Selección de canales según las preferencias del usuario (BL-033). Slack solo
 * si está habilitado Y hay slack_user_id. Función pura.
 */
export function resolveChannels(
  user: Pick<User, 'notifyEmail' | 'notifySlack' | 'slackUserId'>,
): Channel[] {
  const channels: Channel[] = [];
  if (user.notifyEmail) channels.push('email');
  if (user.notifySlack && user.slackUserId) channels.push('slack');
  return channels;
}
