import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Validate URL scheme to prevent javascript: and other dangerous protocols */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Che giau thong tin dang nhap proxy (User/Pass) tren giao dien nguoi dung */
export function maskProxy(proxy?: string): string {
  if (!proxy) return '';
  try {
    const raw = proxy.trim();
    if (!raw) return '';
    const withoutScheme = raw.replace(/^(https?:\/\/|socks[45]h?:\/\/)/i, '');
    const atParts = withoutScheme.split('@');
    if (atParts.length > 1) {
      return atParts[1];
    }
    const colonParts = withoutScheme.split(':');
    if (colonParts.length >= 4) {
      return `${colonParts[0]}:${colonParts[1]}`;
    }
    return withoutScheme;
  } catch {
    return proxy || '';
  }
}
