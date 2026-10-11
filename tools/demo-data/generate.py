#!/usr/bin/env python3
"""
Generates the synthetic demo cases shipped with the backend.

Everything here is procedural: no patient data is involved. Each case is a
distal radius malunion described by a handful of parameters. From those the
script derives, in one consistent millimetre frame:

  * a CT-like voxel volume of the wrist (int16, stored value = HU + 1024)
  * the "designer" surface models as binary STL: bones, cut fragments, a
    patient-matched volar plate, screws and a cutting/drilling guide
  * manifest.json, which the backend reads to seed its database

Frame (millimetres, right-handed, the same for volumes and models):
  y  volar  (-)  ->  dorsal (+)
  z  proximal    ->  distal
  x  completes the frame: radial is -x on a left wrist and +x on a right wrist

The anatomy below is modelled as a left wrist; right wrists are mirrored in x on export.

Shapes are implicit functions (negative inside) evaluated on regular grids
and meshed with marching cubes, so the plate and the guide can be defined
as offset shells of the bone they sit on.

Usage:  pip install -r requirements.txt && python generate.py
"""
from __future__ import annotations

import gzip
import json
import math
import struct
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pyfqmr
from scipy import ndimage
from skimage import measure

OUT = Path(__file__).resolve().parents[2] / "backend/src/main/resources/demo-assets"

# ---- CT grid ---------------------------------------------------------------
SPACING = 0.6  # mm, isotropic
DIMS = (112, 96, 160)  # voxels in x, y, z
ORIGIN = (-(DIMS[0] - 1) * SPACING / 2, -(DIMS[1] - 1) * SPACING / 2, 0.0)  # centre of voxel 0
RESCALE_INTERCEPT = -1024  # HU = stored * slope + intercept, as in DICOM CT
F32 = np.float32


# ---- small implicit-surface toolkit ------------------------------------------
def smoothstep(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def smin(a, b, k):
    """Smooth union: like min(a, b) with a fillet of size k."""
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    """Smooth intersection."""
    return -smin(-a, -b, k)


def ellipsoid(x, y, z, c, r):
    q = np.sqrt(((x - c[0]) / r[0]) ** 2 + ((y - c[1]) / r[1]) ** 2 + ((z - c[2]) / r[2]) ** 2)
    return (q - 1.0) * min(r)


def capsule(x, y, z, a, b, r):
    a = np.asarray(a, dtype=F32)
    b = np.asarray(b, dtype=F32)
    ab = b - a
    t = ((x - a[0]) * ab[0] + (y - a[1]) * ab[1] + (z - a[2]) * ab[2]) / float(ab @ ab)
    t = np.clip(t, 0.0, 1.0)
    return np.sqrt((x - a[0] - t * ab[0]) ** 2 + (y - a[1] - t * ab[1]) ** 2 + (z - a[2] - t * ab[2]) ** 2) - r


def cylinder(x, y, z, a, b, r):
    """Finite cylinder from a to b with flat ends."""
    a = np.asarray(a, dtype=F32)
    b = np.asarray(b, dtype=F32)
    ab = b - a
    length = float(np.linalg.norm(ab))
    u = ab / length
    t = (x - a[0]) * u[0] + (y - a[1]) * u[1] + (z - a[2]) * u[2]
    radial = np.sqrt(
        np.maximum((x - a[0] - t * u[0]) ** 2 + (y - a[1] - t * u[1]) ** 2 + (z - a[2] - t * u[2]) ** 2, 0.0)
    )
    return np.maximum(radial - r, np.abs(t - length / 2) - length / 2)


def to_distance(f, h):
    """First-order distance estimate f / |grad f|, good near the surface."""
    gx, gy, gz = np.gradient(f, h)
    g = np.sqrt(gx * gx + gy * gy + gz * gz)
    return f / np.maximum(g, 0.25)


def grid(lo, hi, h):
    axes = [np.arange(lo[i], hi[i] + h / 2, h, dtype=F32) for i in range(3)]
    x, y, z = np.meshgrid(*axes, indexing="ij")
    return x, y, z


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


# ---- reference anatomy (an idealised, undeformed left distal forearm) ------------
TAN_INCL = math.tan(math.radians(22))  # radial inclination
TAN_TILT = math.tan(math.radians(11))  # volar tilt
JOINT_Z = 84.0


def radius_profile(z):
    """Centre line and half-widths of the radius cross-section at height z."""
    t = smoothstep((z - 42.0) / 36.0)
    a = 6.8 + 8.7 * t**1.5  # half-width radial-ulnar
    b = 5.8 + 3.7 * t**1.7  # half-width volar-dorsal
    cx = -13.0 + 4.0 * t
    cy = -1.0 * t
    return t, a, b, cx, cy


def joint_surface_z(x, y):
    return JOINT_Z - TAN_INCL * (x + 9.0) + TAN_TILT * y


def ulna_ref(x, y, z):
    ax = (15.5 - 0.3 * z / 68.0, 0.5 + 0.7 * z / 68.0)
    r = 5.3 - 0.7 * smoothstep((z - 44.0) / 20.0)
    shaft = np.maximum(np.sqrt((x - ax[0]) ** 2 + (y - ax[1]) ** 2) - r, z - 70.0)
    head = ellipsoid(x, y, z, (15.0, 1.5, 71.2), (8.0, 8.4, 7.2))
    u = smin(shaft, head, 3.0)
    styloid = capsule(x, y, z, (20.6, 4.0, 74.0), (21.6, 4.6, 82.0), 2.2)
    return smin(u, styloid, 1.5)


def radius_ref(x, y, z):
    t, a, b, cx, cy = radius_profile(z)
    n = 2.2 + 0.5 * t
    tube = ((np.abs(x - cx) / a) ** n + (np.abs(y - cy) / b) ** n) ** (1.0 / n)
    tube = (tube - 1.0) * np.minimum(a, b)
    # Lister's tubercle on the dorsal side
    tube = smin(tube, ellipsoid(x, y, z, (-12.5, 8.2, 73.0), (2.6, 2.4, 6.5)), 1.5)
    # inclined distal end, which also forms the radial styloid
    cap = (z - joint_surface_z(x, y)) * 0.9
    body = smax(tube, cap, 2.5)
    # shallow articular concavity
    nrm = np.array([TAN_INCL, -TAN_TILT, 1.0])
    nrm /= np.linalg.norm(nrm)
    p0 = np.array([-10.0, -0.5, joint_surface_z(-10.0, -0.5)])
    c = p0 + nrm * (22.0 - 1.8)
    sphere = np.sqrt((x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2) - 22.0
    body = smax(body, -sphere, 1.0)
    # sigmoid notch: room for the ulnar head
    notch = np.sqrt((x - 15.0) ** 2 + (y - 1.5) ** 2) - 9.2
    return smax(body, -notch, 1.0)


def carpals_ref(x, y, z, f_radius, f_ulna):
    """Proximal carpal row, carved so that it leaves a joint space."""
    scaphoid = ellipsoid(x, y, z, (-16.0, -1.5, 93.5), (6.2, 5.8, 8.0))
    lunate = ellipsoid(x, y, z, (-3.5, -1.0, 90.5), (6.8, 6.2, 6.0))
    triquetrum = ellipsoid(x, y, z, (9.5, 0.5, 89.5), (5.5, 5.2, 5.5))
    lunate = smax(lunate, -(scaphoid - 1.3), 0.6)
    triquetrum = smax(triquetrum, -(lunate - 1.3), 0.6)
    c = np.minimum(np.minimum(scaphoid, lunate), triquetrum)
    c = smax(c, -(f_radius - 1.9), 0.8)
    return smax(c, -(f_ulna - 3.0), 0.8)


# ---- case definition --------------------------------------------------------------
@dataclass
class Deformity:
    dorsal_tilt_deg: float
    inclination_loss_deg: float
    shortening_mm: float
    dorsal_shift_mm: float
    hinge_z: float = 62.0


@dataclass
class Case:
    key: str
    reference: str
    title: str
    side: str  # RIGHT | LEFT
    patient_pseudonym: str
    patient_birth_year: int
    surgeon: str
    clinic: str
    designer: str
    status: str
    surgery_date: str
    created_at: str
    deformity: Deformity
    seed: int
    planned: bool
    plan_notes: str | None
    history: list = field(default_factory=list)


class Malunion:
    """Rigid transform T (reference -> malunited) blended in over the fracture zone."""

    def __init__(self, d: Deformity):
        self.d = d
        _, _, b, cx, cy = radius_profile(d.hinge_z)
        # hinge on the volar cortex, so the correction opens a dorsal wedge
        self.C = np.array([cx, cy - b, d.hinge_z])
        self.R = rot_x(-math.radians(d.dorsal_tilt_deg)) @ rot_y(-math.radians(d.inclination_loss_deg))
        self.t = np.array([0.0, d.dorsal_shift_mm, -d.shortening_mm])
        half = math.radians(d.dorsal_tilt_deg) / 2
        self.cut_normal = np.array([0.0, math.sin(half), math.cos(half)])

    def forward(self, p):
        return self.R @ (np.asarray(p, dtype=float) - self.C) + self.C + self.t

    def forward_dir(self, v):
        return self.R @ np.asarray(v, dtype=float)

    def inverse_xyz(self, x, y, z):
        px, py, pz = x - self.C[0] - self.t[0], y - self.C[1] - self.t[1], z - self.C[2] - self.t[2]
        Rt = self.R.T
        return (
            Rt[0, 0] * px + Rt[0, 1] * py + Rt[0, 2] * pz + self.C[0],
            Rt[1, 0] * px + Rt[1, 1] * py + Rt[1, 2] * pz + self.C[1],
            Rt[2, 0] * px + Rt[2, 1] * py + Rt[2, 2] * pz + self.C[2],
        )

    def forward_xyz(self, x, y, z):
        px, py, pz = x - self.C[0], y - self.C[1], z - self.C[2]
        R = self.R
        return (
            R[0, 0] * px + R[0, 1] * py + R[0, 2] * pz + self.C[0] + self.t[0],
            R[1, 0] * px + R[1, 1] * py + R[1, 2] * pz + self.C[1] + self.t[1],
            R[2, 0] * px + R[2, 1] * py + R[2, 2] * pz + self.C[2] + self.t[2],
        )

    def weight(self, z):
        # fully rigid just distal of the hinge; healed, smooth bend proximal of it
        return smoothstep((z - (self.d.hinge_z - 9.0)) / 10.0)

    def to_reference(self, x, y, z):
        """Malunited-space point -> the reference-space point it came from."""
        w = self.weight(z)
        qx, qy, qz = self.inverse_xyz(x, y, z)
        return x + w * (qx - x), y + w * (qy - y), z + w * (qz - z), w

    def side(self, x, y, z):
        """Signed distance to the osteotomy plane; negative on the proximal side."""
        n, c = self.cut_normal, self.C
        return n[0] * (x - c[0]) + n[1] * (y - c[1]) + n[2] * (z - c[2])


class Anatomy:
    """All implicit functions of one case, in the pre-op (scanner) frame."""

    KERF = 0.4  # half the saw-blade thickness

    def __init__(self, deformity: Deformity):
        self.m = Malunion(deformity)

    def ulna(self, x, y, z):
        return ulna_ref(x, y, z)

    def radius_preop(self, x, y, z, with_w=False):
        qx, qy, qz, w = self.m.to_reference(x, y, z)
        f = radius_ref(qx, qy, qz)
        f = f - 0.5 * np.exp(-(((z - self.m.d.hinge_z + 3.0) / 6.0) ** 2))  # callus
        return (f, qz) if with_w else f

    def carpals_preop(self, x, y, z):
        qx, qy, qz, _ = self.m.to_reference(x, y, z)
        return carpals_ref(qx, qy, qz, radius_ref(qx, qy, qz), ulna_ref(qx, qy, qz))

    def fragment_proximal(self, x, y, z):
        return np.maximum(self.radius_preop(x, y, z), self.m.side(x, y, z) + self.KERF)

    def fragment_distal_preop(self, x, y, z):
        return np.maximum(self.radius_preop(x, y, z), -self.m.side(x, y, z) + self.KERF)

    def fragment_distal_planned(self, x, y, z):
        return self.fragment_distal_preop(*self.m.forward_xyz(x, y, z))

    def plate_bed(self, x, y, z):
        """Surface the plate is contoured to: both planned fragments, bridged over the wedge."""
        return smin(self.planned_radius(x, y, z), radius_ref(x, y, z), 0.8)

    def planned_radius(self, x, y, z):
        return np.minimum(self.fragment_proximal(x, y, z), self.fragment_distal_planned(x, y, z))


# ---- implants and guide -----------------------------------------------------------------
PLATE_GAP = 0.25
PLATE_THICKNESS = 2.0
HOLE_R = 1.6
SHAFT_X = -13.0


def plate_holes():
    """(id, x, z, group) in planned space. Distal row follows the joint line."""
    holes = [("S1", SHAFT_X, 36.0, "shaft"), ("S2", SHAFT_X, 43.0, "shaft"), ("S3", SHAFT_X, 50.0, "shaft")]
    holes += [("H1", -15.2, 72.6, "head"), ("H2", -8.6, 70.6, "head")]
    for i, hx in enumerate((-18.5, -12.0, -5.5, 0.5)):
        holes.append((f"D{i + 1}", hx, float(joint_surface_z(hx, -9.0)) - 6.6, "distal"))
    return holes


def plate_footprint(x, z):
    """2D outline of the plate seen from volar (negative inside)."""
    shaft = np.maximum(np.abs(x - SHAFT_X) - 4.6, np.abs(z - 49.0) - 17.5)
    neck = np.maximum(np.abs(x - (SHAFT_X + (z - 60.0) * 0.12)) - (4.6 + np.clip(z - 60.0, 0, 8) * 0.55), np.abs(z - 64.0) - 5.0)
    distal_edge = z - (joint_surface_z(x, -9.0) - 3.6)
    head = smax(smax(np.abs(x + 8.8) - 12.4, 66.5 - z, 1.5), distal_edge, 1.5)
    return smin(smin(shaft, neck, 2.0), head, 2.5) + 0.6  # +0.6 shrinks slightly, rounding the outline


def build_plate(an: Anatomy, h=0.25):
    x, y, z = grid((-25.5, -17.0, 28.0), (7.0, 3.0, 84.0), h)
    # A plate is a smooth body: relax the bed along the bone axis so it does not follow every bump.
    bed = ndimage.gaussian_filter(an.plate_bed(x, y, z), sigma=(0.4 / h, 0.4 / h, 3.0 / h), mode="nearest")
    d = to_distance(bed, h)
    _, _, _, _, cy = radius_profile(z)
    f = smax(d - (PLATE_GAP + PLATE_THICKNESS), PLATE_GAP - d, 0.35)
    f = smax(f, plate_footprint(x, z), 0.5)
    f = np.maximum(f, y - (cy - 1.0))  # volar side only
    for _, hx, hz, _ in plate_holes():
        f = np.maximum(f, -(np.sqrt((x - hx) ** 2 + (z - hz) ** 2) - HOLE_R))
    # oblong positioning slot on the shaft
    slot = np.sqrt((x - SHAFT_X) ** 2 + (np.abs(z - 56.0) - np.minimum(np.abs(z - 56.0), 1.6)) ** 2) - 1.5
    f = np.maximum(f, -slot)
    # the relaxed bed may dip into the real bone: never let the plate intersect it
    f = np.maximum(f, 0.1 - to_distance(an.planned_radius(x, y, z), h))
    return f, (x[0, 0, 0], y[0, 0, 0], z[0, 0, 0]), h


def surface_span(fn, hx, hz):
    """Volar and dorsal bone surface along the y axis through (hx, hz)."""
    ys = np.arange(-22.0, 22.0, 0.05, dtype=F32)
    f = fn(np.full_like(ys, hx), ys, np.full_like(ys, hz))
    inside = np.where(f < 0)[0]
    return float(ys[inside[0]]), float(ys[inside[-1]])


def screw_axes(an: Anatomy):
    """Screw start/end points in planned space."""
    out = []
    for hid, hx, hz, group in plate_holes():
        y_volar, y_dorsal = surface_span(an.plate_bed, hx, hz)
        # shaft screws are bicortical; head screws stop short of the dorsal cortex and the wedge
        thickness = y_dorsal - y_volar
        depth = {"shaft": thickness - 1.5, "head": 0.6 * thickness, "distal": 0.75 * thickness}[group]
        start = np.array([hx, y_volar - PLATE_GAP - PLATE_THICKNESS + 0.15, hz])
        end = np.array([hx, y_volar + depth, hz])
        out.append((hid, group, start, end, y_volar))
    return out


def build_screws(an: Anatomy, h=0.3):
    x, y, z = grid((-22.5, -17.0, 32.0), (4.5, 13.0, 84.0), h)
    f = np.full(x.shape, 1e3, dtype=F32)
    for _, _, start, end, y_volar in screw_axes(an):
        head_end = np.array([start[0], y_volar - PLATE_GAP + 0.1, start[2]])
        f = np.minimum(f, cylinder(x, y, z, start, head_end, HOLE_R - 0.08))
        f = np.minimum(f, capsule(x, y, z, start, end, 1.25))
    return f, (x[0, 0, 0], y[0, 0, 0], z[0, 0, 0]), h


def guide_sleeves(an: Anatomy):
    """Drill sleeves in pre-op space. Distal holes are carried back through the deformity,
    so holes drilled before the cut line up with the plate after the correction."""
    m = an.m
    sleeves = []
    for hid, _, start, _, y_volar in screw_axes(an):
        if hid not in ("S2", "S3", "H1", "H2", "D2", "D3"):
            continue
        p = np.array([start[0], y_volar, start[2]])
        axis = np.array([0.0, 1.0, 0.0])
        if not hid.startswith("S"):
            p, axis = m.forward(p), m.forward_dir(axis)
        sleeves.append((hid, p, axis))
    return sleeves


def build_guide(an: Anatomy, h=0.25):
    m = an.m
    x, y, z = grid((-27.0, -21.0, 34.0), (5.0, 8.0, 80.0), h)
    d = to_distance(an.radius_preop(x, y, z), h)
    sleeves = guide_sleeves(an)
    order = ["S2", "S3", "H2", "H1", "D2", "D3", "H2"]
    pts = {hid: p for hid, p, _ in sleeves}
    # base: a strip of shell following a path through the sleeves
    path = np.full(x.shape, 1e3, dtype=F32)
    for a, b in zip(order, order[1:]):
        path = np.minimum(path, capsule(x, y, z, pts[a], pts[b], 4.6))
    f = smax(smax(d - 3.0, PLATE_GAP - d, 0.4), path, 0.8)
    for _, p, axis in sleeves:
        f = smin(f, cylinder(x, y, z, p + axis * 1.0, p - axis * 6.5, 2.9), 0.7)
    # cutting block with a saw slot along the osteotomy plane
    side = m.side(x, y, z)
    block = np.maximum(np.abs(side) - 3.0, np.abs(x - (m.C[0] - 0.5)) - 12.6)
    block = np.maximum(np.maximum(block, d - 7.0), y - (m.C[1] + 4.5))
    f = smin(f, block, 0.8)
    slit = np.maximum(np.abs(side) - 0.6, np.abs(x - (m.C[0] - 0.5)) - 10.2)
    f = np.maximum(f, -slit)
    for _, p, axis in sleeves:
        f = np.maximum(f, -(capsule(x, y, z, p + axis * 8.0, p - axis * 12.0, 1.05)))
    f = np.maximum(f, PLATE_GAP - d)  # never intersect the bone
    return f, (x[0, 0, 0], y[0, 0, 0], z[0, 0, 0]), h


# ---- meshing and export ----------------------------------------------------------------------
def mesh_from_field(f, origin, h, target_faces=None):
    f = np.pad(f, 1, constant_values=1.0)  # close the surface at the grid boundary
    verts, faces, _, _ = measure.marching_cubes(f, 0.0, spacing=(h, h, h), gradient_direction="descent")
    verts = verts + (np.asarray(origin, dtype=np.float64) - h)
    faces = faces.astype(np.int64)
    if target_faces and len(faces) > target_faces:
        simplifier = pyfqmr.Simplify()
        simplifier.setMesh(verts, faces)
        simplifier.simplify_mesh(target_count=target_faces, aggressiveness=5, preserve_border=True, verbose=False)
        verts, faces, _ = simplifier.getMesh()
    return np.asarray(verts, dtype=np.float64), np.asarray(faces, dtype=np.int64)


def keep_largest_component(verts, faces):
    """Drops marching-cubes crumbs that are not attached to the main body."""
    parent = np.arange(len(verts))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for a, b, c in faces:
        ra, rb, rc = find(a), find(b), find(c)
        parent[rb] = ra
        parent[rc] = ra
    roots = np.array([find(i) for i in faces[:, 0]])
    values, counts = np.unique(roots, return_counts=True)
    return verts, faces[roots == values[np.argmax(counts)]]


def signed_volume(verts, faces):
    a, b, c = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)


def disc_mesh(center, normal, radius, thickness=0.3, segments=64):
    n = np.asarray(normal, dtype=float)
    n /= np.linalg.norm(n)
    u = np.cross(n, [1.0, 0.0, 0.0])
    u /= np.linalg.norm(u)
    v = np.cross(n, u)
    ang = np.linspace(0, 2 * math.pi, segments, endpoint=False)
    ring = np.outer(np.cos(ang), u) + np.outer(np.sin(ang), v)
    c = np.asarray(center, dtype=float)
    top, bottom = c + n * thickness / 2, c - n * thickness / 2
    verts = np.vstack([top + ring * radius, bottom + ring * radius, top, bottom])
    faces = []
    for i in range(segments):
        j = (i + 1) % segments
        faces += [(2 * segments, i, j), (2 * segments + 1, segments + j, segments + i)]
        faces += [(i, segments + i, segments + j), (i, segments + j, j)]
    return verts, np.array(faces, dtype=np.int64)


def write_stl(path: Path, verts, faces, mirror: bool, label: str) -> int:
    v = verts.astype(np.float32).copy()
    f = faces.copy()
    if mirror:
        v[:, 0] = -v[:, 0]
        f = f[:, [0, 2, 1]]  # keep outward-facing winding after mirroring
    tri = v[f]
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    rec = np.zeros(len(f), dtype=[("n", "<f4", 3), ("v", "<f4", (3, 3)), ("attr", "<u2")])
    rec["n"], rec["v"] = n, tri
    with open(path, "wb") as fh:
        fh.write(label.encode("ascii")[:80].ljust(80, b" "))
        fh.write(struct.pack("<I", len(f)))
        fh.write(rec.tobytes())
    return len(f)


# ---- CT synthesis --------------------------------------------------------------------------------
def synthesize_ct(an: Anatomy, seed: int) -> np.ndarray:
    """Returns stored int16 values, shape (nx, ny, nz). Sampled at 2x and averaged for partial volume."""
    rng = np.random.default_rng(seed)
    h = SPACING / 2
    lo = tuple(ORIGIN[i] - h / 2 for i in range(3))
    hi = tuple(lo[i] + (DIMS[i] * 2 - 1) * h for i in range(3))
    x, y, z = grid(lo, hi, h)
    assert x.shape == tuple(d * 2 for d in DIMS), x.shape

    qx, qy, qz, _ = an.m.to_reference(x, y, z)

    # soft tissue: the hand follows the distal fragment
    hx = 30.0 + 1.5 * smoothstep((qz - 70.0) / 25.0) - 2.0 * smoothstep(qz / 60.0)
    hy = 19.5 - 2.5 * smoothstep(qz / 70.0)
    limb = (np.sqrt(((qx - 0.5) / hx) ** 2 + ((qy - 0.5) / hy) ** 2) - 1.0) * hy
    forearm = (np.sqrt(((x - 0.5) / 29.0) ** 2 + ((y - 0.5) / 18.0) ** 2) - 1.0) * 18.0
    limb = smin(limb, np.maximum(forearm, z - 84.0), 4.0)
    hu = np.full(x.shape, -1000.0, dtype=F32)
    hu[limb < 0] = 65.0  # skin
    hu[limb < -1.2] = -95.0  # subcutaneous fat
    muscle = limb < -4.0
    hu[muscle] = 48.0

    texture = ndimage.gaussian_filter(rng.standard_normal(x.shape).astype(F32), 1.3)
    texture /= texture.std()

    def paint(f, flare, cortex_shaft, cortex_end):
        d = to_distance(f, h)
        thickness = cortex_shaft + (cortex_end - cortex_shaft) * flare
        cortical = 1650.0 - 450.0 * flare
        cancellous = 380.0 + 170.0 * texture
        marrow = -40.0 + 25.0 * texture
        medullary = marrow + (cancellous - marrow) * smoothstep(flare * 1.6)
        edge = smoothstep((d + thickness) / 0.5)  # 0 deep inside, 1 in the cortex
        inside = d < 0
        hu[inside] = (medullary + (cortical - medullary) * edge)[inside]

    f_radius, radius_qz = an.radius_preop(x, y, z, with_w=True)
    paint(f_radius, smoothstep((radius_qz - 44.0) / 30.0), 2.7, 1.0)
    paint(an.ulna(x, y, z), smoothstep((z - 56.0) / 12.0), 2.3, 0.9)
    paint(an.carpals_preop(x, y, z), np.ones_like(x), 0.9, 0.9)

    hu = hu.reshape(DIMS[0], 2, DIMS[1], 2, DIMS[2], 2).mean(axis=(1, 3, 5))
    hu = ndimage.gaussian_filter(hu, 0.45)  # scanner point spread
    hu += rng.normal(0.0, 16.0, hu.shape)
    stored = np.clip(np.rint(hu), -1024, 3071) - RESCALE_INTERCEPT
    return stored.astype("<i2")


# ---- cases ---------------------------------------------------------------------------------------
CASES = [
    Case(
        key="tr-2026-0142",
        reference="TR-2026-0142",
        title="Distal radius malunion, dorsal tilt",
        side="RIGHT",
        patient_pseudonym="P-48213",
        patient_birth_year=1968,
        surgeon="Dr. L. Brunner",
        clinic="Demo Clinic North",
        designer="M. Frei",
        status="AWAITING_APPROVAL",
        surgery_date="2026-11-05",
        created_at="2026-10-01T08:12:00Z",
        deformity=Deformity(28.0, 8.0, 3.5, 1.5),
        seed=142,
        planned=True,
        plan_notes=(
            "Volar opening-wedge osteotomy 22 mm proximal to the joint line. Correction of 28° dorsal tilt "
            "and 8° loss of radial inclination, 3.5 mm lengthening. Fixation with a patient-matched volar "
            "plate and nine 2.5 mm screws. The guide pre-drills six of the holes before the cut."
        ),
        history=[
            ("2026-10-01T08:12:00Z", None, "IN_DESIGN", "CREATE", "Dr. L. Brunner", "Case created, CT uploaded."),
            ("2026-10-06T15:40:00Z", "IN_DESIGN", "AWAITING_APPROVAL", "SUBMIT_FOR_APPROVAL", "M. Frei",
             "First proposal ready for review."),
        ],
    ),
    Case(
        key="tr-2026-0137",
        reference="TR-2026-0137",
        title="Distal radius malunion with shortening",
        side="LEFT",
        patient_pseudonym="P-47790",
        patient_birth_year=1981,
        surgeon="Dr. A. Keller",
        clinic="Demo Clinic North",
        designer="M. Frei",
        status="APPROVED",
        surgery_date="2026-10-22",
        created_at="2026-09-18T10:05:00Z",
        deformity=Deformity(18.0, 12.0, 5.0, 0.5),
        seed=137,
        planned=True,
        plan_notes=(
            "Volar opening-wedge osteotomy 22 mm proximal to the joint line. Correction of 18° dorsal tilt "
            "and 12° loss of radial inclination, 5 mm lengthening to restore ulnar variance. Fixation with a "
            "patient-matched volar plate and nine 2.5 mm screws."
        ),
        history=[
            ("2026-09-18T10:05:00Z", None, "IN_DESIGN", "CREATE", "Dr. A. Keller", "Case created, CT uploaded."),
            ("2026-09-24T09:20:00Z", "IN_DESIGN", "AWAITING_APPROVAL", "SUBMIT_FOR_APPROVAL", "M. Frei", None),
            ("2026-09-25T17:02:00Z", "AWAITING_APPROVAL", "IN_DESIGN", "REQUEST_CHANGES", "Dr. A. Keller",
             "Please move the plate 2 mm proximal, it sits too close to the watershed line."),
            ("2026-09-29T11:48:00Z", "IN_DESIGN", "AWAITING_APPROVAL", "SUBMIT_FOR_APPROVAL", "M. Frei",
             "Plate moved 2 mm proximal."),
            ("2026-09-30T07:31:00Z", "AWAITING_APPROVAL", "APPROVED", "APPROVE", "Dr. A. Keller", None),
        ],
    ),
    Case(
        key="tr-2026-0149",
        reference="TR-2026-0149",
        title="Distal radius malunion, new case",
        side="RIGHT",
        patient_pseudonym="P-48377",
        patient_birth_year=1959,
        surgeon="Dr. L. Brunner",
        clinic="Demo Clinic North",
        designer="S. Meier",
        status="IN_DESIGN",
        surgery_date="2026-11-26",
        created_at="2026-10-09T13:27:00Z",
        deformity=Deformity(23.0, 4.0, 2.0, 2.5),
        seed=149,
        planned=False,
        plan_notes=None,
        history=[
            ("2026-10-09T13:27:00Z", None, "IN_DESIGN", "CREATE", "Dr. L. Brunner", "Case created, CT uploaded."),
        ],
    ),
]

COLORS = {
    "BONE": "#E4D7BD",
    "BONE_SECONDARY": "#D6C9B0",
    "BONE_FRAGMENT": "#EEDCA8",
    "PLATE": "#3E7CCB",
    "SCREW": "#C9A441",
    "GUIDE": "#5FCFB4",
    "OSTEOTOMY_PLANE": "#E5484D",
}


def build_case(case: Case) -> dict:
    print(f"== {case.reference}")
    out = OUT / case.key
    out.mkdir(parents=True, exist_ok=True)
    mirror = case.side == "RIGHT"
    an = Anatomy(case.deformity)
    models = []

    def add(name, kind, stage, color_key, verts, faces, filename):
        vol = signed_volume(verts, faces)
        assert vol > 0, f"{name}: inverted or empty mesh"
        tris = write_stl(out / filename, verts, faces, mirror, f"Trabecula synthetic demo model: {name}")
        size = (out / filename).stat().st_size
        models.append({
            "name": name, "kind": kind, "stage": stage, "color": COLORS[color_key],
            "file": f"{case.key}/{filename}", "triangleCount": tris, "sizeBytes": size,
            "volumeMm3": round(vol, 1),
        })
        print(f"   {name:<34} {stage:<8} {tris:>6} tris  {size / 1024:>6.0f} kB  {vol / 1000:>7.3f} cm3")

    def bone(fn, lo, hi, target, h=0.4):
        x, y, z = grid(lo, hi, h)
        f = np.maximum(fn(x, y, z), 1.2 - z)  # models end just inside the scanned range
        return keep_largest_component(*mesh_from_field(f, (x[0, 0, 0], y[0, 0, 0], z[0, 0, 0]), h, target))

    lo_r, hi_r = (-31.0, -18.0, 0.0), (9.0, 26.0, 95.0)
    radius = bone(an.radius_preop, lo_r, hi_r, 22000)
    ulna = bone(an.ulna, (5.0, -10.0, 0.0), (26.0, 13.0, 86.0), 12000)
    add("Radius", "BONE", "PREOP", "BONE", *radius, "radius-preop.stl")
    add("Ulna", "BONE", "PREOP", "BONE_SECONDARY", *ulna, "ulna.stl")

    if case.planned:
        m = an.m
        add("Osteotomy plane", "OSTEOTOMY_PLANE", "PREOP", "OSTEOTOMY_PLANE",
            *disc_mesh(m.C + np.array([0.0, 6.5, 0.0]) - m.cut_normal * (6.5 * m.cut_normal[1]), m.cut_normal, 15.0),
            "osteotomy-plane.stl")
        f, o, h = build_guide(an)
        add("Cutting and drilling guide", "GUIDE", "PREOP", "GUIDE",
            *keep_largest_component(*mesh_from_field(f, o, h, 26000)), "guide.stl")
        add("Radius, proximal fragment", "BONE", "PLANNED", "BONE",
            *bone(an.fragment_proximal, lo_r, hi_r, 14000), "radius-proximal.stl")
        add("Radius, corrected distal fragment", "BONE", "PLANNED", "BONE_FRAGMENT",
            *bone(an.fragment_distal_planned, lo_r, hi_r, 14000), "radius-distal-planned.stl")
        add("Ulna", "BONE", "PLANNED", "BONE_SECONDARY", *ulna, "ulna.stl")
        f, o, h = build_plate(an)
        add("Volar plate", "PLATE", "PLANNED", "PLATE",
            *keep_largest_component(*mesh_from_field(f, o, h, 24000)), "plate.stl")
        f, o, h = build_screws(an)
        add("Screws", "SCREW", "PLANNED", "SCREW", *mesh_from_field(f, o, h, 9000), "screws.stl")

    stored = synthesize_ct(an, case.seed)
    if mirror:
        stored = stored[::-1, :, :]
    raw = np.ascontiguousarray(stored.transpose(2, 1, 0)).tobytes()  # x fastest, then y, then z
    volume_file = f"{case.key}/ct.int16.raw.gz"
    with open(OUT / volume_file, "wb") as fh:
        with gzip.GzipFile(fileobj=fh, mode="wb", compresslevel=9, mtime=0) as gz:
            gz.write(raw)
    print(f"   CT volume {DIMS}  {len(raw) / 1e6:.1f} MB raw, {(OUT / volume_file).stat().st_size / 1e6:.1f} MB gzipped")

    d = case.deformity
    return {
        "key": case.key,
        "reference": case.reference,
        "title": case.title,
        "anatomy": "WRIST",
        "side": case.side,
        "patientPseudonym": case.patient_pseudonym,
        "patientBirthYear": case.patient_birth_year,
        "surgeonName": case.surgeon,
        "clinic": case.clinic,
        "designerName": case.designer,
        "status": case.status,
        "surgeryDate": case.surgery_date,
        "createdAt": case.created_at,
        "planNotes": case.plan_notes,
        "deformity": {
            "dorsalTiltDeg": d.dorsal_tilt_deg, "inclinationLossDeg": d.inclination_loss_deg,
            "shorteningMm": d.shortening_mm, "dorsalShiftMm": d.dorsal_shift_mm,
        },
        "models": models,
        "volume": {
            "file": volume_file,
            "description": "CT wrist, 0.6 mm isotropic, bone kernel (synthetic)",
            "dimensions": list(DIMS),
            "spacingMm": [SPACING] * 3,
            "originMm": [round(v, 4) for v in ORIGIN],
            "rescaleSlope": 1.0,
            "rescaleIntercept": float(RESCALE_INTERCEPT),
            "suggestedBoneThresholdHu": 300,
            "uncompressedBytes": len(raw),
        },
        "history": [
            {"at": at, "fromStatus": frm, "toStatus": to, "action": action, "actor": actor, "comment": comment}
            for at, frm, to, action, actor, comment in case.history
        ],
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "note": "Synthetic demo data generated by tools/demo-data/generate.py. Not derived from any patient.",
        "cases": [build_case(c) for c in CASES],
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("manifest written to", OUT / "manifest.json")


if __name__ == "__main__":
    main()
