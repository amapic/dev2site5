# Annule le side bearing gauche de chaque glyphe de HandTest : les contours partent de x=0
# et la largeur retirée est reportée sur le glyphe précédent pour que l'espacement entre lettres reste identique.
# Usage : python scripts/zero-lsb.py "public/fonts/HandTest (4).ttf"
import shutil
import sys

from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.misc.transform import Transform


def main(path):
    font = TTFont(path)
    glyf = font['glyf']
    glyph_set = font.getGlyphSet()
    hmtx = font['hmtx']
    order = font.getGlyphOrder()
    metrics = {name: hmtx[name] for name in order}

    def xmin(name):
        pen = BoundsPen(glyph_set)
        glyph_set[name].draw(pen)
        return pen.bounds[0] if pen.bounds else None

    new_adv = {name: adv for name, (adv, _) in metrics.items()}
    for i, name in enumerate(order):
        adv, _ = metrics[name]
        left = xmin(name)
        if left is None or adv == 0 or abs(left) < 0.001:
            continue
        # Décalage des contours vers la gauche (composants inclus, décomposés)
        pen = TTGlyphPen(glyph_set)
        glyph_set[name].draw(TransformPen(pen, Transform(1, 0, 0, 1, -left, 0)))
        glyf[name] = pen.glyph()
        new_adv[name] = adv - left
        if i > 0:
            new_adv[order[i - 1]] += left  # la marge passe sur le glyphe précédent (espacement inchangé)
        # lsb aligné sur la nouvelle position d'encre (xMin = 0) :
        # sinon les moteurs de rendu compensent l'écart lsb/xMin et replacent l'encre à l'ancienne position
        hmtx[name] = (int(round(new_adv[name])), 0)

    # avance uniquement : les lsb ont déjà été alignés sur la nouvelle encre au fil du passage
    for name in order:
        hmtx[name] = (int(round(new_adv[name])), hmtx[name][1])

    # hhea stocke des entiers : la police d'origine contient des valeurs flottantes, on arrondit
    hhea = font['hhea']
    for field in ('advanceWidthMax', 'minLeftSideBearing', 'minRightSideBearing', 'xMaxExtent'):
        value = getattr(hhea, field, None)
        if isinstance(value, float):
            setattr(hhea, field, int(round(value)))

    shutil.copyfile(path, path + '.bak')
    font.save(path)
    print(f'OK — {path} réécrit (sauvegarde : {path}.bak)')


if __name__ == '__main__':
    main(sys.argv[1])
