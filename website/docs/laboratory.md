# Laboratory implementation notes

These are implementation references, not added blog prose. All post bodies and the Overleaf publishing workflow are unchanged by the Café update.

## Named quadratic examples

The gallery is a curated set of thirteen classical examples, not a claim to enumerate every informal name ever used for a Julia set. The plot computes finite escape-time approximations to **filled** Julia sets; their boundaries are Julia sets. Parameters are stored at full available precision. Siegel and Feigenbaum presets use rounded parameters, and boundary examples need longer iteration limits. Numerical non-escape is not a proof of membership.

- Circle, c=0; Chebyshev interval, c=−2: [Eric Bedford, lecture slide 19](https://www.math.stonybrook.edu/jackfest/Talks/Bedford.pdf).
- Basilica c=−1, double basilica (period-four center) c≈−1.3107026413368328, Cantor dust c=−0.75+0.3i: [Sarah Hruska, thesis, examples 3.6.1, 3.6.3, 3.6.8](https://www.math.stonybrook.edu/theses/thesis02-2/part1.pdf). The period-four center is refined from the real period-four root, not rounded −1.31.
- Douady rabbit, Corabbit and Airplane: roots of c³+2c²+c+1=0, ordered as upper, lower and real roots; [NET map research group](https://intranet.math.vt.edu/netmaps/zoo/airplane/airplane.php).
- Dendrite c=i: [Will Smith, Cornell thesis](https://e.math.cornell.edu/people/belk/projects/WillSmith.pdf).
- Cauliflower c=1/4: [Bedford, parabolic implosion](https://www.math.stonybrook.edu/~ebedford/SemiParabolicImplosion.html).
- Parabolic basilica c=−3/4, fixed multiplier −1: [Radu–Tanase, “fat Basilica” example](https://www.math.stonybrook.edu/preprints/ims16-01.pdf). “San Marco” is an alternative visual name; [van der Laan](https://www.ntg.nl/maps/45/maps.pdf). The more precise mathematical name is primary in the gallery.
- Golden-mean Siegel: θ=(√5−1)/2, λ=exp(2πiθ), c=λ/2−λ²/4; c≈−0.39054087021840006−0.5867879073469687i. [McMullen](https://legacy-www.math.harvard.edu/~ctm/papers/home/text/papers/siegel/siegel.pdf) and [Petersen–Zakeri](https://thiele.ruc.dk/imfufatekster/pdf/344.pdf). The transformation from z²+λz is a translation.
- Feigenbaum: c∞≈−1.4011551890920506, the real period-doubling accumulation value. [Dudko–Gorbovickis–Tucker](https://arxiv.org/pdf/2204.07880) and the decimal in [Tirnakli–Beck–Tsallis](https://webspace.maths.qmul.ac.uk/c.beck/grass-comment.pdf). The latter uses 1−a x²; z=−a x conjugates it to z²−a.

## Field guide

The rabbit period-three component is satellite, not primitive. Its center and attachment are different: the attachment has c=−1/8+(3√3/8)i and fixed multiplier exp(2πi/3). The associated Mandelbrot copy is not an exact affine duplicate. See [Milnor, Periodic Orbits, External Rays and the Mandelbrot Set](https://arxiv.org/pdf/math/9905169), printed pp.27–29,37–38.

At c=i, 0→i→−1+i→−i→−1+i→… has preperiod two and eventual period two. The eventual cycle multiplier is 4(1+i), so it is repelling. See [Goksel](https://www.math.brown.edu/~jhs/JMM2020/10-Fri230-Goksel.pdf), pp.6,14–16. It is not a superattracting period-two parameter.

The real diagram plots 100 late iterates of the critical orbit after a 450-step transient for each sampled parameter. It is **not** all bounded real orbits, the real Julia set, or a certified attractor. Columns use midpoints to avoid the exceptional endpoint c=−2, where the exact critical orbit lands on the repelling fixed point 2. For period-doubling context see [Devaney’s quadratic-family account](https://math.bu.edu/DYSYS/FRACGEOM/node7.html). The period-center buttons are checked by iterating 0; the Feigenbaum limit is not assigned a finite period.

## Moving connectedness loci near the unit circle

The multiplier picker and precise radius input cover the open unit disk, up to floating-point precision; the unit circle is excluded. Projected coordinates stay several rounding units inside it. This is a recomputation of connectedness loci, not pointwise tracking under the holomorphic-motion map. The theoretical disk is the one in [Berteloot–Gauthier, Theorem 2.4](https://www.math.stonybrook.edu/preprints/ims12-08.pdf).

For |μ|≤0.85 the existing β normal form is retained. Closer to the unit circle use [Milnor's mixed normal form, Appendix C](https://arxiv.org/pdf/math/9209221), g(z)=(z+1/z+T)/μ, where T²=4(1−μ)+μ²(1−4q), q=βγ/4. Its critical points are ±1. The two choices of T are conjugate by z↦−z. The chart avoids cancellation in 1−μβ near μ=1. The complex square root likewise computes its smaller component by division, not subtraction of nearly equal magnitudes.

The homogeneous update is [Z:W]↦[Z²+TZW+W²:μZW]. Coordinates are normalized by their largest component at each step. The radius R=2(|T|+1)/(1−|μ|) is a forward-invariant infinity trap: for |z|>R, |g(z)|≥(|z|−|T|−1/|z|)/|μ|>|z|. Both critical orbits must enter the trap to colour a pixel as escaped. Invalid arithmetic, [0:0], and iteration exhaustion stay unresolved.

There is no uniform finite iteration depth across the disk. Very near |μ|=1, much of a finite-depth picture can be unresolved. The interface offers a precise radius, near-boundary presets, up to 4000 iterations, and a concise unresolved-pixel key. Rendering yields every 16 pixels as well as between rows, so long computations can be cancelled. Escape times and exterior palette bands depend on the chart/trap and can change at the chart transition; they are not conformal invariants.

## Navigation

Pointer capture distinguishes a tap from a drag with a six-pixel threshold. Two-pointer zoom preserves the point under the moving midpoint; releasing one finger rebases a subsequent drag. Wheel deltas are normalized; ordinary scroll follows the Pan/Zoom selector, and Ctrl+wheel (including trackpad pinch events) zooms at the pointer. Keyboard: arrows select, Shift gives fine selection, Alt+arrows pan, unmodified +/− zoom, Home resets; Ctrl/Cmd keyboard page zoom is preserved. Buttons remain available. Gesture handling is local to plots, so the rest of the webpage scrolls normally.

Sources for browser event behavior: [MDN wheel event](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event), [MDN pinch gestures](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Pinch_zoom_gestures).

## Social preview

`public/og.png` is a new original image created with the built-in image generator for the branding update (1731×909). It is not a mathematical figure. Brief: understated ivory-and-navy editorial card, exact title “The Iteration Café”, subtitle “a math blog by S. Viswanathan”, restrained iteration curves and a small coffeehouse motif; no equations or additional words. The previous card is backed up outside the public source. No article illustration was replaced.
