// The console look lives here. The scene renders into a small half-float
// target; this pass upscales it with the N64's characteristic horizontal
// smear, then converts to display space and quantizes to 5-6-5 with an
// ordered dither -- the exact combination that gives cartridge-era games
// their banded skies and soft, slightly gauzy edges.

import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uDither;
uniform float uSmear;
uniform float uVignette;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uDesat;

// Recursive 4x4 Bayer, built arithmetically so there is no array indexing.
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 p) { return bayer2(0.5 * p) * 0.25 + bayer2(p); }

vec3 linearToSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 texel = 1.0 / uRes;
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  vec3 l = texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb;
  vec3 r = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb;
  c = mix(c, (l + c * 2.0 + r) * 0.25, uSmear);

  c = linearToSRGB(c);

  float g = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(g), uDesat);
  c = mix(c, uFlashColor, uFlash);

  // Dither on the low-res pixel grid, not the screen grid, so the pattern
  // scales up with the image the way a real framebuffer would.
  float d = (bayer4(floor(vUv * uRes)) - 0.5) * uDither;
  vec3 steps = vec3(31.0, 63.0, 31.0);
  c = floor(c * steps + 0.5 + d) / steps;

  float v = smoothstep(1.15, 0.42, length((vUv - 0.5) * vec2(1.06, 1.0)));
  c *= mix(1.0, v, uVignette);

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export class N64Pass {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(480, 270, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      colorSpace: THREE.NoColorSpace,
      samples: 0,
    });

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uRes: { value: new THREE.Vector2(480, 270) },
        uDither: { value: 1.0 },
        uSmear: { value: 0.85 },
        uVignette: { value: 0.55 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 1, 1) },
        uDesat: { value: 0 },
      },
    });

    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.mesh = new THREE.Mesh(quad, this.material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.camera = new THREE.Camera();
  }

  // `internalHeight` is the emulated framebuffer height. 270 is roughly the
  // N64's 240-line output stretched to a 16:9 window.
  setSize(width, height, internalHeight) {
    const aspect = width / height;
    const h = Math.max(120, Math.round(internalHeight));
    const w = Math.max(160, Math.round(h * aspect));
    if (w !== this.target.width || h !== this.target.height) {
      this.target.setSize(w, h);
      this.material.uniforms.uRes.value.set(w, h);
    }
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
