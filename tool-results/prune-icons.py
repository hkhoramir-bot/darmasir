"""ساخت زیرمجموعه Material Symbols — فقط آیکون‌های استفاده‌شده در متروجو
۱) از فونت کامل، لیکاچرهای غیرضروری حذف می‌شوند (فقط نام‌های آیکون‌های اپ می‌مانند)
۲) سپس pyftsubset روی نتیجه اجرا می‌شود تا گلیف‌های بلااستفاده هم حذف شوند
"""
from fontTools.ttLib import TTFont

SRC = "public/fonts/material-symbols-outlined.woff2"
PRUNED = "tool-results/material-pruned.woff2"

NAME_TO_CHAR = {
    "underscore": "_",
    "period": ".",
    "space": " ",
    "hyphen": "-",
    "digit_zero": "0",
    "digit_one": "1",
    "digit_two": "2",
    "digit_three": "3",
    "digit_four": "4",
    "digit_five": "5",
    "digit_six": "6",
    "digit_seven": "7",
    "digit_eight": "8",
    "digit_nine": "9",
}

with open("tool-results/icons-all.txt", encoding="utf-8") as fh:
    wanted = {line.strip() for line in fh if line.strip()}
print("wanted icons:", len(wanted))

font = TTFont(SRC)
gsub = font["GSUB"].table

def lig_string(components):
    chars = []
    for c in components:
        if len(c) == 1:
            chars.append(c)
        elif c in NAME_TO_CHAR:
            chars.append(NAME_TO_CHAR[c])
        else:
            return None  # جزء ناشناخته — حذف
    return "".join(chars)

kept, dropped = 0, 0
for lookup in gsub.LookupList.Lookup:
    for st in lookup.SubTable:
        inner = getattr(st, "ExtSubTable", st)
        if not hasattr(inner, "ligatures"):
            continue
        for first_key in list(inner.ligatures.keys()):
            rows = inner.ligatures[first_key]
            survivors = []
            for row in rows:
                # جزء اول لیکاچر کلید مجموعه است — باید به ابتدای زنجیره اضافه شود
                s = lig_string([first_key] + list(row.Component))
                if s is not None and s in wanted:
                    survivors.append(row)
                    kept += 1
                else:
                    dropped += 1
            if survivors:
                inner.ligatures[first_key] = survivors
            else:
                del inner.ligatures[first_key]

print(f"kept ligatures: {kept}, dropped: {dropped}")
missing = set()
# بررسی پوشش: هر آیکون درخواستی باید به‌عنوان لیکاچر باقی مانده باشد
for lookup in gsub.LookupList.Lookup:
    for st in lookup.SubTable:
        inner = getattr(st, "ExtSubTable", st)
        if not hasattr(inner, "ligatures"):
            continue
        for first_key, rows in inner.ligatures.items():
            for row in rows:
                s = lig_string(row.Component)
                if s:
                    wanted.discard(s)
print("missing after prune:", sorted(wanted) if wanted else "none — همه آیکون‌ها موجود ✓")

font.flavor = "woff2"
font.save(PRUNED)
print("pruned font saved:", PRUNED)
