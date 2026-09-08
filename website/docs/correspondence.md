# Example 4 correspondence laboratory

Source: Y. Luo, M. Mj, S. Mukherjee, *Teichmüller spaces, polynomial loci, and degeneration in spaces of algebraic correspondences*, [arXiv:2504.13107v2](https://arxiv.org/pdf/2504.13107v2), Example 4 (p.30), Definition 3.1 and Theorem 3.5 / equation (3.2). Also [*Matings, holomorphic correspondences, and a Bers slice*](https://jep.centre-mersenne.org/item/10.5802/jep.315.pdf), §§6.4 and 7.1. These are original computed images, not copied figures.

## Normalization and scope

R_c(z) = z + c/z − c/(3z³) + 1/(5z⁵).

The correspondence is (R_c(x) − R_c(1/y))/(x − 1/y) = 0; the quotient removes the trivial reciprocal branch. The involution is holomorphic η(z)=1/z, **without conjugation**.

This implementation uses **real c in [−3/5,3/5]**, including the pinched endpoints, with D the exterior unit disk on the sphere. It is not a parametrization of the full complex Bers locus. In particular D cannot be assumed to be the exterior unit disk for arbitrary complex c.

Let Ω=R_c(D), an unbounded domain, and let ζ be the unique exterior root of R_c(ζ)=w. On Ω the associated B-involution is F_c(w)=R_c(1/ζ). The rank-zero tile is the bounded side of γ(t)=R_c(exp(it)); cusp points are excluded. The sets shown are pulled back through R_c from the F-plane. We do not iterate R_c as if it were a polynomial, and do not iterate all correspondence branches indiscriminately.

- Tiling set: the lifted orbit reaches the interior of the rank-zero tile.
- Non-escaping set: complement of the tiling set, including the limit set. In this normalization its interior contains two polynomial pieces, with 0 and infinity in the lifted set. Approaching infinity in the F-plane is **not** tiling escape.
- Limit set: their common boundary. The interface between numerically resolved T/K sample pixels provides only a finite-resolution approximation.

“Filled limit set” in §8 of the paper is different from the non-escaping set. This exhibit does not use that potentially confusing term.

## Why this real slice has a usable exterior inverse

This is an implementation-side verification, not a claim that Example 4 explicitly identifies the full real locus.

R′_c(z)=(z²−1)(z⁴+(1−c)z²+1)/z⁶. For |c|<3/5 there are six simple critical points on the unit circle. Writing u=cos(t), s=sin(t), the boundary coordinates are

X = u[(16/5)u⁴ − (4+4c/3)u² + 2+2c],
Y = (4/15)s³(15−5c−12s²).

In this range X has the sign of u and Y the sign of s, so different open quadrants do not meet. In the first quadrant the only cusp is at θ=½ arccos((c−1)/2), between π/4 and π/2. The derivative is

γ′(t)=−2 sin(t) exp(−2it)[2 cos(2t)+1−c].

On [0,π/4], [π/4,θ], [θ,π/2] the coordinate directions are respectively (X↓,Y↑), (X↑,Y↑), (X↓,Y↓). The slope −tan(2t) decreases on the latter two arcs. Comparing their slopes from their shared cusp shows the last arc lies above the middle arc at common X. The first and middle arcs are disjoint by their Y ranges; comparing through the middle arc separates the first and last arcs. Thus the first-quadrant arc is simple. Symmetry gives a Jordan boundary. The argument principle then gives univalence on the exterior disk, normalized by R_c(z)∼z at infinity.

At c=3/5, R_c(i)=R_c(−i)=0: the fundamental tile interior has two components. At c=−3/5, R_c(e^{iπ/4})=R_c(e^{3iπ/4})=4√2 i/5, with a conjugate lower contact: the fundamental tile interior has three components. These counts refer to the rank-zero tile, not the full lifted tiling set. Exterior univalence persists at both endpoints by the nonconstant locally uniform limit theorem for univalent functions. The boundary is no longer Jordan. Boundary sampling uses a multiple of eight so the contact parameters are sampled exactly.

The range cannot be extended past these endpoints while retaining this inverse model. For c>3/5, r⁶−cr⁴−(c/3)r²−1/5 has a root r>1, giving R_c(ir)=R_c(−ir)=0. For c<−3/5, the analogous polynomial r⁶+cr⁴+(c/3)r²−1/5 has a root r>1, giving equal images of distinct exterior points at angles π/4 and 3π/4. Thus exterior univalence fails beyond the selected slice.

The six displayed critical points have arguments 0, θ, π−θ, π, π+θ, 2π−θ. They lie on the correspondence limit set. These are not **all** critical points of R_c: the pole at zero is also critical.

## Numerical safeguards

The polygon approximating γ has uniform chord-deviation bound (6+4|c|)(2π/N)²/8, since sup|γ″|≤6+4|c|. A point within that distance plus a floating-point allowance is left unresolved. Otherwise polygon winding detects the same side of the true curve. A y-index over segments speeds this calculation without changing parity or distance checks.

The inverse solver uses exterior-constrained damped Newton iteration, multiple initial directions, residual checks, derivative checks, and separation from |ζ|=1. The inverse equation is ζ⁶−wζ⁵+cζ⁴−(c/3)ζ²+1/5=0. Exterior univalence ensures there is at most one eligible root; solver failures remain unresolved.

For |c|≤0.6 and |ζ|≥1, |R_c(ζ)−ζ|≤1. If |w|≥4, the exterior inverse satisfies r=|ζ|≥3 and

|F_c(w)| ≥ r⁵/5−0.6r³/3−0.6r−1/r > 2(r+1) ≥ 2|w|.

Thus |w|≥4 is a forward-invariant infinity-basin trap. Direct lower bounds on |R_c(z)| also give this trap for |z|<0.1 and |z|>5. The designated sphere input {re:Infinity, im:0} is handled explicitly; NaN/failed arithmetic is not silently treated as infinity.

Reaching the iteration cap never automatically assigns membership in K or Λ. Boundary uncertainty, failed inverse solving, and iteration exhaustion remain grey. Orbit errors are not propagated by interval arithmetic: all rendered classifications are numerical approximations, **not certified pointwise membership proofs**.

The limit raster marks resolved pixels adjacent in four directions to pixels of the other resolved type. It neither fills unresolved areas as limit set nor pretends the smooth rank-zero tile boundary is Λ. The interface can have gaps and miss subpixel features.

## Interface and verification

A module worker computes one shared grid for three colour layers. Parameter, resolution, depth and viewport changes cancel obsolete work. During recomputation old images are marked with their old c; cusp markers use that same c. Point-inspector text states the requested c separately. All views share pinch, drag, wheel mode, and keyboard navigation. Worker failures have a visible retry action; canvas failures leave the point inspector available. The mobile layout stacks the three panels.

`scripts/correspondence.test.mjs` checks algebra, reciprocal convention, critical points, inverse roots, the conservative boundary band, infinity semantics, iteration exhaustion, symmetry, six lifted tile sectors, interface construction, input limits, accessible formula rendering and workbench inclusion. Existing quadratic-explorer and blog tests remain unchanged. No manuscript or generated blog-post wording is modified by this feature.

## Additive algebraic modes beyond the round model

The original implementation above remains Mode A and is deliberately unchanged. Its exterior inverse, tile-entry test, and the terms *tiling set*, *non-escaping set*, and *limit set* are not reused by the new kernels outside the verified round model. The additional calculations use the ambient algebraic correspondence and answer finite numerical questions only.

The real parameter is divided as follows.

- **Verified round model:** `−3/5 < c < 3/5`. The existing endpoint calculations at `c=±3/5` are displayed separately as pinched limits.
- **Pinched/post-pinched algebraic model:** initially `−1<c<3`, with all inverse sheets retained. Values within the round interval may be used for an all-branch comparison, but this mode still uses algebraic rather than classical set labels.
- **Ramified exploratory model:** `c≤−1` or `c≥3`. At `c=−1` and `c=3` finite critical points collide; beyond them reciprocal pairs of finite critical points leave the unit circle. No claim that these parameters belong to the Bers slice is made.

For every finite nonzero chosen point `x`, set `w=R_c(x)` and solve

```text
15ζ⁶ − 15wζ⁵ + 15cζ⁴ − 5cζ² + 3 = 0.
```

All six numerical roots are computed simultaneously and checked by a scale-aware backward residual. Exactly one occurrence of the known trivial root `ζ=x` is removed. When `x` is critical, the other occurrences in that multiple root are retained. Each of the remaining five roots, counted with multiplicity, gives a correspondence image `y=1/ζ`.

An independent check uses the degree-five polynomial obtained after the trivial factor has been divided out:

```text
H_c(x,y) = 15x⁵ − 3x⁴y⁵ − 3x³y⁴
           + (5cx⁴−3x²)y³ + (5cx³−3x)y²
           + (−15cx⁴+5cx²−3)y.
```

Writing `A_c(x)=15x⁶+15cx⁴−5cx²+3` and `Ã_c(y)=3y⁶−5cy⁴+15cy²+15`, the implementation checks the identity

```text
(xy−1)H_c(x,y) = yA_c(x) − x⁵Ã_c(y).
```

The two numerical root multisets must agree in chordal distance. If they do not, the fibre is unresolved. The projective special fibres are retained algebraically: at `x=0` the images are `y=0` once and `y=∞` four times; at `x=∞` the image is `y=∞` five times.

### Root and multiplicity safeguards

The primary degree-six all-roots method is deterministic Aberth-Ehrlich iteration with several rotated starting polygons. A complex Laguerre method with deflation is the fallback. Every candidate is polished against the original polynomial, and acceptance requires finite values, a scale-aware residual, and Vieta checks. Calculations are repeated in the direct degree-five relation chart. Near-equal roots are clustered in the chordal metric and their multiplicity uncertainty is exposed. Known critical multiplicities are used only to account correctly for the guaranteed trivial root; they never select a preferred correspondence sheet.

Branch colours may be matched between nearby displayed parameter values by a minimum-distance assignment. This is solely a local visual aid. It is not used by the orbit calculation and does not assert a global branch continuation.

### Circle image and winding cells

For every real `c`, the parametrized curve `R_c(S¹)` is sampled at a multiple of eight. The same chord-deviation allowance

```text
(6+4|c|)(2π/N)²/8
```

is retained. Signed winding number, rather than inside/outside parity, labels complementary cells of a self-intersecting curve. Points within the deviation band are unresolved. Non-adjacent segment intersections are found with spatial bins and grouped; transverse crossings and contacts are recorded separately. Critical points and critical values are computed independently from

```text
R'_c(z) = (z²−1)(z⁴+(1−c)z²+1)/z⁶.
```

At `c=−1`, the points `±i` have derivative multiplicity two. At `c=3`, the points `±1` have derivative multiplicity three. The pole at zero has critical multiplicity four and critical value infinity.

### Finite orbit trees and survival language

Every residual-checked image is retained in the finite orbit tree. Numerically equal nodes may be merged within one depth, but every incoming edge, branch label, and multiplicity remains. The deduplication tolerance and node cap are displayed. Reaching a cap produces a visible capped node and an unresolved result; branches are never silently pruned.

For a displayed square and depth `N`, the raster distinguishes four outcomes:

- **All branches survive through depth N:** every branch path remains in the displayed square.
- **Some, but not all, branches survive through depth N:** the existential test succeeds and the universal test fails.
- **All branches escape before depth N:** no branch path remains through the requested depth.
- **Numerically unresolved:** a root set, region-boundary decision, near-multiple fibre, or visible work cap prevents the finite statement from being decided.

Leaving the displayed square ends that path for this test, even if a later algebraic image might return. These outcomes depend on the visible viewport and depth. They do not certify an infinite non-escaping set.

Raster work is performed by a separate module worker. Winding and survival arrays use transferable buffers; survival rows may be displayed progressively. Every message carries a request identifier, and obsolete workers are terminated when the parameter, depth, viewport, or resolution changes. Resolution/depth combinations exceeding the published work budget fail visibly rather than dropping branches.

`scripts/correspondence-algebraic.test.mjs` checks the regime boundaries, derivative factorization, exact collisions at `c=±3/5`, critical multiplicities at `c=−1,3`, all-root residuals, independent relation-chart agreement, projective fibres, conjugation symmetry, winding cells, self-intersections, finite-depth truth values, explicit caps, worker-ready chunks, and the required public terminology.
