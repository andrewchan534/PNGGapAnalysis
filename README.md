# PNG Gap Analysis

Static deployment package for the Papua New Guinea biodiversity, Genesys PGR,
and climate gap-analysis dashboard.

This is a targeted vegetable genetic resources collecting-planning dashboard,
not an unbiased map of all PNG biodiversity. It screens pre-selected vegetable
crop, edible fern, and locally important food-plant taxa using target species,
genus-level `spp.` groups, and target families.

## Server Deployment

Place or pull this repository into the web root that serves
`https://genebank.worldveg.org/`, then copy the `PNGGapAnalysis/` folder into
the web root and open:

```text
https://genebank.worldveg.org/PNGGapAnalysis/
```

Direct file URL:

```text
https://genebank.worldveg.org/PNGGapAnalysis/PNGGapAnalysis.html
```

The dashboard expects these files and folders to stay together inside the
`PNGGapAnalysis/` folder:

- `index.html`
- `PNGGapAnalysis.html`
- `PNGGapAnalysis.app.js`
- `PNGGapAnalysis.styles.css`
- `data/`

The repository intentionally excludes the large WorldClim baseline source
archives and extracted baseline GeoTIFFs. The web app uses precomputed climate
change PNG overlays plus the CMIP6 future GeoTIFFs needed for the selectable
future climate layer.

See `PROJECT_NOTES.md` for the full screening preference, mapping logic,
weighted-priority method, and feature documentation.
