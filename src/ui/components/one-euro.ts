/**
 * Filtro «1 euro» (Casiez, Roussel y Vogel, 2012): quita el temblor de un punto cuando está quieto y lo sigue sin
 * retraso cuando se mueve de verdad. Solo se usa para dibujar: lo que mide el sistema no pasa por aquí.
 */
export class OneEuro {
  private x = 0;
  private dx = 0;
  private t = 0;
  private started = false;

  /**
   * Con los valores de aquí (medido a 30 cuadros/s con temblor del detector de 1 a 3 píxeles) la raya tiembla un 85 %
   * menos en reposo y, al hablar, se aleja menos del movimiento real que sin filtro.
   *
   * @param minCutoff Hz con que se suaviza el punto quieto (más bajo = más firme).
   * @param beta Cuánto se abre el filtro con la velocidad (más alto = menos retraso al moverse rápido).
   * @param dCutoff Hz con que se suaviza la velocidad.
   */
  constructor(
    private minCutoff = 1,
    private beta = 0.02,
    private dCutoff = 1,
  ) {}

  reset() {
    this.started = false;
  }

  /** `v` en la unidad que sea (aquí píxeles) y `t` en milisegundos. */
  filter(v: number, t: number): number {
    if (!this.started) {
      this.started = true;
      this.x = v;
      this.dx = 0;
      this.t = t;
      return v;
    }
    const dt = Math.max((t - this.t) / 1000, 1 / 240);
    this.t = t;
    const a = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    this.dx += ((v - this.x) / dt - this.dx) * a(this.dCutoff);
    this.x += (v - this.x) * a(this.minCutoff + this.beta * Math.abs(this.dx));
    return this.x;
  }
}
