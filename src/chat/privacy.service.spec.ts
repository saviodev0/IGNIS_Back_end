jest.mock('@nestjs/mongoose', () => ({
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => () => undefined,
  SchemaFactory: { createForClass: () => ({ index: () => undefined }) },
}));

import { PrivacyService } from './privacy.service';

const model = (deletedCount: number) => ({ deleteMany: jest.fn().mockResolvedValue({ deletedCount }) });

describe('PrivacyService.removeAllData', () => {
  it('apaga só os dados do usuário e os originais do disco', async () => {
    const chats = model(2);
    const messages = model(14);
    const files = model(3);
    const materials = model(5);
    const storage = { removeUser: jest.fn().mockResolvedValue(undefined) };
    const service = new PrivacyService(chats as any, messages as any, files as any, materials as any, storage as any);

    const result = await service.removeAllData('user-1');

    for (const m of [chats, messages, files, materials]) {
      expect(m.deleteMany).toHaveBeenCalledWith({ userId: 'user-1' });
    }
    expect(storage.removeUser).toHaveBeenCalledWith('user-1');
    expect(result.deleted).toEqual({ chats: 2, messages: 14, files: 3, materials: 5 });
  });

  it('sem nada guardado devolve zeros', async () => {
    const empty = { deleteMany: jest.fn().mockResolvedValue({}) };
    const storage = { removeUser: jest.fn() };
    const service = new PrivacyService(empty as any, empty as any, empty as any, empty as any, storage as any);

    await expect(service.removeAllData('u')).resolves.toMatchObject({
      deleted: { chats: 0, messages: 0, files: 0, materials: 0 },
    });
  });
});
