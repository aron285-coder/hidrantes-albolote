import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combina clases de Tailwind sin duplicados (convención de shadcn/ui). */
export function cn(...clases: ClassValue[]): string {
  return twMerge(clsx(clases));
}
