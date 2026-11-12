import { describe, expect, test } from 'bun:test';
import { isBktTestProfile, type MultiBrowserProfile } from '@/lib/types';

describe('BKT Test Profile Isolation', () => {
  test('identifies BKT test profiles by group correctly', () => {
    const p1: Partial<MultiBrowserProfile> = {
      id: 'bkt-1',
      profile_name: 'test 1',
      group: 'Kênh Test BKT',
    };
    const p2: Partial<MultiBrowserProfile> = {
      id: 'bkt-2',
      profile_name: 'test 2',
      group: 'kenh test bkt',
    };
    const p3: Partial<MultiBrowserProfile> = {
      id: 'bkt-3',
      profile_name: 'test 3',
      group: 'BKT Test Pool',
    };

    expect(isBktTestProfile(p1 as MultiBrowserProfile)).toBe(true);
    expect(isBktTestProfile(p2 as MultiBrowserProfile)).toBe(true);
    expect(isBktTestProfile(p3 as MultiBrowserProfile)).toBe(true);
  });

  test('identifies BKT test profiles by name prefix correctly', () => {
    const p1: Partial<MultiBrowserProfile> = {
      id: 'bkt-4',
      profile_name: '[BKT Test] test 2',
      group: 'Default',
    };
    const p2: Partial<MultiBrowserProfile> = {
      id: 'bkt-5',
      profile_name: '[bkt test] channel test',
      group: undefined,
    };

    expect(isBktTestProfile(p1 as MultiBrowserProfile)).toBe(true);
    expect(isBktTestProfile(p2 as MultiBrowserProfile)).toBe(true);
  });

  test('preserves genuine money-making target profiles', () => {
    const normal1: Partial<MultiBrowserProfile> = {
      id: 'norm-1',
      profile_name: '1',
      group: 'Default',
    };
    const normal2: Partial<MultiBrowserProfile> = {
      id: 'norm-2',
      profile_name: 'Rave Festival 2026',
      group: 'Music',
    };
    const normal3: Partial<MultiBrowserProfile> = {
      id: 'norm-3',
      profile_name: 'Channel Test Real',
      group: 'General',
    };

    expect(isBktTestProfile(normal1 as MultiBrowserProfile)).toBe(false);
    expect(isBktTestProfile(normal2 as MultiBrowserProfile)).toBe(false);
    expect(isBktTestProfile(normal3 as MultiBrowserProfile)).toBe(false);
    expect(isBktTestProfile(null)).toBe(false);
    expect(isBktTestProfile(undefined)).toBe(false);
  });

  test('filters out test profiles from mixed profile lists leaving only target profiles', () => {
    const mixed: Partial<MultiBrowserProfile>[] = [
      { id: '1', profile_name: '1', group: 'Default' },
      { id: '2', profile_name: '2', group: 'Default' },
      { id: '3', profile_name: '3', group: 'Default' },
      { id: '4', profile_name: '4', group: 'Default' },
      { id: '5', profile_name: '5', group: 'Default' },
      { id: '6', profile_name: '[BKT Test] test 2', group: 'Kênh Test BKT' },
      { id: '7', profile_name: '[BKT Test] test me3', group: 'Kênh Test BKT' },
    ];

    const clean = mixed.filter((p) => !isBktTestProfile(p as MultiBrowserProfile));
    expect(clean.length).toBe(5);
    expect(clean.map((p) => p.profile_name)).toEqual(['1', '2', '3', '4', '5']);
  });
});
