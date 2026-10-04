/** Lo que más se pide en un hospital, por tema. Son las frases que el equipo va preparando. */
export const HOSPITAL: { tab: string; icon: string; items: [string, string][] }[] = [
  {
    tab: 'Necesito',
    icon: 'hand',
    items: [
      ['glass-water', 'Tengo sed'],
      ['bath', 'Necesito ir al baño'],
      ['activity', 'Necesito aspiración'],
      ['refresh-ccw', 'Cámbiame de posición'],
      ['bed', 'Súbeme la cabecera'],
      ['lightbulb', 'Apaga la luz'],
      ['pill', 'Necesito mi medicina'],
      ['utensils', 'Tengo hambre'],
    ],
  },
  {
    tab: 'Mi cuerpo',
    icon: 'heart',
    items: [
      ['zap', 'Tengo dolor'],
      ['wind', 'Me falta el aire'],
      ['snowflake', 'Tengo frío'],
      ['sun', 'Tengo calor'],
      ['frown', 'Tengo náuseas'],
      ['moon', 'Quiero dormir'],
    ],
  },
  {
    tab: 'Me siento',
    icon: 'smile',
    items: [
      ['heart', 'Tengo miedo'],
      ['frown', 'Estoy triste'],
      ['smile', 'Estoy bien'],
      ['hand-heart', 'Gracias'],
      ['user', 'No me dejes solo'],
    ],
  },
  {
    tab: 'Preguntas',
    icon: 'help',
    items: [
      ['help', '¿Qué me pasó?'],
      ['sun', '¿Qué hora es?'],
      ['phone', '¿Dónde está mi familia?'],
      ['stethoscope', '¿Cuándo me quitan el tubo?'],
      ['heart', '¿Voy a estar bien?'],
    ],
  },
  {
    tab: 'Personas',
    icon: 'user',
    items: [
      ['phone', 'Llama a mi familia'],
      ['bell', 'Llama a la enfermera'],
      ['stethoscope', 'Quiero hablar con el médico'],
      ['hand-heart', 'Te quiero'],
    ],
  },
];
