/** Marca: esfera de cristal con labios y ondas de voz que salen de la boca. Solo CSS + SVG, sin ids. */
export function brandMark(size: 'sm' | 'md' = 'sm'): string {
  return `<span class="mark mark--${size}" aria-hidden="true"><i class="mark__dot mark__dot--a"></i><i class="mark__dot mark__dot--b"></i><svg viewBox="0 0 32 32"><path class="mark__lip" d="M4.6 16C7.8 11.2 10.8 11.3 12.6 12.9C14.4 11.3 17.4 11.2 20.6 16C16.8 15.1 14.7 15 12.6 15.3C10.5 15 8.4 15.1 4.6 16Z"/><path class="mark__lip" d="M4.6 16.7C8.6 17.5 10.6 17.7 12.6 17.7C14.6 17.7 16.6 17.5 20.6 16.7C18.4 21 15.6 22.3 12.6 22.3C9.6 22.3 6.8 21 4.6 16.7Z"/><path class="mark__wave" d="M23.4 12.8a4.6 4.6 0 0 1 0 6.6"/><path class="mark__wave mark__wave--2" d="M26.4 10.2a8.4 8.4 0 0 1 0 11.8"/></svg></span>`;
}
