/** Clave de una palabra: sin mayúsculas ni acentos, para que «Si» y «Sí» cuenten como la misma. */
export const keyOf = (text: string) => text.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
