import { describe, expect, test } from 'bun:test';
import {
  adaptCompetitorDescription,
  buildAutoPilotDescription,
  detectTitleLanguage,
} from '../src/utils/reup-auto-pilot';

describe('auto-pilot description language', () => {
  const spanishTitle =
    'Una niña encontrada en la nieve salvó a su nuevo papá y convirtió a su familia en la';

  test('detects Spanish before overlapping Latin accents', () => {
    expect(detectTitleLanguage(spanishTitle)).toBe('es');
  });

  test('builds Spanish description without Vietnamese templates', () => {
    const description = buildAutoPilotDescription({ videoTitle: spanishTitle });

    expect(description).toContain('Descubre');
    expect(description).not.toContain('Khám phá');
    expect(description).not.toContain('Đăng ký');
    expect(description).not.toContain('Bản quyền');
  });

  test('drops a stale Vietnamese generated description for a Spanish title', () => {
    const description = adaptCompetitorDescription({
      videoTitle: spanishTitle,
      originalDescription:
        'Khám phá nội dung hấp dẫn về video.\n\nĐăng ký kênh để không bỏ lỡ các video mới nhất mỗi ngày!',
      targetChannelName: 'Cuentos de Amor',
    });

    expect(description).toContain('Descubre');
    expect(description).not.toContain('Khám phá');
    expect(description).not.toContain('Đăng ký');
  });
});
