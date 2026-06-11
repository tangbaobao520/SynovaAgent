import { installSkill, uninstallSkill, listInstalledSkills, clearSkillRegistry } from '../skill-pack';

beforeEach(() => clearSkillRegistry());

describe('installSkill', () => {
  it('installs skill with manifest tracking', () => {
    const manifest = installSkill({
      name: 'manufacturing-expert', version: '1.0', author: '王老师',
      description: '制造业专家诊断包',
      modules: [{ id: 'custom-oee', version: '1.0', priority: 'P1', requiredDataSources: {}, compute: async () => ({}), confidenceModel: 'statistical', label: 'OEE', description: '设备效率' }],
      adapters: [{ id: 'mes-adapter', name: 'MES', supportedDataSources: ['mes'], connect: async () => {}, disconnect: async () => {}, healthCheck: async () => true, subscribe: () => {} }],
      knowledge: [{ id: 'kn-1', expertType: 'strategic_analyst', category: '基准', content: '制造业OEE基准75%', addedAt: '', lastUpdatedAt: '' }],
    });
    expect(manifest.name).toBe('manufacturing-expert');
    expect(manifest.modulesCount).toBe(1);
    expect(manifest.adaptersCount).toBe(1);
    expect(listInstalledSkills()).toHaveLength(1);
  });
});

describe('uninstallSkill', () => {
  it('removes from registry', () => {
    installSkill({ name: 'test', version: '1.0', author: 'x', description: 'd' });
    expect(uninstallSkill('test')).toBe(true);
    expect(listInstalledSkills()).toHaveLength(0);
  });
});
