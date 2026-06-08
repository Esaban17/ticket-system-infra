import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

describe('TicketsController', () => {
  const service = {
    list: jest.fn(),
    saveAttachment: jest.fn(),
  } as unknown as TicketsService;

  const controller = new TicketsController(service);

  afterEach(() => jest.clearAllMocks());

  it('GET delegates to service.list()', () => {
    const rows = [{ id: 1, title: 't', status: 'open', priority: 'high', createdAt: new Date() }];
    (service.list as jest.Mock).mockReturnValue(rows);
    expect(controller.list()).toBe(rows);
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it('POST delegates to service.saveAttachment() and returns the object key', async () => {
    const stored = { key: 'uploads/x.json', bucket: 'b' };
    (service.saveAttachment as jest.Mock).mockResolvedValue(stored);
    const body = { hello: 'world' };
    await expect(controller.create(body)).resolves.toEqual(stored);
    expect(service.saveAttachment).toHaveBeenCalledWith(body);
  });
});
