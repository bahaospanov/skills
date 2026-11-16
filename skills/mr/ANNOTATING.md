# Annotating a shot

One call per shot crops it, outlines the change, numbers the markers and puts the band of notes on top. Coordinates are pixels of the cropped shot; an iPhone 17 screenshot is 1206 px wide, three pixels per point.

```zsh
# annotate <out> <shot> <crop WxH+X+Y> <before|after> <title> <outlines "x0,y0 x1,y1;…"> <markers "x,y;…"> <note>…
annotate() {
  local out=$1 shot=$2 crop=$3 side=$4 title=$5 outlines=$6 markers=$7; shift 7
  local font=${ANNOTATE_FONT:-/System/Library/Fonts/Supplemental/Arial Unicode.ttf}
  local bold=${ANNOTATE_BOLD:-/System/Library/Fonts/Supplemental/Arial Bold.ttf}
  local width=${crop%%x*} color='#0a84ff' dash=''
  [[ $side == before ]] && color='#e5484d' dash='stroke-dasharray 24 12 '
  local args=(-crop $crop +repage -fill none -stroke $color -strokewidth 8) n=1 x y outline marker
  for outline in ${(s:;:)outlines}; do args+=(-draw "${dash}rectangle $outline"); done
  for marker in ${(s:;:)markers}; do
    x=${marker%,*} y=${marker#*,}
    args+=(-stroke white -strokewidth 4 -fill $color -draw "circle $x,$y $((x + 30)),$y"
           -stroke none -fill white -font $bold -pointsize 40 -annotate +$((x - 11))+$((y + 14)) $((n++)))
  done
  local notes=() i=1 note; for note in "$@"; do notes+=("$((i++))  $note"); done
  magick \( -background white -fill $color -font $bold -pointsize 46 label:$title -bordercolor white -border 30x16 \) \
         \( -background white -fill '#1c1c1e' -font $font -pointsize 36 -size $((width - 80))x caption:${(F)notes} \
            -bordercolor white -border 40x10 \) \
         -gravity West -background white -extent ${width}x -append +gravity \
         \( $shot $args \) -append +repage $out
}
```

- The note font must cover the page's script: Arial Unicode reads Cyrillic and most others. Override it with `ANNOTATE_FONT`.
- Number the markers in the order the notes run, and place each beside the element its note names, in free space.
- Before uploading, check each pair side by side at half size, where a marker over a label or a note that wraps badly shows: `magick before.png after.png +append -resize 50% pair.png`.

An after shot from a Family-orbit change:

```zsh
annotate kairat-after.png raw-after.png 1206x1300+0+700 after "AFTER · this branch: the ex kind" \
  "500,180 1200,1150" "700,1060;1130,250" \
  "The ex-wives sit in the paler, dashed part of his pill; his wife stays in the solid part." \
  "Each wife has her own line to her children."
```
