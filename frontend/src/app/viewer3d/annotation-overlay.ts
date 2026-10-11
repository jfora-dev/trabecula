import { Measurement, Point3, formatDistance } from './measurement';

type Projector = (point: Point3) => { x: number; y: number; visible: boolean };

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Draws measurements in an SVG layer on top of the canvas.
 *
 * Lines and labels keep a constant size on screen and stay sharp at any zoom, which is what
 * an annotation should do. Only the end points live in 3D; they are projected every frame.
 */
export class AnnotationOverlay {
  constructor(private readonly svg: SVGSVGElement) {}

  resize(width: number, height: number): void {
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  draw(
    measurements: readonly Measurement[],
    pending: { x: number; y: number; z: number } | null,
    project: Projector,
  ): void {
    const nodes: SVGElement[] = [];
    for (const m of measurements) {
      const a = project(m.start);
      const b = project(m.end);
      if (!a.visible || !b.visible) continue;
      nodes.push(
        el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'measure-halo' }),
        el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'measure-line' }),
        el('circle', { cx: a.x, cy: a.y, r: 4, class: 'measure-point' }),
        el('circle', { cx: b.x, cy: b.y, r: 4, class: 'measure-point' }),
        label((a.x + b.x) / 2, (a.y + b.y) / 2, formatDistance(m.distanceMm), m.id),
      );
    }
    if (pending) {
      const p = project([pending.x, pending.y, pending.z]);
      if (p.visible)
        nodes.push(
          el('circle', { cx: p.x, cy: p.y, r: 5, class: 'measure-point measure-point--pending' }),
        );
    }
    this.svg.replaceChildren(...nodes);
  }
}

function el(name: string, attributes: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function label(x: number, y: number, text: string, id: number): SVGElement {
  const group = el('g', {
    transform: `translate(${x.toFixed(1)} ${(y - 14).toFixed(1)})`,
    class: 'measure-label',
    'data-measurement': id,
  });
  const width = text.length * 7.4 + 14;
  group.append(el('rect', { x: -width / 2, y: -11, width, height: 22, rx: 11 }));
  const t = el('text', { 'text-anchor': 'middle', y: 4.5 });
  t.textContent = text;
  group.append(t);
  return group;
}
