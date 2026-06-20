import math
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm, mm

# ─────────────────────────────────────────────────────────────────────────────
# HEAD PARAMETERS
# ─────────────────────────────────────────────────────────────────────────────
NI   = 39.0
LR   = 37.0
CIRC = 57.5
R    = CIRC / (2 * math.pi)   # ≈ 9.147 cm

# ─────────────────────────────────────────────────────────────────────────────
# AZIMUTHAL EQUIDISTANT PROJECTION
# Each electrode is defined by its arc distance from Nasion (AP) and from LPA (LR).
# We convert to spherical angles, then to a 3D unit vector, then project.
# ─────────────────────────────────────────────────────────────────────────────

def elec_pos_3d(ap_arc, lr_arc, R=R, NI=NI, LR=LR):
    """
    Convert (AP arc from Nasion, LR arc from LPA) to 3D Cartesian on sphere.
    Coordinate system: x = right, y = anterior, z = up (toward Cz from below)
    Origin = centre of sphere.
    Nasion is at the front of the equator, Inion at the back.
    LPA is left equator, RPA right equator.
    Cz is at the top.
    """
    # Angular positions
    # AP axis: Nasion = -90° from top (z), Inion = +90° from top
    # 50% of NI arc = Cz (top of sphere)
    theta_AP = (ap_arc / NI) * math.pi - math.pi/2   # elevation from equator: 0 at Nasion/Inion equator
    # Actually let's use polar angle from zenith (Cz)
    # Cz is at polar angle 0
    # Nasion is at polar angle = NI/2 / R radians from Cz along sagittal
    cz_ap_arc = 0.5 * NI   # arc from Nasion to Cz
    cz_lr_arc = 0.5 * LR   # arc from LPA to Cz

    # Arc distance from Cz along AP axis
    ap_from_cz = ap_arc - cz_ap_arc   # negative = anterior, positive = posterior
    # Arc distance from Cz along LR axis
    lr_from_cz = lr_arc - cz_lr_arc   # negative = left, positive = right

    # Approximate the 2D flat position using the arc distances directly from Cz
    # (azimuthal equidistant: flat distance = arc distance on sphere)
    # We place Cz at origin; x = right (LR), y = anterior (neg AP from Cz)
    x_arc = lr_from_cz        # cm, positive = right
    y_arc = -ap_from_cz       # cm, positive = anterior (front)

    return x_arc, y_arc

# ─────────────────────────────────────────────────────────────────────────────
# ELECTRODE DEFINITIONS
# ─────────────────────────────────────────────────────────────────────────────

# Existing Unicorn holes (reference, gray)
existing = {
    "Fz":  {"ap": 0.30 * NI, "lr": 0.50 * LR},
    "C3":  {"ap": 0.50 * NI, "lr": 0.30 * LR},
    "Cz":  {"ap": 0.50 * NI, "lr": 0.50 * LR},
    "C4":  {"ap": 0.50 * NI, "lr": 0.70 * LR},
    "Pz":  {"ap": 0.70 * NI, "lr": 0.50 * LR},
    "PO7": {"ap": 0.80 * NI, "lr": 0.25 * LR},
    "Oz":  {"ap": 0.90 * NI, "lr": 0.50 * LR},
    "PO8": {"ap": 0.80 * NI, "lr": 0.75 * LR},
}

# New electrode targets
new_electrodes = {
    "Cz":  {"ap": 0.50 * NI, "lr": 0.50 * LR, "exists": True},
    "C2":  {"ap": 0.50 * NI, "lr": 0.60 * LR, "exists": False},
    "C1":  {"ap": 0.50 * NI, "lr": 0.40 * LR, "exists": False},
    "FC1": {"ap": 0.40 * NI, "lr": 0.40 * LR, "exists": False},
    "CP1": {"ap": 0.60 * NI, "lr": 0.40 * LR, "exists": False},
    "CP3": {"ap": 0.60 * NI, "lr": 0.30 * LR, "exists": False},
    "C3":  {"ap": 0.50 * NI, "lr": 0.30 * LR, "exists": True},
    "FC3": {"ap": 0.40 * NI, "lr": 0.30 * LR, "exists": False},
}

# ─────────────────────────────────────────────────────────────────────────────
# PDF GENERATION
# ─────────────────────────────────────────────────────────────────────────────
WIDTH, HEIGHT = A4
PTS_PER_CM = cm   # 1 cm in points

# Page layout: stencil centred in middle of page
# Cz maps to the centre of the stencil area
STENCIL_CX = WIDTH / 2
STENCIL_CY = HEIGHT / 2 + 1.5 * cm  # shift up slightly for title+legend below

# Stencil boundary: draw an ellipse representing cap outline
# Cap covers roughly ±NI/2 anterior-posterior and ±LR/2 left-right from Cz
# But we only show the relevant region ± ~10 cm
CAP_RX = 0.45 * LR * PTS_PER_CM   # left-right radius on stencil
CAP_RY = 0.45 * NI * PTS_PER_CM   # AP radius on stencil

# Electrode hole size (Unicorn electrode shaft ≈ 8mm diameter, hole ≈ 9-10mm)
HOLE_R_NEW  = 5 * mm   # crosshair target circle for new holes
HOLE_R_EXIST = 4.5 * mm  # reference ring for existing holes


def draw_crosshair(c, px, py, r, arm=7*mm):
    """Draw a crosshair punch marker."""
    c.line(px - arm, py, px + arm, py)
    c.line(px, py - arm, px, py + arm)
    c.circle(px, py, r, stroke=1, fill=0)

def draw_ref_ring(c, px, py, r):
    """Draw a dashed reference ring for existing holes."""
    c.saveState()
    c.setDash([3, 3], 0)
    c.circle(px, py, r, stroke=1, fill=0)
    c.restoreState()


def make_stencil(path):
    c = canvas.Canvas(path, pagesize=A4)

    # ── STENCIL PAGE ──────────────────────────────────────────────────────────
    # Title
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(WIDTH/2, HEIGHT - 1.8*cm,
        "EEG CAP STENCIL — Unicorn Hybrid Black (Size M)")
    c.setFont("Helvetica", 8)
    #c.drawCentredString(WIDTH/2, HEIGHT - 2.5*cm,
        #"PRINT AT 100% SCALE — Do NOT scale to fit. Verify 5 cm ruler below before use.")

    # 5 cm verification ruler
    ruler_x = WIDTH/2 - 2.5*cm
    ruler_y = HEIGHT - 3.3*cm
    c.setStrokeColor(colors.black)
    c.setLineWidth(1)
    c.line(ruler_x, ruler_y, ruler_x + 5*cm, ruler_y)
    c.line(ruler_x, ruler_y - 2*mm, ruler_x, ruler_y + 2*mm)
    c.line(ruler_x + 5*cm, ruler_y - 2*mm, ruler_x + 5*cm, ruler_y + 2*mm)
    for i in range(1, 5):
        tx = ruler_x + i * cm
        c.line(tx, ruler_y - 1*mm, tx, ruler_y + 1*mm)
    c.setFont("Helvetica", 7)
    c.drawCentredString(WIDTH/2, ruler_y - 4*mm, "← 5.00 cm →")

    # ── CAP OUTLINE (azimuthal equidistant projection) ─────────────────────
    c.setStrokeColor(colors.HexColor("#aaaaaa"))
    c.setLineWidth(1.0)
    c.ellipse(STENCIL_CX - CAP_RX, STENCIL_CY - CAP_RY,
              STENCIL_CX + CAP_RX, STENCIL_CY + CAP_RY,
              stroke=1, fill=0)

    # Crosshair grid lines (light)
    c.setStrokeColor(colors.HexColor("#dddddd"))
    c.setLineWidth(0.4)
    c.line(STENCIL_CX, STENCIL_CY - CAP_RY - 5*mm,
           STENCIL_CX, STENCIL_CY + CAP_RY + 5*mm)
    c.line(STENCIL_CX - CAP_RX - 5*mm, STENCIL_CY,
           STENCIL_CX + CAP_RX + 5*mm, STENCIL_CY)

    # Cardinal labels
    c.setFont("Helvetica-Oblique", 7)
    c.setFillColor(colors.HexColor("#888888"))
    c.drawCentredString(STENCIL_CX, STENCIL_CY + CAP_RY + 7*mm, "FRONT (Nasion direction)")
    c.drawCentredString(STENCIL_CX, STENCIL_CY - CAP_RY - 10*mm, "BACK (Inion direction)")
    c.drawString(STENCIL_CX - CAP_RX - 18*mm, STENCIL_CY - 2*mm, "LEFT")
    c.drawString(STENCIL_CX + CAP_RX + 3*mm, STENCIL_CY - 2*mm, "RIGHT")

    # ── EXISTING HOLES (reference, dashed gray rings) ─────────────────────
    c.setStrokeColor(colors.HexColor("#aaaaaa"))
    c.setLineWidth(0.8)
    c.setFillColor(colors.HexColor("#aaaaaa"))
    c.setFont("Helvetica", 6.5)

    for name, pos in existing.items():
        x_arc, y_arc = elec_pos_3d(pos["ap"], pos["lr"])
        px = STENCIL_CX + x_arc * PTS_PER_CM
        py = STENCIL_CY + y_arc * PTS_PER_CM
        draw_ref_ring(c, px, py, HOLE_R_EXIST)
        c.setFillColor(colors.HexColor("#aaaaaa"))
        c.drawString(px + 5*mm, py - 2*mm, name)

    # ── NEW ELECTRODE TARGETS ──────────────────────────────────────────────
    for name, pos in new_electrodes.items():
        x_arc, y_arc = elec_pos_3d(pos["ap"], pos["lr"])
        px = STENCIL_CX + x_arc * PTS_PER_CM
        py = STENCIL_CY + y_arc * PTS_PER_CM

        if pos["exists"]:
            # Already exists: draw in orange, label "already exists"
            c.setStrokeColor(colors.HexColor("#e07700"))
            c.setLineWidth(1.2)
            draw_crosshair(c, px, py, HOLE_R_NEW)
            c.setFillColor(colors.HexColor("#e07700"))
            c.setFont("Helvetica-Bold", 7)
            c.drawString(px + 5.5*mm, py + 1.5*mm, f"{name} ✓ (exists)")
        else:
            # New hole: solid blue crosshair
            c.setStrokeColor(colors.HexColor("#1a3fa0"))
            c.setLineWidth(1.5)
            draw_crosshair(c, px, py, HOLE_R_NEW)
            c.setFillColor(colors.HexColor("#1a3fa0"))
            c.setFont("Helvetica-Bold", 8)
            c.drawString(px + 5.5*mm, py + 1.5*mm, f"● {name}")

    # ── DISTANCE ANNOTATIONS (key inter-electrode distances) ────────────────
    # Draw a dashed line between Cz and C1 with distance label
    def draw_dist_line(c, name_a, pos_a, name_b, pos_b, color="#555555"):
        xa, ya = elec_pos_3d(pos_a["ap"], pos_a["lr"])
        xb, yb = elec_pos_3d(pos_b["ap"], pos_b["lr"])
        pxa = STENCIL_CX + xa * PTS_PER_CM
        pya = STENCIL_CY + ya * PTS_PER_CM
        pxb = STENCIL_CX + xb * PTS_PER_CM
        pyb = STENCIL_CY + yb * PTS_PER_CM
        mid_x = (pxa + pxb) / 2
        mid_y = (pya + pyb) / 2
        # arc distance
        d_ap = abs(pos_a["ap"] - pos_b["ap"])
        d_lr = abs(pos_a["lr"] - pos_b["lr"])
        arc_dist = math.sqrt(d_ap**2 + d_lr**2)  # approximate great-circle via Pythagoras on arcs
        flat_dist = math.sqrt((xa - xb)**2 + (ya - yb)**2)  # same thing in this projection

        c.setStrokeColor(colors.HexColor(color))
        c.setLineWidth(0.5)
        c.saveState()
        c.setDash([2, 3], 0)
        c.line(pxa, pya, pxb, pyb)
        c.restoreState()
        c.setFont("Helvetica", 6)
        c.setFillColor(colors.HexColor(color))
        c.drawCentredString(mid_x, mid_y + 2*mm, f"{flat_dist:.1f} cm")

    draw_dist_line(c, "Cz", new_electrodes["Cz"], "C1", new_electrodes["C1"], "#334488")
    draw_dist_line(c, "Cz", new_electrodes["Cz"], "C2", new_electrodes["C2"], "#334488")
    draw_dist_line(c, "C1", new_electrodes["C1"], "C3", new_electrodes["C3"], "#334488")
    draw_dist_line(c, "FC1", new_electrodes["FC1"], "CP1", new_electrodes["CP1"], "#668833")
    draw_dist_line(c, "FC3", new_electrodes["FC3"], "CP3", new_electrodes["CP3"], "#668833")

    # ── LEGEND ────────────────────────────────────────────────────────────────
    legend_y = STENCIL_CY - CAP_RY - 22*mm
    c.setLineWidth(1.5)
    c.setStrokeColor(colors.HexColor("#1a3fa0"))
    arm = 4*mm
    lx = WIDTH/2 - 5.5*cm
    c.line(lx, legend_y, lx + 2*arm, legend_y)
    c.line(lx + arm, legend_y - arm, lx + arm, legend_y + arm)
    c.circle(lx + arm, legend_y, HOLE_R_NEW * 0.7, stroke=1, fill=0)
    c.setFont("Helvetica", 8)
    c.setFillColor(colors.black)
    c.drawString(lx + 2*arm + 3*mm, legend_y - 2.5*mm, "= New hole to punch")

    lx2 = WIDTH/2 + 0.5*cm
    c.setStrokeColor(colors.HexColor("#aaaaaa"))
    c.setLineWidth(0.8)
    c.saveState()
    c.setDash([3,3], 0)
    c.circle(lx2 + arm, legend_y, HOLE_R_EXIST * 0.7, stroke=1, fill=0)
    c.restoreState()
    c.setFillColor(colors.HexColor("#888888"))
    c.drawString(lx2 + 2*arm + 3*mm, legend_y - 2.5*mm, "= Existing Unicorn hole (ref)")

    c.setStrokeColor(colors.HexColor("#e07700"))
    c.setLineWidth(1.2)
    lx3 = WIDTH/2 - 5.5*cm
    c.line(lx3, legend_y - 10*mm, lx3 + 2*arm, legend_y - 10*mm)
    c.line(lx3 + arm, legend_y - 10*mm - arm, lx3 + arm, legend_y - 10*mm + arm)
    c.circle(lx3 + arm, legend_y - 10*mm, HOLE_R_NEW * 0.7, stroke=1, fill=0)
    c.setFillColor(colors.HexColor("#e07700"))
    c.drawString(lx3 + 2*arm + 3*mm, legend_y - 12.5*mm, "= Already exists, use for alignment")

    # ── INSTRUCTIONS BOX ─────────────────────────────────────────────────────
    inst_y = legend_y - 22*mm
    c.setFillColor(colors.HexColor("#f0f4ff"))
    c.setStrokeColor(colors.HexColor("#334488"))
    c.setLineWidth(0.6)
    c.rect(WIDTH/2 - 8*cm, inst_y - 2.2*cm, 16*cm, 2.5*cm, stroke=1, fill=1)
    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(colors.HexColor("#1a3fa0"))
    c.drawString(WIDTH/2 - 7.7*cm, inst_y + 0.1*cm, "HOW TO USE THIS STENCIL:")
    c.setFont("Helvetica", 7)
    c.setFillColor(colors.black)
    lines = [
        "1. Print at EXACTLY 100% (no fit-to-page). Verify the 5 cm ruler above matches a real ruler.",
        "2. Put the Unicorn cap on the subject's head. Align Cz (existing centre hole) with the Cz crosshair.",
        "3. Align C3 (existing left hole) with the C3 crosshair — this fixes rotation. Tape stencil in place.",
        "4. Use a fabric marker or thin awl to mark/punch through each BLUE crosshair centre. Orange = skip.",
    ]
    for i, line in enumerate(lines):
        c.drawString(WIDTH/2 - 7.7*cm, inst_y - 0.2*cm - i * 0.45*cm, line)

    # ── FOOTER ───────────────────────────────────────────────────────────────
    c.setFont("Helvetica-Oblique", 6.5)
    c.setFillColor(colors.grey)
    #c.drawCentredString(WIDTH/2, 1.0*cm,
        #f"Subject: NI={NI}cm | LPA-RPA={LR}cm | Circ={CIRC}cm | R≈{R:.2f}cm | "
        #"Projection: azimuthal equidistant centred on Cz")

    c.save()
    print(f"Stencil PDF saved to: {path}")

make_stencil("data/misc/Unicorn_EEG_Cap_Stencil.pdf")