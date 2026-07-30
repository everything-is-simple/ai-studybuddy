// Node 24 polyfill: DOMMatrix removed from global scope
// Required by pdf-parse@2.4.5 for PDF coordinate transformations
'use strict';

if (typeof globalThis.DOMMatrix === 'undefined') {
  class DOMMatrixPolyfill {
    constructor(init) {
      this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0;
      this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0;
      this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
      this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1;
      this.is2D = true;
      this.isIdentity = true;

      if (typeof init === 'string' && init.startsWith('matrix(')) {
        var parts = init.slice(7, -1).split(',').map(Number);
        if (parts.length >= 6) {
          this.m11 = parts[0]; this.m12 = parts[1];
          this.m21 = parts[2]; this.m22 = parts[3];
          this.m41 = parts[4]; this.m42 = parts[5];
          this.isIdentity = false;
        }
      } else if (Array.isArray(init) && init.length >= 6) {
        this.m11 = init[0]; this.m12 = init[1];
        this.m21 = init[2]; this.m22 = init[3];
        this.m41 = init[4]; this.m42 = init[5];
        this.isIdentity = false;
      }
    }

    static fromMatrix(other) {
      var m = new DOMMatrixPolyfill();
      m.m11 = other.m11; m.m12 = other.m12; m.m13 = other.m13; m.m14 = other.m14;
      m.m21 = other.m21; m.m22 = other.m22; m.m23 = other.m23; m.m24 = other.m24;
      m.m31 = other.m31; m.m32 = other.m32; m.m33 = other.m33; m.m34 = other.m34;
      m.m41 = other.m41; m.m42 = other.m42; m.m43 = other.m43; m.m44 = other.m44;
      m.is2D = other.is2D;
      m.isIdentity = other.isIdentity;
      return m;
    }

    multiplySelf(other) {
      var a = this, b = other;
      var r = new DOMMatrixPolyfill();
      r.m11 = a.m11 * b.m11 + a.m12 * b.m21 + a.m13 * b.m31 + a.m14 * b.m41;
      r.m12 = a.m11 * b.m12 + a.m12 * b.m22 + a.m13 * b.m32 + a.m14 * b.m42;
      r.m13 = a.m11 * b.m13 + a.m12 * b.m23 + a.m13 * b.m33 + a.m14 * b.m43;
      r.m14 = a.m11 * b.m14 + a.m12 * b.m24 + a.m13 * b.m34 + a.m14 * b.m44;
      r.m21 = a.m21 * b.m11 + a.m22 * b.m21 + a.m23 * b.m31 + a.m24 * b.m41;
      r.m22 = a.m21 * b.m12 + a.m22 * b.m22 + a.m23 * b.m32 + a.m24 * b.m42;
      r.m23 = a.m21 * b.m13 + a.m22 * b.m23 + a.m23 * b.m33 + a.m24 * b.m43;
      r.m24 = a.m21 * b.m14 + a.m22 * b.m24 + a.m23 * b.m34 + a.m24 * b.m44;
      r.m31 = a.m31 * b.m11 + a.m32 * b.m21 + a.m33 * b.m31 + a.m34 * b.m41;
      r.m32 = a.m31 * b.m12 + a.m32 * b.m22 + a.m33 * b.m32 + a.m34 * b.m42;
      r.m33 = a.m31 * b.m13 + a.m32 * b.m23 + a.m33 * b.m33 + a.m34 * b.m43;
      r.m34 = a.m31 * b.m14 + a.m32 * b.m24 + a.m33 * b.m34 + a.m34 * b.m44;
      r.m41 = a.m41 * b.m11 + a.m42 * b.m21 + a.m43 * b.m31 + a.m44 * b.m41;
      r.m42 = a.m41 * b.m12 + a.m42 * b.m22 + a.m43 * b.m32 + a.m44 * b.m42;
      r.m43 = a.m41 * b.m13 + a.m42 * b.m23 + a.m43 * b.m33 + a.m44 * b.m43;
      r.m44 = a.m41 * b.m14 + a.m42 * b.m24 + a.m43 * b.m34 + a.m44 * b.m44;
      r.is2D = a.is2D && b.is2D;
      r.isIdentity = r.is2D && r.m11 === 1 && r.m22 === 1 && r.m41 === 0 && r.m42 === 0;
      return r;
    }

    translateSelf(tx, ty, tz) {
      return this;
    }

    scaleSelf(sx, sy, sz) {
      return this;
    }

    rotateSelf(rx, ry, rz) {
      return this;
    }

    get a() { return this.m11; }
    set a(v) { this.m11 = v; }
    get b() { return this.m12; }
    set b(v) { this.m12 = v; }
    get c() { return this.m21; }
    set c(v) { this.m21 = v; }
    get d() { return this.m22; }
    set d(v) { this.m22 = v; }
    get e() { return this.m41; }
    set e(v) { this.m41 = v; }
    get f() { return this.m42; }
    set f(v) { this.m42 = v; }
  }

  globalThis.DOMMatrix = DOMMatrixPolyfill;
}